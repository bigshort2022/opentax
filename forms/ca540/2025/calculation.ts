import type { StateCalculation } from "../../../core/validation/state-report.ts";
import { calculateExemptionCredit } from "./credits.ts";
import { reviewFindings } from "./diagnostics.ts";
import type { Form540Input } from "./input.ts";
import { calculateOrdinaryTax } from "./tax.ts";

function wholeDollarAmount(value: number, description: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${description} is outside the safe whole-dollar range`,
    );
  }
  return value;
}

function standardDeduction(
  filingStatus: Form540Input["filingStatus"],
): number {
  switch (filingStatus) {
    case "single":
    case "separate":
      return 5_706;
    case "joint":
    case "head_of_household":
    case "qualifying_surviving_spouse":
      return 11_412;
  }
}

export function calculateForm540(input: Form540Input): StateCalculation {
  const line15 = wholeDollarAmount(
    input.federalAgi - input.scheduleCaSubtractions,
    "Form 540 line 15",
  );
  const line17 = wholeDollarAmount(
    line15 + input.scheduleCaAdditions,
    "Form 540 line 17",
  );
  const line19 = Math.max(line17 - standardDeduction(input.filingStatus), 0);
  const line31 = calculateOrdinaryTax(line19, input.filingStatus);
  const line32 = calculateExemptionCredit({
    filingStatus: input.filingStatus,
    federalAgi: input.federalAgi,
    personalExemptions: input.personalExemptions,
    blindExemptions: input.blindExemptions,
    seniorExemptions: input.seniorExemptions,
    dependentExemptions: input.dependentExemptions,
  });
  const line33 = Math.max(line31 - line32, 0);
  const line35 = wholeDollarAmount(
    line33 + input.line34SpecialTax,
    "Form 540 line 35",
  );
  const line47 = wholeDollarAmount(
    input.line40ChildDependentCareCredit + input.line45SpecialCredits +
      input.line46RenterCredit,
    "Form 540 line 47",
  );
  const line48 = Math.max(line35 - line47, 0);
  const line64 = wholeDollarAmount(
    line48 + input.line61AlternativeMinimumTax +
      input.line62BehavioralHealthServicesTax + input.line63OtherTaxes,
    "Form 540 line 64",
  );
  const line95 = input.line95PaymentsAfterUseTaxAndPenalty;

  return {
    lines: {
      line12_state_wages: input.stateWages,
      line13_federal_agi: input.federalAgi,
      line14_ca_subtractions: input.scheduleCaSubtractions,
      line15_subtotal: line15,
      line16_ca_additions: input.scheduleCaAdditions,
      line17_ca_agi: line17,
      line18_standard_deduction: standardDeduction(input.filingStatus),
      line19_taxable_income: line19,
      line31_tax: line31,
      line32_exemption_credits: line32,
      line33_tax_after_exemption_credits: line33,
      line34_special_tax: input.line34SpecialTax,
      line35_tax_before_other_credits: line35,
      line40_child_dependent_care_credit: input.line40ChildDependentCareCredit,
      line45_special_credits: input.line45SpecialCredits,
      line46_renter_credit: input.line46RenterCredit,
      line47_nonrefundable_credits: line47,
      line48_tax_after_nonrefundable_credits: line48,
      line61_alternative_minimum_tax: input.line61AlternativeMinimumTax,
      line62_behavioral_health_services_tax:
        input.line62BehavioralHealthServicesTax,
      line63_other_taxes: input.line63OtherTaxes,
      line64_total_tax: line64,
      line95_payments_after_use_tax_and_penalty: line95,
      line97_overpaid_tax: Math.max(line95 - line64, 0),
      line100_tax_due: Math.max(line64 - line95, 0),
    },
    findings: reviewFindings(input),
  };
}
