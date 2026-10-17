import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { PDFDocument } from "pdf-lib";
import { assessForm540 } from "./assessment.ts";
import { workpaperInput } from "./test-fixtures.ts";
import { buildWorksheetPdf } from "./worksheet.ts";

Deno.test("Form 540 worksheet keeps amounts and every readiness limitation visible", async () => {
  const assessment = assessForm540([{
    ...workpaperInput,
    review: {
      fullYearCaliforniaResidence: false,
      filingStatusEligibility: false,
      federalAndCaliforniaIncomeReconciled: false,
      standardDeductionEligibility: false,
      creditsAndTaxesReviewed: false,
      paymentsUseTaxAndPenaltyReviewed: false,
    },
  }]);
  const tmpDir = await Deno.makeTempDir();
  try {
    const pdfPath = `${tmpDir}/ca540-worksheet.pdf`;
    const bytes = await buildWorksheetPdf(assessment);
    await Deno.writeFile(pdfPath, bytes);
    const { code, stdout, stderr } = await new Deno.Command("pdftotext", {
      args: ["-layout", pdfPath, "-"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(code, 0, new TextDecoder().decode(stderr));
    const text = new TextDecoder().decode(stdout);
    assertStringIncludes(text, "Line 19 — Taxable income: $68,494");
    assertStringIncludes(text, "Line 31 — Tax: $2,864");
    assertStringIncludes(text, "Line 97 — Overpaid tax: $1,289");
    for (const finding of assessment.report.entries) {
      assertStringIncludes(text, finding.ruleNumber);
    }
    for (const coverage of assessment.report.coverage) {
      assertStringIncludes(text, coverage.id);
    }
    const document = await PDFDocument.load(bytes);
    const pages = text.split("\f").filter((page) => page.trim());
    assertEquals(pages.length, document.getPageCount());
    for (const page of pages) {
      assertStringIncludes(page, "Not e-fileable");
      assertStringIncludes(page, "Not an official Form 540");
    }
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("invalid input cannot produce a misleading worksheet", async () => {
  await assertRejects(() => buildWorksheetPdf(assessForm540([])), Error);
});
