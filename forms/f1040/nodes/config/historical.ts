import { FilingStatus } from "../types.ts";
import type { F1040Config } from "./types.ts";

export function byStatus(single: number, mfj: number, mfs: number, hoh: number): Record<FilingStatus, number> {
  return {
    [FilingStatus.Single]: single, [FilingStatus.MFJ]: mfj,
    [FilingStatus.MFS]: mfs, [FilingStatus.HOH]: hoh, [FilingStatus.QSS]: mfj,
  };
}

/** Only statutory terms unchanged throughout 2021–2024, not a later-year config. */
export const historicalInvariants = {
  // IRC §§3101(b)(2), 1411(b).
  additionalMedicareThresholdMfj: 250_000,
  additionalMedicareThresholdMfs: 125_000,
  additionalMedicareThresholdOther: 200_000,
  niitThresholdMfj: 250_000,
  niitThresholdMfs: 125_000,
  niitThresholdOther: 200_000,
  hsaCatchup: 1_000, // IRC §223(b)(3).
  iraPhaseoutMfsLower: 0,
  iraPhaseoutMfsUpper: 10_000,
  qbiPhaseInRange: 100_000, // IRC §199A(e)(2).
  odcPerDependent: 500,
  ctcPhaseOutThresholdMfj: 400_000,
  ctcPhaseOutThresholdOther: 200_000,
  actcEarnedIncomeFloor: 2_500,
  saversCreditContributionCap: 2_000,
  householdFutaQuarterlyThreshold: 1_000,
  // IRC §164(b)(6): no income phaseout before 2025.
  saltCap: 10_000,
  saltPhaseoutThreshold: 0,
  saltPhaseoutThresholdMfs: 0,
  saltPhaseoutRate: 0,
  saltFloor: 10_000,
  saltFloorMfs: 5_000,
  psoExclusionLimit: 3_000,
  // IRC §402(e)(1)(C) and former §101(b), retained by Form 4972.
  mdaMax: 10_000,
  mdaPhaseOutThreshold: 20_000,
  mdaZeroThreshold: 70_000,
  deathBenefitMax: 5_000,
  qpriCapStandard: 750_000, // IRC §108(h)(2), from 2021.
  qpriCapMfs: 375_000,
  scheduleBDividendThreshold: 1_500,
  f2106PerformingArtistAgiLimit: 16_000,
  mccMaxCreditHighRate: 2_000,
  sepContributionRate: 0.25,
  simpleEmployerMatchRate: 0.03,
  // Statutorily unavailable before 2025, not substituted unknown amounts.
  seniorDeductionMax: 0,
  seniorDeductionPhaseoutSingle: 0,
  seniorDeductionPhaseoutMfj: 0,
  seniorDeductionPhaseoutRate: 0,
  qualifiedTipsCap: 0,
  qualifiedOvertimeCap: 0,
  qualifiedOvertimeCapMfj: 0,
  tipsOvertimePhaseoutThreshold: 0,
  tipsOvertimePhaseoutThresholdMfj: 0,
  tipsOvertimePhaseoutPerThousand: 0,
  vehicleLoanInterestCap: 0,
  vehicleLoanInterestPhaseoutThreshold: 0,
  vehicleLoanInterestPhaseoutThresholdMfj: 0,
  vehicleLoanInterestPhaseoutPerThousand: 0,
  charitableAgiFloorRate: 0,
  itemizedDeductionReductionRate: 0, // IRC §68(f), TCJA suspension.
  qbiMinimumDeduction: 0,
  qbiMinimumDeductionQbiFloor: 0,
  adoptionCreditRefundableMax: 0,
  adoptionPhaseoutRange: 40_000,
  trumpAccountContributionLimit: 0,
  trumpAccountEmployerExclusionLimit: 0,
  amtExemptionPhaseOutRate: 0.25,
  // ARPA §9661, extended through 2025 by IRA §12001; Form 8962 Table 2.
  ptcApplicablePercentages: [
    { fromFplPct: 0, toFplPct: 150, initial: 0, final: 0 },
    { fromFplPct: 150, toFplPct: 200, initial: 0, final: 200 },
    { fromFplPct: 200, toFplPct: 250, initial: 200, final: 400 },
    { fromFplPct: 250, toFplPct: 300, initial: 400, final: 600 },
    { fromFplPct: 300, toFplPct: 400, initial: 600, final: 850 },
    { fromFplPct: 400, toFplPct: Infinity, initial: 850, final: 850 },
  ],
  ptcIncomeLimitFplPct: null,
  ptcLawfullyPresentBelow100Fpl: true,
  cleanElectricityMaterialAssistanceAfter: null,
} satisfies Partial<F1040Config>;

/** Outside the historical preparation product; never borrow a later-year table. */
export function unavailableHistoricalRule(year: number, provision: string): never {
  throw new Error(`Historical ${year} ${provision} is outside the supported preparation rules`);
}
