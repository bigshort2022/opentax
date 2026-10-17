import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  AcceptedFormClassification,
  Applicability,
  coverageAssessmentSchema,
  CoverageCapability,
  coverageRequirementSchema,
} from "../../../core/validation/coverage.ts";
import {
  assessCoverage,
  COVERAGE_INVENTORY,
  PredicateId,
  validateCoverageInventory,
} from "./coverage.ts";
import { form540InputSchema } from "./input.ts";

const input = form540InputSchema.parse({
  taxYear: 2025,
  residency: "full_year_ca",
  filingStatus: "single",
  federalAgi: 75_000,
  stateWages: 81_000,
  scheduleCaSubtractions: 1_000,
  scheduleCaAdditions: 200,
  usesItemizedDeductions: false,
  taxpayerCanBeClaimedAsDependent: false,
  personalExemptions: 1,
  blindExemptions: 0,
  seniorExemptions: 0,
  dependentExemptions: 0,
  line34SpecialTax: 0,
  line40ChildDependentCareCredit: 0,
  line45SpecialCredits: 0,
  line46RenterCredit: 0,
  line61AlternativeMinimumTax: 0,
  line62BehavioralHealthServicesTax: 0,
  line63OtherTaxes: 0,
  line95PaymentsAfterUseTaxAndPenalty: 4_000,
  review: {
    fullYearCaliforniaResidence: true,
    filingStatusEligibility: true,
    federalAndCaliforniaIncomeReconciled: true,
    standardDeductionEligibility: true,
    creditsAndTaxesReviewed: true,
    paymentsUseTaxAndPenaltyReviewed: true,
  },
});

function assessment(id: string, ...candidate: [] | [typeof input | undefined]) {
  const row = assessCoverage(candidate.length === 0 ? input : candidate[0])
    .find((row) => row.id === id);
  assert(row, `Missing requirement ${id}`);
  return row;
}

Deno.test("coverage rejects duplicate IDs and unknown predicates", () => {
  const row = COVERAGE_INVENTORY[0];
  assertThrows(() => validateCoverageInventory([row, row]));
  assertThrows(() =>
    validateCoverageInventory([{ ...row, predicateId: "dynamic()" }])
  );
});

Deno.test("coverage rejects missing provenance and unsupported evidence claims", () => {
  const row = COVERAGE_INVENTORY[0];
  assertThrows(() =>
    validateCoverageInventory([{ ...row, source: undefined }])
  );
  assertThrows(() =>
    validateCoverageInventory([{ ...row, source: { url: "", locator: "" } }])
  );
  for (
    const capability of [
      CoverageCapability.Computed,
      CoverageCapability.SuppliedInput,
    ]
  ) {
    assertThrows(() =>
      validateCoverageInventory([{
        ...row,
        capability,
        implementationRef: "calculation.ts#calculateForm540",
        scenarioEvidenceIds: [],
      }])
    );
    assertThrows(() =>
      validateCoverageInventory([{
        ...row,
        capability,
        implementationRef: null,
        scenarioEvidenceIds: ["workpaper-baseline"],
      }])
    );
  }
});

Deno.test("coverage schemas reject extra fields and unknown finite codes", () => {
  assertEquals(
    coverageRequirementSchema.safeParse({
      ...COVERAGE_INVENTORY[0],
      extra: true,
    }).success,
    false,
  );
  assertEquals(
    coverageRequirementSchema.safeParse({
      ...COVERAGE_INVENTORY[0],
      capability: "complete",
    }).success,
    false,
  );
  const row = assessment("ca540.line18.itemized_deduction");
  assertEquals(
    coverageAssessmentSchema.safeParse({ ...row, applicability: "optional" })
      .success,
    false,
  );
  assertEquals(
    coverageAssessmentSchema.safeParse({
      ...row,
      evidence: [{
        fact: "usesItemizedDeductions",
        decision: "false",
        rawValue: 123,
      }],
    }).success,
    false,
  );
});

Deno.test("explicit false applicability differs from unavailable facts", () => {
  const itemized = "ca540.line18.itemized_deduction";
  const dependent = "ca540.line18.dependent_standard_deduction";
  for (const id of [itemized, dependent]) {
    assertEquals(
      assessment(id, undefined).applicability,
      Applicability.Unknown,
    );
    assertEquals(assessment(id).applicability, Applicability.NotApplicable);
    assert(assessment(id).evidence.length > 0);
  }
  assertEquals(
    assessment(itemized, { ...input, usesItemizedDeductions: true })
      .applicability,
    Applicability.Required,
  );
  assertEquals(assessment(itemized).capability, CoverageCapability.Unsupported);
  assertEquals(
    assessment(dependent, { ...input, taxpayerCanBeClaimedAsDependent: true })
      .applicability,
    Applicability.Required,
  );
  assertEquals(
    assessment("ca540.line18.standard_deduction").applicability,
    Applicability.Required,
  );
  assertEquals(
    assessment("ca540.line18.standard_deduction", undefined).applicability,
    Applicability.Unknown,
  );
});

Deno.test("aggregate zeros and affirmative reviews never discharge source-reconciled schedules", () => {
  for (
    const id of [
      "accepted.form3506",
      "accepted.form3514",
      "accepted.schedule_p_540",
      "accepted.form3853",
      "accepted.schedule_ca_540",
    ]
  ) {
    const row = assessment(id);
    assertEquals(row.applicability, Applicability.Unknown);
    assertEquals(row.capability, CoverageCapability.Unsupported);
    assertEquals(row.predicateId, PredicateId.SourceFactsRequired);
  }
  // A required unsupported deduction remains visible; no calculated-line filter can drop it.
  const rows = assessCoverage({ ...input, usesItemizedDeductions: true });
  assertEquals(rows.length, COVERAGE_INVENTORY.length);
  assert(
    rows.some((row) =>
      row.id === "ca540.line18.itemized_deduction" &&
      row.applicability === Applicability.Required &&
      row.capability === CoverageCapability.Unsupported
    ),
  );
});

Deno.test("a required unsupported HOH schedule is retained without a computed form", () => {
  const id = "accepted.form3532";
  assertEquals(assessment(id, undefined).applicability, Applicability.Unknown);
  assertEquals(assessment(id).applicability, Applicability.NotApplicable);
  const required = assessment(id, {
    ...input,
    filingStatus: "head_of_household",
  });
  assertEquals(required.applicability, Applicability.Required);
  assertEquals(required.capability, CoverageCapability.Unsupported);
  assertEquals(required.implementationRef, null);
  assertEquals(required.scenarioEvidenceIds, []);
});

Deno.test("capability distinguishes supplied Schedule CA totals, computed deduction, unavailable official schema", () => {
  assertEquals(
    assessment("ca540.line14.schedule_ca_subtractions").capability,
    CoverageCapability.SuppliedInput,
  );
  assertEquals(
    assessment("ca540.line18.standard_deduction").capability,
    CoverageCapability.Computed,
  );
  assertEquals(
    assessment("ca540.mef_schema").capability,
    CoverageCapability.Unavailable,
  );
  assertEquals(
    assessment("ca540.mef_schema").applicability,
    Applicability.Required,
  );
  for (const row of validateCoverageInventory(COVERAGE_INVENTORY)) {
    if (
      row.capability === CoverageCapability.Computed ||
      row.capability === CoverageCapability.SuppliedInput
    ) {
      assert(row.scenarioEvidenceIds.length > 0);
      assert(row.implementationRef);
    }
  }
});

Deno.test("printed line groups and every accepted form retain classifications and multiplicity", () => {
  const accepted = COVERAGE_INVENTORY.filter((row) => row.acceptedForm);
  assertEquals(accepted.length, 65);
  assertEquals(
    new Set(accepted.map((row) => row.formRef)).size,
    accepted.length,
  );
  assertEquals(
    assessment("accepted.form540nr").applicability,
    Applicability.NotApplicable,
  );
  assertEquals(
    assessment("accepted.schedule_x").applicability,
    Applicability.NotApplicable,
  );
  assertEquals(
    assessment("accepted.schedule_r").acceptedForm?.classification,
    AcceptedFormClassification.Unknown,
  );
  for (
    const line of [
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      31,
      32,
      33,
      34,
      35,
      40,
      43,
      44,
      45,
      46,
      47,
      48,
      61,
      62,
      63,
      64,
      71,
      72,
      73,
      74,
      75,
      76,
      77,
      78,
      91,
      92,
      93,
      94,
      95,
      96,
      97,
      98,
      99,
      100,
      110,
      111,
      112,
      113,
      114,
      115,
      116,
      117,
    ]
  ) {
    assert(
      COVERAGE_INVENTORY.some((row) => row.locator.includes(`Line ${line}:`)),
      `Missing printed line ${line}`,
    );
  }
  for (
    const id of [
      "ca540.identity.taxpayer",
      "ca540.signatures",
      "ca540.attachments",
      "ca540.consent.organ_donor",
    ]
  ) assert(assessment(id));
});

Deno.test("coverage evidence records only safe fact names and explicit decisions", () => {
  const sentinel = 81_735_249;
  const result = assessCoverage({
    ...input,
    federalAgi: sentinel,
    stateWages: sentinel,
  });
  assertEquals(JSON.stringify(result).includes(String(sentinel)), false);
  for (const row of result) {
    assertEquals(coverageAssessmentSchema.safeParse(row).success, true);
  }
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result[0]));
  assert(Object.isFrozen(result[0].source));
  assert(Object.isFrozen(result[0].scenarioEvidenceIds));
  assert(Object.isFrozen(result[0].evidence));
  assert(Object.isFrozen(result[0].evidence[0]));
  assertEquals(COVERAGE_INVENTORY.some((row) => "applicability" in row), false);
});
