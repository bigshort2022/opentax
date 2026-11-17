import { test } from "bun:test";
import { assertEquals } from "@std/assert";
import { calculateForm540 } from "./calculation.ts";
import { form540InputSchema } from "./input.ts";

const simpleInput = {
  taxYear: 2025,
  residency: "full_year_ca",
  filingStatus: "single",
  federalAgi: 75_000,
  stateWages: 81_000,
  scheduleCaSubtractions: 1_000,
  scheduleCaAdditions: 200,
  personalExemptions: 1,
  blindExemptions: 0,
  seniorExemptions: 0,
  dependentExemptions: 0,
  usesItemizedDeductions: false,
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
} as const;

test("Form 540 computes CA AGI, standard deduction, tax, credits, and balance", () => {
  const input = form540InputSchema.parse(simpleInput);
  const result = calculateForm540(input);
  assertEquals(result.lines.line12_state_wages, 81_000);
  assertEquals(result.lines.line13_federal_agi, 75_000);
  assertEquals(result.lines.line14_ca_subtractions, 1_000);
  assertEquals(result.lines.line15_subtotal, 74_000);
  assertEquals(result.lines.line16_ca_additions, 200);
  assertEquals(result.lines.line17_ca_agi, 74_200);
  assertEquals(result.lines.line18_standard_deduction, 5_706);
  assertEquals(result.lines.line19_taxable_income, 68_494);
  assertEquals(result.lines.line31_tax, 2_864);
  assertEquals(result.lines.line32_exemption_credits, 153);
  assertEquals(result.lines.line33_tax_after_exemption_credits, 2_711);
  assertEquals(result.lines.line64_total_tax, 2_711);
  assertEquals(result.lines.line95_payments_after_use_tax_and_penalty, 4_000);
  assertEquals(result.lines.line97_overpaid_tax, 1_289);
  assertEquals(result.lines.line100_tax_due, 0);
  assertEquals(result.findings, []);
});

test("Form 540 taxable income does not become negative", () => {
  const input = form540InputSchema.parse({
    ...simpleInput,
    federalAgi: 0,
    stateWages: 0,
    scheduleCaSubtractions: 0,
    scheduleCaAdditions: 0,
    line95PaymentsAfterUseTaxAndPenalty: 0,
  });
  const result = calculateForm540(input);
  assertEquals(result.lines.line19_taxable_income, 0);
  assertEquals(result.lines.line31_tax, 0);
});
