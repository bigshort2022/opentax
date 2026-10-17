import { assertEquals, assertStringIncludes } from "@std/assert";
import { calculateForm540 } from "./calculation.ts";
import { form540InputSchema } from "./input.ts";
import { buildWorksheetPdf } from "./worksheet.ts";

const input = form540InputSchema.parse({
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
});

Deno.test("Form 540 worksheet exposes calculated lines and filing limits", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const pdfPath = `${tmpDir}/ca540-worksheet.pdf`;
    await Deno.writeFile(
      pdfPath,
      await buildWorksheetPdf(calculateForm540(input)),
    );
    const { code, stdout, stderr } = await new Deno.Command("pdftotext", {
      args: [pdfPath, "-"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(code, 0, new TextDecoder().decode(stderr));
    const text = new TextDecoder().decode(stdout);
    assertStringIncludes(
      text,
      "California Form 540 TY2025 preparation worksheet",
    );
    assertStringIncludes(text, "Not an official Form 540");
    assertStringIncludes(text, "Not e-fileable");
    assertStringIncludes(text, "Line 19 — Taxable income: $68,494");
    assertStringIncludes(text, "Line 31 — Tax: $2,864");
    assertStringIncludes(text, "Line 97 — Overpaid tax: $1,289");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
