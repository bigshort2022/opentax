/** TY2024: official archived IRS authorities, pinpoints and SHA-256 digests in
 * docs/historical-federal/annual-rules-sources.json. No later-year inheritance.
 * 2021 CTC scalar is the base credit only; expanded child claims require the
 * separate historical capability review, not evaluation by the modern CTC node.
 */
import type { F1040Config } from "./types.ts";
import { byStatus, historicalInvariants, unavailableHistoricalRule } from "./historical.ts";

export const config2024: F1040Config = {
  ...historicalInvariants,
  bracketsSingle: [
    { over: 0, upTo: 11600, rate: 0.1, base: 0 },
    { over: 11600, upTo: 47150, rate: 0.12, base: 1160.0 },
    { over: 47150, upTo: 100525, rate: 0.22, base: 5426.0 },
    { over: 100525, upTo: 191950, rate: 0.24, base: 17168.5 },
    { over: 191950, upTo: 243725, rate: 0.32, base: 39110.5 },
    { over: 243725, upTo: 609350, rate: 0.35, base: 55678.5 },
    { over: 609350, upTo: Infinity, rate: 0.37, base: 183647.25 }
  ],
  bracketsMfj: [
    { over: 0, upTo: 23200, rate: 0.1, base: 0 },
    { over: 23200, upTo: 94300, rate: 0.12, base: 2320.0 },
    { over: 94300, upTo: 201050, rate: 0.22, base: 10852.0 },
    { over: 201050, upTo: 383900, rate: 0.24, base: 34337.0 },
    { over: 383900, upTo: 487450, rate: 0.32, base: 78221.0 },
    { over: 487450, upTo: 731200, rate: 0.35, base: 111357.0 },
    { over: 731200, upTo: Infinity, rate: 0.37, base: 196669.5 }
  ],
  bracketsHoh: [
    { over: 0, upTo: 16550, rate: 0.1, base: 0 },
    { over: 16550, upTo: 63100, rate: 0.12, base: 1655.0 },
    { over: 63100, upTo: 100500, rate: 0.22, base: 7241.0 },
    { over: 100500, upTo: 191950, rate: 0.24, base: 15469.0 },
    { over: 191950, upTo: 243700, rate: 0.32, base: 37417.0 },
    { over: 243700, upTo: 609350, rate: 0.35, base: 53977.0 },
    { over: 609350, upTo: Infinity, rate: 0.37, base: 181954.5 }
  ],
  bracketsMfs: [
    { over: 0, upTo: 11600, rate: 0.1, base: 0 },
    { over: 11600, upTo: 47150, rate: 0.12, base: 1160.0 },
    { over: 47150, upTo: 100525, rate: 0.22, base: 5426.0 },
    { over: 100525, upTo: 191950, rate: 0.24, base: 17168.5 },
    { over: 191950, upTo: 243725, rate: 0.32, base: 39110.5 },
    { over: 243725, upTo: 365600, rate: 0.35, base: 55678.5 },
    { over: 365600, upTo: Infinity, rate: 0.37, base: 98334.75 }
  ],
  standardDeductionBase: byStatus(14600, 29200, 14600, 21900),
  standardDeductionAdditional: byStatus(1950, 1550, 1550, 1950),
  qdcgtZeroCeiling: byStatus(47025, 94050, 47025, 63000),
  qdcgtTwentyFloor: byStatus(518900, 583750, 291850, 551350),
  amtExemption: byStatus(85700, 133300, 66650, 85700),
  amtPhaseOutStart: byStatus(609350, 1218700, 609350, 609350),
  amtBracket26ThresholdStandard: 232600,
  amtBracket26ThresholdMfs: 116300.0,
  amtBracketAdjustmentStandard: 4652.0,
  amtBracketAdjustmentMfs: 2326.0,
  ssWageBase: 168600,
  ssTaxPerEmployer: 10453.2,
  seOptionalMethodMaximum: 6920,
  seFarmOptionalGrossIncomeLimit: 10380,
  seFarmOptionalNetProfitLimit: 7493,
  hsaSelfOnlyLimit: 4150,
  hsaFamilyLimit: 8300,
  iraContributionLimit: 7000,
  iraContributionLimitAge50: 8000,
  iraPhaseoutSingleLower: 77000,
  iraPhaseoutSingleUpper: 87000,
  iraPhaseoutMfjLower: 123000,
  iraPhaseoutMfjUpper: 143000,
  iraPhaseoutNoncoveredMfjLower: 230000,
  iraPhaseoutNoncoveredMfjUpper: 240000,
  qbiThresholdSingle: 191950,
  qbiThresholdMfj: 383900,
  qbiThresholdMfs: 191950,
  eitcInvestmentIncomeLimit: 11600,
  ctcPerChild: 2000,
  actcMaxPerChild: 1700,
  saversCreditAgiSingle: { rate50: 23000, rate20: 25000, rate10: 38250 },
  saversCreditAgiMfj: { rate50: 46000, rate20: 50000, rate10: 76500 },
  saversCreditAgiHoh: { rate50: 34500.0, rate20: 37500.0, rate10: 57375.0 },
  savingsBondPhaseoutStartMfj: 145200,
  savingsBondPhaseoutEndMfj: 175200,
  savingsBondPhaseoutStartSingle: 96800,
  savingsBondPhaseoutEndSingle: 111800,
  kiddieUnearnedIncomeThreshold: 2600,
  kiddieStandardDeductionFloor: 1300,
  form8814ChildIncomeLimit: 13000,
  feieLimit: 126500,
  feieHousingBase: 20240.0,
  section179Limit: 1220000,
  section179PhaseoutThreshold: 3050000,
  luxuryAutoYear1NoBonus: 12400,
  luxuryAutoYear1WithBonus: 20400,
  luxuryAutoYear2: 19800,
  luxuryAutoYear3Plus: 11900,
  luxuryAutoSucceedingYears: 7160,
  householdFicaThreshold: 2700,
  depCareExpenseCapOne: 3000,
  depCareExpenseCapTwoPlus: 6000,
  depCareEmployerExclusion: 5000,
  depCareEmployerExclusionMfs: 2500,
  depCareCreditRateAgiThreshold: 15000,
  depCareCreditRateBracketSize: 2000,
  depCareCreditMaxRate: 0.35,
  depCareCreditFirstFloorRate: 0.2,
  depCareCreditSecondPhaseout: null,
  fplBase: 14580,
  fplIncrement: 5140,
  fplBaseAlaska: 18210,
  fplIncrementAlaska: 6430,
  fplBaseHawaii: 16770,
  fplIncrementHawaii: 5910,
  qcdAnnualLimit: 105000,
  eblThresholdSingle: 305000,
  eblThresholdMfj: 610000,
  smallBizGrossReceipts: 30000000,
  retirementLimits: {
    "401k": { 49: 23000, [Infinity]: 30500 },
    "403b": { 49: 23000, [Infinity]: 30500 },
    "457b": { 49: 23000, [Infinity]: 30500 },
    "simple": { 49: 16000, [Infinity]: 19500 },
  },
  ltcPerDiemDailyLimit: 410,
  sec199aSingleThreshold: 191950,
  sec199aMfjThreshold: 383900,
  sliPhaseOutStartSingle: 80000,
  sliPhaseOutEndSingle: 95000,
  sliPhaseOutStartMfj: 165000,
  sliPhaseOutEndMfj: 195000,
  ltcPremiumLimits: [
    { maxAge: 40, limit: 470 },
    { maxAge: 50, limit: 880 },
    { maxAge: 60, limit: 1760 },
    { maxAge: 70, limit: 4710 },
    { maxAge: Infinity, limit: 5880 }
  ],
  sepMaxContribution: 69000,
  nonitemizerCharitableLimit: 0,
  nonitemizerCharitableLimitMfj: 0,
  mortgageInsurancePremiumsDeductible: false,
  adoptionCreditMax: 16810,
  adoptionPhaseoutStart: 252150,
  qualifyingRelativeGrossIncomeLimit: 5050,
  dependentStandardDeductionFloor: 1300,
  dependentStandardDeductionEarnedIncomeAddOn: 450,
  educatorExpenseLimit: 300,
  standardMileageRates: [
    { from: "2024-01-01", business: 0.67, medicalMoving: 0.21, charitable: 0.14 }
  ],
  eitcMaximumRounding: "rounded-including-terminal",
  eitcByChildren: [
    { creditRate: 0.0765, phaseoutRate: 0.0765, earnedIncomeAmount: 8260, maxCredit: 632, phaseoutStart: 10330, phaseoutStartMfj: 17250, phaseoutEnd: 18591, phaseoutEndMfj: 25511 },
    { creditRate: 0.34, phaseoutRate: 0.1598, earnedIncomeAmount: 12390, maxCredit: 4213, phaseoutStart: 22720, phaseoutStartMfj: 29640, phaseoutEnd: 49084, phaseoutEndMfj: 56004 },
    { creditRate: 0.4, phaseoutRate: 0.2106, earnedIncomeAmount: 17400, maxCredit: 6960, phaseoutStart: 22720, phaseoutStartMfj: 29640, phaseoutEnd: 55768, phaseoutEndMfj: 62688 },
    { creditRate: 0.45, phaseoutRate: 0.2106, earnedIncomeAmount: 17400, maxCredit: 7830, phaseoutStart: 22720, phaseoutStartMfj: 29640, phaseoutEnd: 59899, phaseoutEndMfj: 66819 }
  ],
  ptcRequiredContributionPercentage: 0.0839,
  ptcRepaymentCaps: [
    { maxFplPct: 200, singleCap: 375, otherCap: 750 },
    { maxFplPct: 300, singleCap: 950, otherCap: 1900 },
    { maxFplPct: 400, singleCap: 1575, otherCap: 3150 }
  ],
  get foreignHousingLimits(): F1040Config["foreignHousingLimits"] {
    return unavailableHistoricalRule(2024, "foreignHousingLimits");
  },
  get smallAgriBiodieselSales(): F1040Config["smallAgriBiodieselSales"] {
    return unavailableHistoricalRule(2024, "smallAgriBiodieselSales");
  },
  get renewableProductionRates(): F1040Config["renewableProductionRates"] {
    return unavailableHistoricalRule(2024, "renewableProductionRates");
  },
  get paidLeaveCompensationLimit(): F1040Config["paidLeaveCompensationLimit"] {
    return unavailableHistoricalRule(2024, "paidLeaveCompensationLimit");
  },
  get employerProvidedChildcare(): F1040Config["employerProvidedChildcare"] {
    return unavailableHistoricalRule(2024, "employerProvidedChildcare");
  },
  get retirementContributionCreditWageLimit(): F1040Config["retirementContributionCreditWageLimit"] {
    return unavailableHistoricalRule(2024, "retirementContributionCreditWageLimit");
  },
  get form2210fPenaltyRate(): F1040Config["form2210fPenaltyRate"] {
    return unavailableHistoricalRule(2024, "form2210fPenaltyRate");
  },
};
