/** TY2021: official archived IRS authorities, pinpoints and SHA-256 digests in
 * docs/historical-federal/annual-rules-sources.json. No later-year inheritance.
 * 2021 CTC scalar is the base credit only; expanded child claims require the
 * separate historical capability review, not evaluation by the modern CTC node.
 */
import type { F1040Config } from "./types.ts";
import { byStatus, historicalInvariants, unavailableHistoricalRule } from "./historical.ts";

export const config2021: F1040Config = {
  ...historicalInvariants,
  bracketsSingle: [
    { over: 0, upTo: 9950, rate: 0.1, base: 0 },
    { over: 9950, upTo: 40525, rate: 0.12, base: 995.0 },
    { over: 40525, upTo: 86375, rate: 0.22, base: 4664.0 },
    { over: 86375, upTo: 164925, rate: 0.24, base: 14751.0 },
    { over: 164925, upTo: 209425, rate: 0.32, base: 33603.0 },
    { over: 209425, upTo: 523600, rate: 0.35, base: 47843.0 },
    { over: 523600, upTo: Infinity, rate: 0.37, base: 157804.25 }
  ],
  bracketsMfj: [
    { over: 0, upTo: 19900, rate: 0.1, base: 0 },
    { over: 19900, upTo: 81050, rate: 0.12, base: 1990.0 },
    { over: 81050, upTo: 172750, rate: 0.22, base: 9328.0 },
    { over: 172750, upTo: 329850, rate: 0.24, base: 29502.0 },
    { over: 329850, upTo: 418850, rate: 0.32, base: 67206.0 },
    { over: 418850, upTo: 628300, rate: 0.35, base: 95686.0 },
    { over: 628300, upTo: Infinity, rate: 0.37, base: 168993.5 }
  ],
  bracketsHoh: [
    { over: 0, upTo: 14200, rate: 0.1, base: 0 },
    { over: 14200, upTo: 54200, rate: 0.12, base: 1420.0 },
    { over: 54200, upTo: 86350, rate: 0.22, base: 6220.0 },
    { over: 86350, upTo: 164900, rate: 0.24, base: 13293.0 },
    { over: 164900, upTo: 209400, rate: 0.32, base: 32145.0 },
    { over: 209400, upTo: 523600, rate: 0.35, base: 46385.0 },
    { over: 523600, upTo: Infinity, rate: 0.37, base: 156355.0 }
  ],
  bracketsMfs: [
    { over: 0, upTo: 9950, rate: 0.1, base: 0 },
    { over: 9950, upTo: 40525, rate: 0.12, base: 995.0 },
    { over: 40525, upTo: 86375, rate: 0.22, base: 4664.0 },
    { over: 86375, upTo: 164925, rate: 0.24, base: 14751.0 },
    { over: 164925, upTo: 209425, rate: 0.32, base: 33603.0 },
    { over: 209425, upTo: 314150, rate: 0.35, base: 47843.0 },
    { over: 314150, upTo: Infinity, rate: 0.37, base: 84496.75 }
  ],
  standardDeductionBase: byStatus(12550, 25100, 12550, 18800),
  standardDeductionAdditional: byStatus(1700, 1350, 1350, 1700),
  qdcgtZeroCeiling: byStatus(40400, 80800, 40400, 54100),
  qdcgtTwentyFloor: byStatus(445850, 501600, 250800, 473750),
  amtExemption: byStatus(73600, 114600, 57300, 73600),
  amtPhaseOutStart: byStatus(523600, 1047200, 523600, 523600),
  amtBracket26ThresholdStandard: 199900,
  amtBracket26ThresholdMfs: 99950.0,
  amtBracketAdjustmentStandard: 3998.0,
  amtBracketAdjustmentMfs: 1999.0,
  ssWageBase: 142800,
  ssTaxPerEmployer: 8853.6,
  seOptionalMethodMaximum: 5880,
  seFarmOptionalGrossIncomeLimit: 8820,
  seFarmOptionalNetProfitLimit: 6367,
  hsaSelfOnlyLimit: 3600,
  hsaFamilyLimit: 7200,
  iraContributionLimit: 6000,
  iraContributionLimitAge50: 7000,
  iraPhaseoutSingleLower: 66000,
  iraPhaseoutSingleUpper: 76000,
  iraPhaseoutMfjLower: 105000,
  iraPhaseoutMfjUpper: 125000,
  iraPhaseoutNoncoveredMfjLower: 198000,
  iraPhaseoutNoncoveredMfjUpper: 208000,
  qbiThresholdSingle: 164900,
  qbiThresholdMfj: 329800,
  qbiThresholdMfs: 164925,
  eitcInvestmentIncomeLimit: 10000,
  ctcPerChild: 2000,
  actcMaxPerChild: 1400,
  saversCreditAgiSingle: { rate50: 19750, rate20: 21500, rate10: 33000 },
  saversCreditAgiMfj: { rate50: 39500, rate20: 43000, rate10: 66000 },
  saversCreditAgiHoh: { rate50: 29625.0, rate20: 32250.0, rate10: 49500.0 },
  savingsBondPhaseoutStartMfj: 124800,
  savingsBondPhaseoutEndMfj: 154800,
  savingsBondPhaseoutStartSingle: 83200,
  savingsBondPhaseoutEndSingle: 98200,
  kiddieUnearnedIncomeThreshold: 2200,
  kiddieStandardDeductionFloor: 1100,
  form8814ChildIncomeLimit: 11000,
  feieLimit: 108700,
  feieHousingBase: 17392.0,
  section179Limit: 1050000,
  section179PhaseoutThreshold: 2620000,
  luxuryAutoYear1NoBonus: 10200,
  luxuryAutoYear1WithBonus: 18200,
  luxuryAutoYear2: 16400,
  luxuryAutoYear3Plus: 9800,
  luxuryAutoSucceedingYears: 5860,
  householdFicaThreshold: 2300,
  depCareExpenseCapOne: 8000,
  depCareExpenseCapTwoPlus: 16000,
  depCareEmployerExclusion: 10500,
  depCareEmployerExclusionMfs: 5250,
  depCareCreditRateAgiThreshold: 125000,
  depCareCreditRateBracketSize: 2000,
  depCareCreditMaxRate: 0.5,
  depCareCreditFirstFloorRate: 0.2,
  depCareCreditSecondPhaseout: { agiThreshold: 400000, agiThresholdMfj: 400000, bracketSize: 2000, bracketSizeMfj: 2000, floorRate: 0 },
  fplBase: 12760,
  fplIncrement: 4480,
  fplBaseAlaska: 15950,
  fplIncrementAlaska: 5600,
  fplBaseHawaii: 14680,
  fplIncrementHawaii: 5150,
  qcdAnnualLimit: 100000,
  eblThresholdSingle: 262000,
  eblThresholdMfj: 524000,
  smallBizGrossReceipts: 26000000,
  retirementLimits: {
    "401k": { 49: 19500, [Infinity]: 26000 },
    "403b": { 49: 19500, [Infinity]: 26000 },
    "457b": { 49: 19500, [Infinity]: 26000 },
    "simple": { 49: 13500, [Infinity]: 16500 },
  },
  ltcPerDiemDailyLimit: 400,
  sec199aSingleThreshold: 164900,
  sec199aMfjThreshold: 329800,
  sliPhaseOutStartSingle: 70000,
  sliPhaseOutEndSingle: 85000,
  sliPhaseOutStartMfj: 140000,
  sliPhaseOutEndMfj: 170000,
  ltcPremiumLimits: [
    { maxAge: 40, limit: 450 },
    { maxAge: 50, limit: 850 },
    { maxAge: 60, limit: 1690 },
    { maxAge: 70, limit: 4520 },
    { maxAge: Infinity, limit: 5640 }
  ],
  sepMaxContribution: 58000,
  nonitemizerCharitableLimit: 300,
  nonitemizerCharitableLimitMfj: 600,
  mortgageInsurancePremiumsDeductible: true,
  adoptionCreditMax: 14440,
  adoptionPhaseoutStart: 216660,
  qualifyingRelativeGrossIncomeLimit: 4300,
  dependentStandardDeductionFloor: 1100,
  dependentStandardDeductionEarnedIncomeAddOn: 350,
  educatorExpenseLimit: 250,
  standardMileageRates: [
    { from: "2021-01-01", business: 0.56, medicalMoving: 0.16, charitable: 0.14 }
  ],
  eitcMaximumRounding: "unrounded",
  eitcByChildren: [
    { creditRate: 0.153, phaseoutRate: 0.153, earnedIncomeAmount: 9820, maxCredit: 1502, phaseoutStart: 11610, phaseoutStartMfj: 17560, phaseoutEnd: 21430, phaseoutEndMfj: 27380 },
    { creditRate: 0.34, phaseoutRate: 0.1598, earnedIncomeAmount: 10640, maxCredit: 3618, phaseoutStart: 19520, phaseoutStartMfj: 25470, phaseoutEnd: 42158, phaseoutEndMfj: 48108 },
    { creditRate: 0.4, phaseoutRate: 0.2106, earnedIncomeAmount: 14950, maxCredit: 5980, phaseoutStart: 19520, phaseoutStartMfj: 25470, phaseoutEnd: 47915, phaseoutEndMfj: 53865 },
    { creditRate: 0.45, phaseoutRate: 0.2106, earnedIncomeAmount: 14950, maxCredit: 6728, phaseoutStart: 19520, phaseoutStartMfj: 25470, phaseoutEnd: 51464, phaseoutEndMfj: 57414 }
  ],
  ptcRequiredContributionPercentage: 0.0983,
  ptcRepaymentCaps: [
    { maxFplPct: 200, singleCap: 325, otherCap: 650 },
    { maxFplPct: 300, singleCap: 800, otherCap: 1600 },
    { maxFplPct: 400, singleCap: 1350, otherCap: 2700 }
  ],
  get foreignHousingLimits(): F1040Config["foreignHousingLimits"] {
    return unavailableHistoricalRule(2021, "foreignHousingLimits");
  },
  get smallAgriBiodieselSales(): F1040Config["smallAgriBiodieselSales"] {
    return unavailableHistoricalRule(2021, "smallAgriBiodieselSales");
  },
  get renewableProductionRates(): F1040Config["renewableProductionRates"] {
    return unavailableHistoricalRule(2021, "renewableProductionRates");
  },
  get paidLeaveCompensationLimit(): F1040Config["paidLeaveCompensationLimit"] {
    return unavailableHistoricalRule(2021, "paidLeaveCompensationLimit");
  },
  get employerProvidedChildcare(): F1040Config["employerProvidedChildcare"] {
    return unavailableHistoricalRule(2021, "employerProvidedChildcare");
  },
  get retirementContributionCreditWageLimit(): F1040Config["retirementContributionCreditWageLimit"] {
    return unavailableHistoricalRule(2021, "retirementContributionCreditWageLimit");
  },
  get form2210fPenaltyRate(): F1040Config["form2210fPenaltyRate"] {
    return unavailableHistoricalRule(2021, "form2210fPenaltyRate");
  },
};
