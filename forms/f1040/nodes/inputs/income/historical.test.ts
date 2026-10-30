import { test } from "bun:test";
import { assertEquals } from "@std/assert";
import { w2, inputSchema as wageSchema } from "./wages/w2/index.ts";
import { f1099g, inputSchema as unemploymentSchema } from "./other/f1099g/index.ts";

for (const taxYear of [2021, 2022, 2023, 2024, 2025, 2026]) {
  test(`${taxYear} wages and unemployment retain source cents and separate income character`, () => {
    const wage = { employer_ein: "123456789", employee_ssn: "123456789", source_document_reference: `synthetic W2 ${taxYear}`, box1_wages: 14500.25, box2_fed_withheld: 1000.15 };
    const benefit = { payer_name: "Synthetic State Agency", payer_tin: "987654321", recipient_tin: "123456789", source_document_reference: `synthetic 1099G ${taxYear}`, box_1_unemployment: 10500.75, box_4_federal_withheld: 1050.25 };
    const wages = wageSchema.parse({ w2s: [wage] });
    const unemployment = unemploymentSchema.parse({ f1099gs: [benefit] });
    const before = structuredClone({ wages, unemployment });
    const ctx = { taxYear, formType: "f1040" };
    const wageResult = w2.compute(ctx, wages);
    const benefitResult = f1099g.compute(ctx, unemployment);
    assertEquals(wageResult.outputs.find((o) => o.nodeType === "agi_aggregator")!.fields.line1a_wages, 14500.25);
    assertEquals(wageResult.outputs.filter((o) => o.nodeType === "f1040").map((o) => o.fields.line25a_w2_withheld).find((amount) => amount !== undefined), 1000.15);
    // The 2020 unemployment exclusion does not apply to any supported return year.
    assertEquals(benefitResult.outputs.find((o) => o.nodeType === "schedule1")!.fields.line7_unemployment, 10500.75);
    assertEquals({ wages, unemployment }, before);
  });
}
