import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { FilingStatus } from "../../../../../types.ts";
import { form8962, inputSchema } from "./index.ts";

function compute(year: number, extra: Record<string, unknown>) {
  return form8962.compute({ taxYear: year, formType: "f1040" }, inputSchema.parse({
    fpl_region: "contiguous", filing_status: FilingStatus.Single,
    dependent_income_complete: true, household_size: 1,
    taxpayer_modified_agi: 27180, annual_premium: 6000,
    annual_slcsp: 6000, annual_aptc: 0, annual_line11_eligible: true,
    ...extra,
  }));
}

test("2023 one-month Marketplace reconciliation uses 2022 poverty line and monthly contribution", () => {
  const result = compute(2023, {
    annual_premium: 500, annual_slcsp: 500, annual_aptc: 400,
    annual_line11_eligible: false,
    monthly_premiums: [500, ...Array(11).fill(0)],
    monthly_slcsps: [500, ...Array(11).fill(0)],
    monthly_aptcs: [400, ...Array(11).fill(0)],
  });
  const form = result.outputs.find((o) => o.nodeType === "form8962")!.fields;
  assertEquals(form.federal_poverty_line, 13590);
  assertEquals(form.federal_poverty_pct, 200);
  assertEquals(form.applicable_figure, 0.02);
  assertEquals(result.outputs.find((o) => o.nodeType === "schedule3")!.fields.line9_premium_tax_credit, 55);
});

test("2021 received-or-approved unemployment caps PTC percentage at 133 without changing MAGI", () => {
  const result = compute(2021, {
    taxpayer_modified_agi: 60000,
    unemployment_compensation_2021: {
      recipient: "taxpayer", received_or_approved: true,
      source_reference: "synthetic state agency 2021 benefit determination",
      no_one_can_claim_recipient: true,
    },
  });
  const form = result.outputs.find((o) => o.nodeType === "form8962")!.fields;
  assertEquals(form.household_income, 60000);
  assertEquals(form.federal_poverty_pct, 133);
  assertEquals(form.applicable_figure, 0);
  assertEquals(form.unemployment_compensation_ind, true);
  assertEquals(result.outputs.find((o) => o.nodeType === "schedule3")!.fields.line9_premium_tax_credit, 6000);
});

test("unemployment PTC special rule rejects other years and unmarried spouse facts", () => {
  const evidence = { recipient: "taxpayer", received_or_approved: true, source_reference: "synthetic agency decision", no_one_can_claim_recipient: true };
  assertThrows(() => compute(2023, { unemployment_compensation_2021: evidence }), Error, "2021");
  assertThrows(() => compute(2021, { unemployment_compensation_2021: { ...evidence, recipient: "spouse" } }), Error, "joint");
});
