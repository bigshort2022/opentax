import { form540InputSchema } from "./input.ts";

/** Synthetic workpaper facts, not a complete resident return. */
export const workpaperInput = form540InputSchema.parse({
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
