import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { createReturnCommand, getReturnCommand } from "./return.ts";
import { formAddCommand } from "./form.ts";
import { validateReturnCommand } from "./validate.ts";
import { exportMefCommand, exportPdfCommand } from "./export.ts";
import { isStateDiagnosticsReport } from "../../core/validation/state-report.ts";

Deno.test("CA Form 540 return routes through calculation, review, and worksheet export", async () => {
  const baseDir = await Deno.makeTempDir();
  try {
    const { returnId } = await createReturnCommand({
      year: 2025,
      formType: "ca540",
      baseDir,
    });
    await formAddCommand({
      returnId,
      nodeType: "ca540",
      baseDir,
      dataJson: JSON.stringify({
        taxYear: 2025,
        residency: "full_year_ca",
        filingStatus: "single",
        federalAgi: 75_000,
        stateWages: 81_000,
        scheduleCaSubtractions: 1_000,
        scheduleCaAdditions: 200,
        usesItemizedDeductions: false,
        personalExemptions: 1,
        blindExemptions: 0,
        seniorExemptions: 0,
        dependentExemptions: 0,
        taxpayerCanBeClaimedAsDependent: false,
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
      }),
    });

    const result = await getReturnCommand({ returnId, baseDir });
    assertEquals(result.lines.line19_taxable_income, 68_494);
    assertEquals(result.lines.line31_tax, 2_864);
    assertEquals(result.lines.line97_overpaid_tax, 1_289);
    assertEquals(result.warnings.length, 0);

    const validation = await validateReturnCommand({ returnId, baseDir });
    assertEquals(validation.report.canFile, false);
    assert(isStateDiagnosticsReport(validation.report));
    assertEquals(validation.report.readiness.status, "blocked");
    assertEquals(
      validation.report.gates.find((gate) => gate.id === "mef_schema")?.status,
      "unavailable",
    );
    const text = await validateReturnCommand({
      returnId,
      baseDir,
      format: "text",
    });
    for (const gate of validation.report.gates) {
      assertStringIncludes(text.formatted, `${gate.id}: ${gate.status}`);
    }
    assertEquals(
      validation.report.entries.map((entry) => entry.ruleNumber).sort(),
      [
        "CA540_LOCAL_RULES_UNAVAILABLE",
        "CA540_MEF_SCHEMA_UNAVAILABLE",
        "CA540_REQUIRED_DOCUMENTS_UNKNOWN",
        "CA540_SCOPE_NOT_FILING_READY",
      ],
    );

    for (
      const flags of [{}, { force: true }, { draft: true }, {
        force: true,
        draft: true,
      }]
    ) {
      const mefError = await assertRejects(
        () => exportMefCommand({ returnId, baseDir, ...flags }),
        Error,
      );
      assertEquals(
        mefError.message,
        "MeF export is not available for California Form 540",
      );
    }
    const outputPath = await exportPdfCommand({ returnId, baseDir });
    const { code, stdout } = await new Deno.Command("pdftotext", {
      args: [outputPath, "-"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(code, 0);
    assertStringIncludes(
      new TextDecoder().decode(stdout),
      "Not an official Form 540",
    );
  } finally {
    await Deno.remove(baseDir, { recursive: true });
  }
});

Deno.test("CA missing input produces diagnostics without fabricated output or replacement", async () => {
  const baseDir = await Deno.makeTempDir();
  try {
    const { returnId } = await createReturnCommand({
      year: 2025,
      formType: "ca540",
      baseDir,
    });
    const { report } = await validateReturnCommand({ returnId, baseDir });
    assertEquals(report.canFile, false);
    assertEquals(
      report.entries.some((entry) => entry.ruleNumber === "CA540_INPUT_COUNT"),
      true,
    );
    await assertRejects(() => getReturnCommand({ returnId, baseDir }), Error);
    const outputPath = `${baseDir}/preserved.pdf`;
    await Deno.writeTextFile(outputPath, "existing-output");
    await assertRejects(
      () => exportPdfCommand({ returnId, baseDir, outputPath }),
      Error,
    );
    assertEquals(await Deno.readTextFile(outputPath), "existing-output");
  } finally {
    await Deno.remove(baseDir, { recursive: true });
  }
});
