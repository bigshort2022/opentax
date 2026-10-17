import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { StateFormCalculation } from "../../../core/types/form-definition.ts";

function formatDollars(amount: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
  return amount < 0 ? `($${formatted})` : `$${formatted}`;
}
const LINE_LABELS: Readonly<Record<string, string>> = {
  line12_state_wages: "Line 12 — California wages",
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

function worksheetRows(calculation: StateFormCalculation): string[] {
  const lineRows = Object.entries(calculation.lines).map(([line, amount]) =>
    `${LINE_LABELS[line] ?? line}: ${formatDollars(amount)}`
  );
  const blockers = calculation.blockers.length > 0
    ? calculation.blockers.map((blocker) => `BLOCKER: ${blocker}`)
    : ["No blockers recorded by this limited arithmetic tool."];
  return [
    "California Form 540 TY2025 preparation worksheet",
    "Not an official Form 540. Not e-fileable. Not a filing-readiness determination.",
    "Manual review and transfer to the official FTB forms are required.",
    "This workpaper does not verify filing status, residency, supporting forms, or legal eligibility.",
    "",
    "Form 540 line calculations",
    ...lineRows,
    "",
    "Review blockers",
    ...blockers,
    "",
    "Primary sources:",
    "https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html",
    "https://www.ftb.ca.gov/forms/2025/2025-540-ca-instructions.html",
    "https://www.ftb.ca.gov/forms/2025/2025-540-taxtable.pdf",
    "https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf",
  ];
}

export async function buildWorksheetPdf(
  calculation: StateFormCalculation,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const rows = worksheetRows(calculation);
  const page = document.addPage([612, 792]);
  let y = 750;
  for (const row of rows) {
    if (!row) {
      y -= 9;
      continue;
    }
    const isTitle = row === rows[0];
    page.drawText(row, {
      x: 42,
      y,
      size: isTitle ? 15 : row.startsWith("Primary sources") ? 8 : 9,
      font: isTitle ? bold : font,
      color: isTitle ? rgb(0, 0, 0) : rgb(0.12, 0.12, 0.12),
      maxWidth: 528,
      lineHeight: 12,
    });
    y -= isTitle ? 22 : 15;
  }
  return await document.save();
}
