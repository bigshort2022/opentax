import { PDFDocument, StandardFonts } from "pdf-lib";
import type { FilerIdentity } from "../../../../../../mef/header.ts";

export function foreignCountryPrintFields(
  names: readonly string[],
  lineCount: 1 | 2 = 2,
): Record<string, string> {
  if (names.length === 0) return {};
  if (lineCount === 1) {
    const joined = names.join(", ");
    return { print_foreign_country_line1: joined.length <= 45 ? joined : "See attached country statement" };
  }
  if (
    names.length <= 2 && names[0].length <= 45 &&
    (names[1]?.length ?? 0) <= 70
  ) {
    return {
      print_foreign_country_line1: names[0],
      ...(names[1] ? { print_foreign_country_line2: names[1] } : {}),
    };
  }
  return { print_foreign_country_line1: "See attached country statement" };
}

export async function appendScheduleBForeignCountriesStatement(
  document: PDFDocument,
  fields: Record<string, unknown>,
  filer: FilerIdentity | undefined,
  taxYear: number,
): Promise<void> {
  const names = fields.foreign_country_names;
  if (!Array.isArray(names) || names.length === 0) return;
  if (names.some((name) => typeof name !== "string" || !name.trim())) {
    throw new Error("Schedule B foreign country names must be nonempty");
  }
  if (foreignCountryPrintFields(names, taxYear === 2021 ? 1 : 2)
    .print_foreign_country_line1 !== "See attached country statement") return;
  if (!filer) {
    throw new Error("Schedule B country statement needs filer identity");
  }

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([612, 792]);
  page.drawText(`Schedule B (Form 1040) ${taxYear} - Foreign Countries`, {
    x: 36,
    y: 748,
    size: 11,
    font: bold,
  });
  page.drawText(`Name: ${filer.nameLine1}`, {
    x: 36,
    y: 728,
    size: 9,
    font: regular,
  });
  page.drawText(`SSN: ${filer.primarySSN}`, {
    x: 36,
    y: 711,
    size: 9,
    font: regular,
  });
  page.drawText(
    "Part III, line 7b - countries with foreign financial accounts",
    {
      x: 36,
      y: 680,
      size: 9,
      font: bold,
    },
  );
  names.forEach((name, index) => {
    if (name.length > 90) {
      throw new Error("Schedule B foreign country name is too long");
    }
    page.drawText(`${index + 1}. ${name}`, {
      x: 36,
      y: 653 - index * 20,
      size: 9,
      font: regular,
    });
  });
}
