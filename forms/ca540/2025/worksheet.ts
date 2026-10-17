import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import type { StateAssessment } from "../../../core/validation/state-report.ts";

function formatDollars(amount: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
  return amount < 0 ? `($${formatted})` : `$${formatted}`;
}
const LINE_LABELS: Readonly<Record<string, string>> = {
  line12_state_wages: "Line 12 — State wages (all states)",
  line13_federal_agi: "Line 13 — Federal AGI",
  line14_ca_subtractions: "Line 14 — Schedule CA subtractions",
  line15_subtotal: "Line 15 — AGI after subtractions",
  line16_ca_additions: "Line 16 — Schedule CA additions",
  line17_ca_agi: "Line 17 — California AGI",
  line18_standard_deduction: "Line 18 — Standard deduction",
  line19_taxable_income: "Line 19 — Taxable income",
  line31_tax: "Line 31 — Tax",
  line32_exemption_credits: "Line 32 — Exemption credits",
  line33_tax_after_exemption_credits: "Line 33 — Tax after exemption credits",
  line34_special_tax: "Line 34 — Special tax",
  line35_tax_before_other_credits: "Line 35 — Tax before other credits",
  line40_child_dependent_care_credit:
    "Line 40 — Child and dependent care credit",
  line45_special_credits: "Line 45 — Special credits",
  line46_renter_credit: "Line 46 — Renter credit",
  line47_nonrefundable_credits: "Line 47 — Nonrefundable credits",
  line48_tax_after_nonrefundable_credits: "Line 48 — Tax after credits",
  line61_alternative_minimum_tax: "Line 61 — Alternative minimum tax",
  line62_behavioral_health_services_tax:
    "Line 62 — Behavioral health services tax",
  line63_other_taxes: "Line 63 — Other taxes",
  line64_total_tax: "Line 64 — Total tax",
  line95_payments_after_use_tax_and_penalty:
    "Line 95 — Payments after use tax and penalty",
  line97_overpaid_tax: "Line 97 — Overpaid tax",
  line100_tax_due: "Line 100 — Tax due",
};

function worksheetRows(assessment: StateAssessment): string[] {
  const { calculation, report } = assessment;
  if (!calculation) {
    throw new Error("California workpaper calculation is unavailable.");
  }
  return [
    "This workpaper does not verify complete return facts, supporting forms, or legal eligibility.",
    "",
    "Form 540 line calculations:",
    ...Object.entries(calculation.lines).map(([line, amount]) =>
      `${LINE_LABELS[line] ?? line}: ${formatDollars(amount)}`
    ),
    "",
    `Local readiness: ${report.readiness.status}; canFile: ${report.canFile}`,
    "Local gates (not counts of official tax rules):",
    ...report.gates.map((gate) => `${gate.id}: ${gate.status}`),
    "",
    "Readiness findings:",
    ...report.entries.map((finding) =>
      `[${finding.ruleNumber}] ${finding.message}`
    ),
    "",
    "Coverage (capability / applicability):",
    ...report.coverage.flatMap((item) => [
      `${item.id}: ${item.capability} / ${item.applicability}`,
      `${item.formRef} — ${item.locator}`,
      ...item.evidence.map((evidence) =>
        `${evidence.fact}: ${evidence.decision}`
      ),
    ]),
    "",
    "External checks:",
    ...report.externalChecks.map((check) =>
      `${check.id}: ${check.status}. ${check.message}`
    ),
    "",
    "Primary sources:",
    ...new Set(report.coverage.map((item) => item.source.url)),
  ];
}

function wrapRow(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (font.widthOfTextAtSize(line + character, size) > width) {
        lines.push(line);
        line = character;
      } else line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildWorksheetPdf(
  assessment: StateAssessment,
): Promise<Uint8Array> {
  const rows = worksheetRows(assessment);
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([612, 792]);
  let y = 696;
  const drawHeader = () => {
    page.drawText("California Form 540 TY2025 preparation worksheet", {
      x: 42,
      y: 750,
      font: bold,
      size: 14,
    });
    page.drawText("Not an official Form 540. Not e-fileable.", {
      x: 42,
      y: 730,
      font: bold,
      size: 9,
    });
    page.drawText(
      "Not a filing-readiness determination. No submission or payment authorization.",
      {
        x: 42,
        y: 715,
        font,
        size: 9,
      },
    );
  };
  drawHeader();
  for (const row of rows) {
    if (!row) {
      y -= 8;
      continue;
    }
    for (const line of wrapRow(row, font, 9, 528)) {
      if (y < 48) {
        page = document.addPage([612, 792]);
        y = 696;
        drawHeader();
      }
      page.drawText(line, {
        x: 42,
        y,
        font,
        size: 9,
        color: rgb(0.12, 0.12, 0.12),
      });
      y -= 13;
    }
  }
  return await document.save();
}
