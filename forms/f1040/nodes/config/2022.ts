/** TY2022: official archived IRS authorities, pinpoints and SHA-256 digests in
 * docs/historical-federal/annual-rules-sources.json. No later-year inheritance.
 * 2021 CTC scalar is the base credit only; expanded child claims require the
 * separate historical capability review, not evaluation by the modern CTC node.
 */
import type { F1040Config } from "./types.ts";
import { byStatus, historicalInvariants, unavailableHistoricalRule } from "./historical.ts";

export const config2022: F1040Config = {
  ...historicalInvariants,
  bracketsSingle: [
    { over: 0, upTo: 10275, rate: 0.1, base: 0 },
    { over: 10275, upTo: 41775, rate: 0.12, base: 1027.5 },
    { over: 41775, upTo: 89075, rate: 0.22, base: 4807.5 },
    { over: 89075, upTo: 170050, rate: 0.24, base: 15213.5 },
    { over: 170050, upTo: 215950, rate: 0.32, base: 34647.5 },
    { over: 215950, upTo: 539900, rate: 0.35, base: 49335.5 },
    { over: 539900, upTo: Infinity, rate: 0.37, base: 162718.0 }
  ],
  bracketsMfj: [
    { over: 0, upTo: 20550, rate: 0.1, base: 0 },
    { over: 20550, upTo: 83550, rate: 0.12, base: 2055.0 },
    { over: 83550, upTo: 178150, rate: 0.22, base: 9615.0 },
    { over: 178150, upTo: 340100, rate: 0.24, base: 30427.0 },
    { over: 340100, upTo: 431900, rate: 0.32, base: 69295.0 },
    { over: 431900, upTo: 647850, rate: 0.35, base: 98671.0 },
    { over: 647850, upTo: Infinity, rate: 0.37, base: 174253.5 }
  ],
  bracketsHoh: [
    { over: 0, upTo: 14650, rate: 0.1, base: 0 },
    { over: 14650, upTo: 55900, rate: 0.12, base: 1465.0 },
    { over: 55900, upTo: 89050, rate: 0.22, base: 6415.0 },
    { over: 89050, upTo: 170050, rate: 0.24, base: 13708.0 },
    { over: 170050, upTo: 215950, rate: 0.32, base: 33148.0 },
    { over: 215950, upTo: 539900, rate: 0.35, base: 47836.0 },
    { over: 539900, upTo: Infinity, rate: 0.37, base: 161218.5 }
  ],
  bracketsMfs: [
    { over: 0, upTo: 10275, rate: 0.1, base: 0 },
    { over: 10275, upTo: 41775, rate: 0.12, base: 1027.5 },
    { over: 41775, upTo: 89075, rate: 0.22, base: 4807.5 },
    { over: 89075, upTo: 170050, rate: 0.24, base: 15213.5 },
    { over: 170050, upTo: 215950, rate: 0.32, base: 34647.5 },
    { over: 215950, upTo: 323925, rate: 0.35, base: 49335.5 },
    { over: 323925, upTo: Infinity, rate: 0.37, base: 87126.75 }
  ],
  standardDeductionBase: byStatus(12950, 25900, 12950, 19400),
  standardDeductionAdditional: byStatus(1750, 1400, 1400, 1750),
  qdcgtZeroCeiling: byStatus(41675, 83350, 41675, 55800),
  qdcgtTwentyFloor: byStatus(459750, 517200, 258600, 488500),
  amtExemption: byStatus(75900, 118100, 59050, 75900),
  amtPhaseOutStart: byStatus(539900, 1079800, 539900, 539900),
  amtBracket26ThresholdStandard: 206100,
  amtBracket26ThresholdMfs: 103050.0,
  amtBracketAdjustmentStandard: 4122.0,
  amtBracketAdjustmentMfs: 2061.0,
  ssWageBase: 147000,
  ssTaxPerEmployer: 9114.0,
  seOptionalMethodMaximum: 6040,
  seFarmOptionalGrossIncomeLimit: 9060,
  seFarmOptionalNetProfitLimit: 6540,
  hsaSelfOnlyLimit: 3650,
  hsaFamilyLimit: 7300,
  iraContributionLimit: 6000,
  iraContributionLimitAge50: 7000,
  iraPhaseoutSingleLower: 68000,
  iraPhaseoutSingleUpper: 78000,
  iraPhaseoutMfjLower: 109000,
  iraPhaseoutMfjUpper: 129000,
  iraPhaseoutNoncoveredMfjLower: 204000,
  iraPhaseoutNoncoveredMfjUpper: 214000,
  qbiThresholdSingle: 170050,
  qbiThresholdMfj: 340100,
  qbiThresholdMfs: 170050,
  eitcInvestmentIncomeLimit: 10300,
  ctcPerChild: 2000,
  actcMaxPerChild: 1500,
  saversCreditAgiSingle: { rate50: 20500, rate20: 22000, rate10: 34000 },
  saversCreditAgiMfj: { rate50: 41000, rate20: 44000, rate10: 68000 },
  saversCreditAgiHoh: { rate50: 30750.0, rate20: 33000.0, rate10: 51000.0 },
  savingsBondPhaseoutStartMfj: 128650,
  savingsBondPhaseoutEndMfj: 158650,
  savingsBondPhaseoutStartSingle: 85800,
  savingsBondPhaseoutEndSingle: 100800,
  kiddieUnearnedIncomeThreshold: 2300,
  kiddieStandardDeductionFloor: 1150,
  form8814ChildIncomeLimit: 11500,
  feieLimit: 112000,
  feieHousingBase: 17920.0,
  section179Limit: 1080000,
  section179PhaseoutThreshold: 2700000,
  luxuryAutoYear1NoBonus: 11200,
  luxuryAutoYear1WithBonus: 19200,
  luxuryAutoYear2: 18000,
  luxuryAutoYear3Plus: 10800,
  luxuryAutoSucceedingYears: 6460,
  householdFicaThreshold: 2400,
  depCareExpenseCapOne: 3000,
  depCareExpenseCapTwoPlus: 6000,
  depCareEmployerExclusion: 5000,
  depCareEmployerExclusionMfs: 2500,
  depCareCreditRateAgiThreshold: 15000,
  depCareCreditRateBracketSize: 2000,
  depCareCreditMaxRate: 0.35,
  depCareCreditFirstFloorRate: 0.2,
  depCareCreditSecondPhaseout: null,
  fplBase: 12880,
  fplIncrement: 4540,
  fplBaseAlaska: 16090,
  fplIncrementAlaska: 5680,
  fplBaseHawaii: 14820,
  fplIncrementHawaii: 5220,
  qcdAnnualLimit: 100000,
  eblThresholdSingle: 270000,
  eblThresholdMfj: 540000,
  smallBizGrossReceipts: 27000000,
  retirementLimits: {
    "401k": { 49: 20500, [Infinity]: 27000 },
    "403b": { 49: 20500, [Infinity]: 27000 },
    "457b": { 49: 20500, [Infinity]: 27000 },
    "simple": { 49: 14000, [Infinity]: 17000 },
  },
  ltcPerDiemDailyLimit: 390,
  sec199aSingleThreshold: 170050,
  sec199aMfjThreshold: 340100,
  sliPhaseOutStartSingle: 70000,
  sliPhaseOutEndSingle: 85000,
  sliPhaseOutStartMfj: 145000,
  sliPhaseOutEndMfj: 175000,
  ltcPremiumLimits: [
    { maxAge: 40, limit: 450 },
    { maxAge: 50, limit: 850 },
    { maxAge: 60, limit: 1690 },
    { maxAge: 70, limit: 4510 },
    { maxAge: Infinity, limit: 5640 }
  ],
  sepMaxContribution: 61000,
  nonitemizerCharitableLimit: 0,
  nonitemizerCharitableLimitMfj: 0,
  mortgageInsurancePremiumsDeductible: false,
  adoptionCreditMax: 14890,
  adoptionPhaseoutStart: 223410,
  qualifyingRelativeGrossIncomeLimit: 4400,
  dependentStandardDeductionFloor: 1150,
  dependentStandardDeductionEarnedIncomeAddOn: 400,
  educatorExpenseLimit: 300,
  standardMileageRates: [
    { from: "2022-01-01", business: 0.585, medicalMoving: 0.18, charitable: 0.14 },
    { from: "2022-07-01", business: 0.625, medicalMoving: 0.22, charitable: 0.14 }
  ],
  eitcMaximumRounding: "unrounded",
  eitcByChildren: [
    { creditRate: 0.0765, phaseoutRate: 0.0765, earnedIncomeAmount: 7320, maxCredit: 560, phaseoutStart: 9160, phaseoutStartMfj: 15290, phaseoutEnd: 16480, phaseoutEndMfj: 22610 },
    { creditRate: 0.34, phaseoutRate: 0.1598, earnedIncomeAmount: 10980, maxCredit: 3733, phaseoutStart: 20130, phaseoutStartMfj: 26260, phaseoutEnd: 43492, phaseoutEndMfj: 49622 },
    { creditRate: 0.4, phaseoutRate: 0.2106, earnedIncomeAmount: 15410, maxCredit: 6164, phaseoutStart: 20130, phaseoutStartMfj: 26260, phaseoutEnd: 49399, phaseoutEndMfj: 55529 },
    { creditRate: 0.45, phaseoutRate: 0.2106, earnedIncomeAmount: 15410, maxCredit: 6935, phaseoutStart: 20130, phaseoutStartMfj: 26260, phaseoutEnd: 53057, phaseoutEndMfj: 59187 }
  ],
  ptcRequiredContributionPercentage: 0.0961,
  ptcRepaymentCaps: [
    { maxFplPct: 200, singleCap: 325, otherCap: 650 },
    { maxFplPct: 300, singleCap: 825, otherCap: 1650 },
    { maxFplPct: 400, singleCap: 1400, otherCap: 2800 }
  ],
  get foreignHousingLimits(): F1040Config["foreignHousingLimits"] {
    return unavailableHistoricalRule(2022, "foreignHousingLimits");
  },
  get smallAgriBiodieselSales(): F1040Config["smallAgriBiodieselSales"] {
    return unavailableHistoricalRule(2022, "smallAgriBiodieselSales");
  },
  get renewableProductionRates(): F1040Config["renewableProductionRates"] {
    return unavailableHistoricalRule(2022, "renewableProductionRates");
  },
  get paidLeaveCompensationLimit(): F1040Config["paidLeaveCompensationLimit"] {
    return unavailableHistoricalRule(2022, "paidLeaveCompensationLimit");
  },
  get employerProvidedChildcare(): F1040Config["employerProvidedChildcare"] {
    return unavailableHistoricalRule(2022, "employerProvidedChildcare");
  },
  get retirementContributionCreditWageLimit(): F1040Config["retirementContributionCreditWageLimit"] {
    return unavailableHistoricalRule(2022, "retirementContributionCreditWageLimit");
  },
  get form2210fPenaltyRate(): F1040Config["form2210fPenaltyRate"] {
    return unavailableHistoricalRule(2022, "form2210fPenaltyRate");
  },
};
