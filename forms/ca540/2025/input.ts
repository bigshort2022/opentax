import { z } from "zod";
const wholeDollars = z.number().int().refine(Number.isSafeInteger);
const positiveDollars = z.number().int().min(0).refine(Number.isSafeInteger);

export const form540InputSchema = z.object({
  taxYear: z.literal(2025),
  residency: z.enum(["full_year_ca", "part_year_ca", "nonresident_ca"]),
  filingStatus: z.enum([
    "single",
    "joint",
    "separate",
    "head_of_household",
    "qualifying_surviving_spouse",
  ]),
  federalAgi: wholeDollars,
  stateWages: positiveDollars,
  scheduleCaSubtractions: wholeDollars,
  scheduleCaAdditions: wholeDollars,
  usesItemizedDeductions: z.boolean(),
  personalExemptions: positiveDollars,
  blindExemptions: positiveDollars,
  seniorExemptions: positiveDollars,
  dependentExemptions: positiveDollars,
  taxpayerCanBeClaimedAsDependent: z.boolean(),
  line34SpecialTax: positiveDollars,
  line40ChildDependentCareCredit: positiveDollars,
  line45SpecialCredits: positiveDollars,
  line46RenterCredit: positiveDollars,
  line61AlternativeMinimumTax: positiveDollars,
  line62BehavioralHealthServicesTax: positiveDollars,
  line63OtherTaxes: positiveDollars,
  line95PaymentsAfterUseTaxAndPenalty: positiveDollars,
  review: z.object({
    fullYearCaliforniaResidence: z.boolean(),
    filingStatusEligibility: z.boolean(),
    federalAndCaliforniaIncomeReconciled: z.boolean(),
    standardDeductionEligibility: z.boolean(),
    creditsAndTaxesReviewed: z.boolean(),
    paymentsUseTaxAndPenaltyReviewed: z.boolean(),
  }).strict(),
}).strict();

export type Form540Input = z.infer<typeof form540InputSchema>;
