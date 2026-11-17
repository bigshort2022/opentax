import type { CaliforniaFilingStatus } from "./tax.ts";

export interface ExemptionCreditInput {
  readonly filingStatus: CaliforniaFilingStatus;
  readonly federalAgi: number;
  readonly personalExemptions: number;
  readonly blindExemptions: number;
  readonly seniorExemptions: number;
  readonly dependentExemptions: number;
}

const EXEMPTION_CREDIT = 153;
const DEPENDENT_EXEMPTION_CREDIT = 475;
const CREDIT_REDUCTION_PER_STEP = 6;

function agiThreshold(status: CaliforniaFilingStatus): number {
  switch (status) {
    case "single":
    case "separate":
      return 252_203;
    case "joint":
    case "qualifying_surviving_spouse":
      return 504_411;
    case "head_of_household":
      return 378_310;
  }
}

export function calculateExemptionCredit(input: ExemptionCreditInput): number {
  if (!Number.isSafeInteger(input.federalAgi)) {
    throw new RangeError("Federal AGI must be a safe whole-dollar amount");
  }
  const counts = [
    input.personalExemptions,
    input.blindExemptions,
    input.seniorExemptions,
    input.dependentExemptions,
  ];
  if (
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    !Number.isSafeInteger(input.federalAgi)
  ) {
    throw new RangeError(
      "Exemption counts and federal AGI must be whole dollars",
    );
  }
  const personalCount = input.personalExemptions + input.blindExemptions +
    input.seniorExemptions;
  const personalCredit = personalCount * EXEMPTION_CREDIT;
  const dependentCredit = input.dependentExemptions * DEPENDENT_EXEMPTION_CREDIT;
  const totalCredit = personalCredit + dependentCredit;
  if (
    !Number.isSafeInteger(personalCount) ||
    !Number.isSafeInteger(personalCredit) ||
    !Number.isSafeInteger(dependentCredit) ||
    !Number.isSafeInteger(totalCredit)
  ) {
    throw new RangeError("Exemption credits exceed the safe whole-dollar range");
  }
  const threshold = agiThreshold(input.filingStatus);
  if (input.federalAgi <= threshold) return totalCredit;
  const divisor = input.filingStatus === "separate" ? 1_250 : 2_500;
  const steps = Math.ceil((input.federalAgi - threshold) / divisor);
  const reduction = steps * CREDIT_REDUCTION_PER_STEP;
  // FTB line 32 worksheet floors personal/blind/senior and dependent groups
  // separately before combining them (worksheet lines i, m, and n).
  return personalCount * Math.max(0, EXEMPTION_CREDIT - reduction) +
    input.dependentExemptions * Math.max(0, DEPENDENT_EXEMPTION_CREDIT - reduction);
}
