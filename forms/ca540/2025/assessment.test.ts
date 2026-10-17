import { assertEquals, assertFalse } from "@std/assert";
import {
  GateId,
  GateStatus,
  LocalReadiness,
} from "../../../core/validation/readiness.ts";
import { assessForm540 } from "./assessment.ts";
import { workpaperInput } from "./test-fixtures.ts";

Deno.test("valid workpaper has arithmetic evidence but no filing readiness", () => {
  const { calculation, report } = assessForm540([workpaperInput]);
  assertEquals(calculation?.lines.line19_taxable_income, 68_494);
  assertEquals(calculation?.lines.line31_tax, 2_864);
  assertEquals(report.validationScope, "ca540-workpaper");
  assertEquals(report.canFile, false);
  assertEquals(report.readiness.status, LocalReadiness.Blocked);
  assertEquals(
    Object.fromEntries(report.gates.map((gate) => [gate.id, gate.status])),
    {
      [GateId.Scope]: GateStatus.Unsupported,
      [GateId.Inputs]: GateStatus.Passed,
      [GateId.Calculation]: GateStatus.Passed,
      [GateId.Review]: GateStatus.Passed,
      [GateId.RequiredDocuments]: GateStatus.NotRun,
      [GateId.MefSchema]: GateStatus.Unavailable,
      [GateId.LocalRules]: GateStatus.Unavailable,
    },
  );
  assertEquals(report.documents, {
    requirementsKnown: false,
    required: [],
    produced: [],
  });
  assertEquals(report.entries.map((entry) => entry.ruleNumber).sort(), [
    "CA540_LOCAL_RULES_UNAVAILABLE",
    "CA540_MEF_SCHEMA_UNAVAILABLE",
    "CA540_REQUIRED_DOCUMENTS_UNKNOWN",
    "CA540_SCOPE_NOT_FILING_READY",
  ]);
  assertEquals(report.summary.total, report.gates.length);
  assertEquals(
    report.summary.passed + report.summary.rejected + report.summary.alerts +
      report.summary.skipped,
    report.summary.total,
  );
  assertEquals(report.externalChecks.map((check) => check.status), [
    "unverified",
    "unverified",
    "unverified",
  ]);
});

Deno.test("missing duplicate or malformed CA inputs cannot yield calculations", () => {
  for (
    const input of [[], [workpaperInput, workpaperInput], [{
      ...workpaperInput,
      federalAgi: "PRIVATE_SENTINEL",
    }], [{ ...workpaperInput, review: {} }]]
  ) {
    const result = assessForm540(input);
    assertEquals(result.calculation, undefined);
    assertEquals(result.report.canFile, false);
    assertEquals(
      result.report.gates.find((gate) => gate.id === GateId.Inputs)?.status,
      GateStatus.Failed,
    );
    assertEquals(
      result.report.gates.find((gate) => gate.id === GateId.Calculation)
        ?.status,
      GateStatus.NotRun,
    );
    assertFalse(JSON.stringify(result).includes("PRIVATE_SENTINEL"));
  }
});

Deno.test("stable review codes survive removal of an earlier finding", () => {
  const input = {
    ...workpaperInput,
    review: {
      ...workpaperInput.review,
      fullYearCaliforniaResidence: false,
      paymentsUseTaxAndPenaltyReviewed: false,
    },
  };
  const before = assessForm540([input]);
  const after = assessForm540([{
    ...input,
    review: { ...input.review, fullYearCaliforniaResidence: true },
  }]);
  assertEquals(
    before.report.entries.some((entry) =>
      entry.ruleNumber === "CA540_REVIEW_RESIDENCY"
    ),
    true,
  );
  assertEquals(
    after.report.entries.some((entry) =>
      entry.ruleNumber === "CA540_REVIEW_RESIDENCY"
    ),
    false,
  );
  for (const result of [before, after]) {
    assertEquals(
      result.report.entries.some((entry) =>
        entry.ruleNumber === "CA540_REVIEW_PAYMENTS"
      ),
      true,
    );
    assertEquals(
      result.report.gates.find((gate) => gate.id === GateId.Review)?.status,
      GateStatus.Failed,
    );
  }
});

Deno.test("unsupported taxpayer assumptions remain specifically diagnosed", () => {
  const result = assessForm540([{
    ...workpaperInput,
    residency: "part_year_ca",
    usesItemizedDeductions: true,
    taxpayerCanBeClaimedAsDependent: true,
  }]);
  const codes = result.report.entries.map((entry) => entry.ruleNumber);
  for (
    const code of [
      "CA540_RESIDENCY_UNSUPPORTED",
      "CA540_DEDUCTIONS_ITEMIZED_UNSUPPORTED",
      "CA540_DEDUCTION_DEPENDENT_UNSUPPORTED",
    ]
  ) {
    assertEquals(codes.includes(code), true);
  }
  assertEquals(result.report.canFile, false);
  assertEquals(
    result.report.gates.find((gate) => gate.id === GateId.RequiredDocuments)
      ?.status,
    GateStatus.Unsupported,
  );
});

Deno.test("valid zero facts are distinct from missing facts", () => {
  const result = assessForm540([{
    ...workpaperInput,
    federalAgi: 0,
    stateWages: 0,
    scheduleCaSubtractions: 0,
    scheduleCaAdditions: 0,
    line95PaymentsAfterUseTaxAndPenalty: 0,
  }]);
  assertEquals(result.calculation?.lines.line19_taxable_income, 0);
  assertEquals(result.calculation?.lines.line31_tax, 0);
  assertEquals(
    result.report.gates.find((gate) => gate.id === GateId.Inputs)?.status,
    GateStatus.Passed,
  );
  assertEquals(result.report.canFile, false);
});

Deno.test("unsafe arithmetic is a failed gate without calculated values", () => {
  for (
    const change of [
      { personalExemptions: Number.MAX_SAFE_INTEGER },
      {
        federalAgi: Number.MAX_SAFE_INTEGER,
        scheduleCaSubtractions: -Number.MAX_SAFE_INTEGER,
      },
    ]
  ) {
    const { calculation, report } = assessForm540([{
      ...workpaperInput,
      ...change,
    }]);
    assertEquals(calculation, undefined);
    assertEquals(report.canFile, false);
    assertEquals(
      report.gates.find((gate) => gate.id === GateId.Calculation)?.status,
      GateStatus.Failed,
    );
    assertEquals(
      report.entries.some((finding) =>
        finding.ruleNumber === "CA540_CALCULATION_RANGE"
      ),
      true,
    );
    assertFalse(
      JSON.stringify(report).includes(String(Number.MAX_SAFE_INTEGER)),
    );
  }
});

Deno.test("invalid facts identify schema-owned fields without echoing unknown keys", () => {
  const badAmount = assessForm540([{
    ...workpaperInput,
    federalAgi: "PRIVATE_SENTINEL",
  }]);
  assertEquals(
    badAmount.report.entries.find((finding) =>
      finding.ruleNumber === "CA540_INPUT_INVALID"
    )?.field,
    "federalAgi",
  );
  const badReview = assessForm540([{ ...workpaperInput, review: {} }]);
  assertEquals(
    badReview.report.entries.some((finding) =>
      finding.field === "review.fullYearCaliforniaResidence"
    ),
    true,
  );
  const badKey = assessForm540([{
    ...workpaperInput,
    PRIVATE_FIELD_SENTINEL: "PRIVATE_SENTINEL",
  }]);
  assertEquals(
    badKey.report.entries.find((finding) =>
      finding.ruleNumber === "CA540_INPUT_INVALID"
    )?.field,
    "ca540",
  );
  assertFalse(JSON.stringify(badKey.report).includes("PRIVATE_FIELD_SENTINEL"));
  assertFalse(JSON.stringify(badAmount.report).includes("PRIVATE_SENTINEL"));
});

Deno.test("each required review answer independently blocks its review gate", () => {
  const checks = [
    ["fullYearCaliforniaResidence", "CA540_REVIEW_RESIDENCY"],
    ["filingStatusEligibility", "CA540_REVIEW_FILING_STATUS"],
    [
      "federalAndCaliforniaIncomeReconciled",
      "CA540_REVIEW_INCOME_RECONCILIATION",
    ],
    ["standardDeductionEligibility", "CA540_REVIEW_STANDARD_DEDUCTION"],
    ["creditsAndTaxesReviewed", "CA540_REVIEW_CREDITS_TAXES"],
    ["paymentsUseTaxAndPenaltyReviewed", "CA540_REVIEW_PAYMENTS"],
  ] as const;
  for (const [field, code] of checks) {
    const { report } = assessForm540([{
      ...workpaperInput,
      review: { ...workpaperInput.review, [field]: false },
    }]);
    assertEquals(
      report.entries.some((finding) => finding.ruleNumber === code),
      true,
    );
    assertEquals(
      report.gates.find((gate) => gate.id === GateId.Review)?.status,
      GateStatus.Failed,
    );
    assertEquals(report.canFile, false);
  }
});

Deno.test("nonresident facts do not enter resident return scope", () => {
  const { report } = assessForm540([{
    ...workpaperInput,
    residency: "nonresident_ca",
  }]);
  assertEquals(
    report.entries.some((finding) =>
      finding.ruleNumber === "CA540_RESIDENCY_UNSUPPORTED"
    ),
    true,
  );
  assertEquals(
    report.gates.find((gate) => gate.id === GateId.Scope)?.status,
    GateStatus.Unsupported,
  );
  assertEquals(report.canFile, false);
});
