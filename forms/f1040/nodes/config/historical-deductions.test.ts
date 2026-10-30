import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { FilingStatus } from "../types.ts";
import { scheduleA } from "../inputs/deductions/itemized/schedule_a/index.ts";
import { form8995 } from "../intermediate/forms/deductions/business/form8995/index.ts";
import { standard_deduction } from "../intermediate/worksheets/deductions/standard/standard_deduction/index.ts";

const context = { taxYear: 2021, formType: "f1040" };

test("2021 nonitemizer charity reduces both taxable income and the QBI income cap", () => {
  const gifts = scheduleA.compute(context, {
    filing_status: FilingStatus.Single, agi: 20_000,
    cash_contributions_to_50_percent_organizations: 500,
    cash_contributions_to_daf_or_supporting_organizations: 0,
  });
  const qbiSource = gifts.outputs.find((o) => o.nodeType === "form8995")?.fields;
  assertEquals(qbiSource?.nonitemizer_charitable_cash, 500);
  const qbi = form8995.compute(context, {
    ...qbiSource, qbi_from_schedule_c: 20_000,
    filing_status: FilingStatus.Single, agi: 20_000,
  });
  // 20% * ($20,000 - $12,550 - $300).
  assertEquals(qbi.outputs.find((o) => o.nodeType === "f1040")?.fields.line13_qbi_deduction, 1430);
  const result = standard_deduction.compute(context, {
    filing_status: FilingStatus.Single, agi: 20_000,
    nonitemizer_charitable_cash: 500, qbi_deduction: 1430,
  });
  assertEquals(result.outputs.find((o) => o.nodeType === "f1040" && o.fields.line15_taxable_income !== undefined)?.fields.line15_taxable_income, 5720);
});

test("historical itemized SALT cap is $10,000 or $5,000 MFS without an AGI phaseout", () => {
  for (const year of [2021, 2022, 2023, 2024]) {
    for (const [status, expected] of [[FilingStatus.Single, 10000], [FilingStatus.MFS, 5000]] as const) {
      const result = scheduleA.compute({ ...context, taxYear: year }, {
        filing_status: status, agi: 900_000, line_5a_state_income_tax: 30_000,
      });
      assertEquals(result.outputs.find((o) => o.nodeType === "standard_deduction")?.fields.itemized_taxes, expected);
    }
  }
});

test("2021 elected qualified cash is allowed after other charitable deductions up to AGI", () => {
  const result = scheduleA.compute(context, {
    filing_status: FilingStatus.Single, agi: 100_000,
    cash_contributions_to_50_percent_organizations: 120_000,
    cash_contributions_to_daf_or_supporting_organizations: 0,
    qualified_cash_contributions_2021: {
      amount: 120_000, eligible_public_charity_cash_verified: true,
      election_confirmed: true, source_reference: "Synthetic public-charity receipts",
    },
  });
  assertEquals(result.finalizations?.[0].fields.line_11_cash_contributions, 100000);
  assertEquals(result.carryforwards?.charitable_cash_60_2021, 20000);
  assertThrows(() => scheduleA.compute({ ...context, taxYear: 2022 }, {
    filing_status: FilingStatus.Single, agi: 100_000,
    cash_contributions_to_50_percent_organizations: 50_000,
    qualified_cash_contributions_2021: {
      amount: 50_000, eligible_public_charity_cash_verified: true,
      election_confirmed: true, source_reference: "Synthetic public-charity receipts",
    },
  }));
});
