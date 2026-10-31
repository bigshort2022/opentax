/** TY2023: official archived IRS authorities, pinpoints and SHA-256 digests in
 * docs/historical-federal/annual-rules-sources.json. No later-year inheritance.
 * 2021 CTC scalar is the base credit only; expanded child claims require the
 * separate historical capability review, not evaluation by the modern CTC node.
 */
import type { F1040Config } from "./types.ts";
import { byStatus, historicalInvariants, unavailableHistoricalRule } from "./historical.ts";

export const config2023: F1040Config = {
  ...historicalInvariants,
  bracketsSingle: [
    { over: 0, upTo: 11000, rate: 0.1, base: 0 },
    { over: 11000, upTo: 44725, rate: 0.12, base: 1100.0 },
    { over: 44725, upTo: 95375, rate: 0.22, base: 5147.0 },
    { over: 95375, upTo: 182100, rate: 0.24, base: 16290.0 },
    { over: 182100, upTo: 231250, rate: 0.32, base: 37104.0 },
    { over: 231250, upTo: 578125, rate: 0.35, base: 52832.0 },
    { over: 578125, upTo: Infinity, rate: 0.37, base: 174238.25 }
  ],
  bracketsMfj: [
    { over: 0, upTo: 22000, rate: 0.1, base: 0 },
    { over: 22000, upTo: 89450, rate: 0.12, base: 2200.0 },
    { over: 89450, upTo: 190750, rate: 0.22, base: 10294.0 },
    { over: 190750, upTo: 364200, rate: 0.24, base: 32580.0 },
    { over: 364200, upTo: 462500, rate: 0.32, base: 74208.0 },
    { over: 462500, upTo: 693750, rate: 0.35, base: 105664.0 },
    { over: 693750, upTo: Infinity, rate: 0.37, base: 186601.5 }
  ],
  bracketsHoh: [
    { over: 0, upTo: 15700, rate: 0.1, base: 0 },
    { over: 15700, upTo: 59850, rate: 0.12, base: 1570.0 },
    { over: 59850, upTo: 95350, rate: 0.22, base: 6868.0 },
    { over: 95350, upTo: 182100, rate: 0.24, base: 14678.0 },
    { over: 182100, upTo: 231250, rate: 0.32, base: 35498.0 },
    { over: 231250, upTo: 578100, rate: 0.35, base: 51226.0 },
    { over: 578100, upTo: Infinity, rate: 0.37, base: 172623.5 }
  ],
  bracketsMfs: [
    { over: 0, upTo: 11000, rate: 0.1, base: 0 },
    { over: 11000, upTo: 44725, rate: 0.12, base: 1100.0 },
    { over: 44725, upTo: 95375, rate: 0.22, base: 5147.0 },
    { over: 95375, upTo: 182100, rate: 0.24, base: 16290.0 },
    { over: 182100, upTo: 231250, rate: 0.32, base: 37104.0 },
    { over: 231250, upTo: 346875, rate: 0.35, base: 52832.0 },
    { over: 346875, upTo: Infinity, rate: 0.37, base: 93300.75 }
  ],
  standardDeductionBase: byStatus(13850, 27700, 13850, 20800),
  standardDeductionAdditional: byStatus(1850, 1500, 1500, 1850),
  qdcgtZeroCeiling: byStatus(44625, 89250, 44625, 59750),
  qdcgtTwentyFloor: byStatus(492300, 553850, 276900, 523050),
  amtExemption: byStatus(81300, 126500, 63250, 81300),
  amtPhaseOutStart: byStatus(578150, 1156300, 578150, 578150),
  amtBracket26ThresholdStandard: 220700,
  amtBracket26ThresholdMfs: 110350.0,
  amtBracketAdjustmentStandard: 4414.0,
  amtBracketAdjustmentMfs: 2207.0,
  ssWageBase: 160200,
  ssTaxPerEmployer: 9932.4,
  seOptionalMethodMaximum: 6560,
  seFarmOptionalGrossIncomeLimit: 9840,
  seFarmOptionalNetProfitLimit: 7103,
  hsaSelfOnlyLimit: 3850,
  hsaFamilyLimit: 7750,
  iraContributionLimit: 6500,
  iraContributionLimitAge50: 7500,
  iraPhaseoutSingleLower: 73000,
  iraPhaseoutSingleUpper: 83000,
  iraPhaseoutMfjLower: 116000,
  iraPhaseoutMfjUpper: 136000,
  iraPhaseoutNoncoveredMfjLower: 218000,
  iraPhaseoutNoncoveredMfjUpper: 228000,
  qbiThresholdSingle: 182100,
  qbiThresholdMfj: 364200,
  qbiThresholdMfs: 182100,
  eitcInvestmentIncomeLimit: 11000,
  ctcPerChild: 2000,
  actcMaxPerChild: 1600,
  saversCreditAgiSingle: { rate50: 21750, rate20: 23750, rate10: 36500 },
  saversCreditAgiMfj: { rate50: 43500, rate20: 47500, rate10: 73000 },
  saversCreditAgiHoh: { rate50: 32625.0, rate20: 35625.0, rate10: 54750.0 },
  savingsBondPhaseoutStartMfj: 137800,
  savingsBondPhaseoutEndMfj: 167800,
  savingsBondPhaseoutStartSingle: 91850,
  savingsBondPhaseoutEndSingle: 106850,
  kiddieUnearnedIncomeThreshold: 2500,
  kiddieStandardDeductionFloor: 1250,
  form8814ChildIncomeLimit: 12500,
  feieLimit: 120000,
  feieHousingBase: 19200.0,
  section179Limit: 1160000,
  section179PhaseoutThreshold: 2890000,
  luxuryAutoYear1NoBonus: 12200,
  luxuryAutoYear1WithBonus: 20200,
  luxuryAutoYear2: 19500,
  luxuryAutoYear3Plus: 11700,
  luxuryAutoSucceedingYears: 6960,
  householdFicaThreshold: 2600,
  depCareExpenseCapOne: 3000,
  depCareExpenseCapTwoPlus: 6000,
  depCareEmployerExclusion: 5000,
  depCareEmployerExclusionMfs: 2500,
  depCareCreditRateAgiThreshold: 15000,
  depCareCreditRateBracketSize: 2000,
  depCareCreditMaxRate: 0.35,
  depCareCreditFirstFloorRate: 0.2,
  depCareCreditSecondPhaseout: null,
  fplBase: 13590,
  fplIncrement: 4720,
  fplBaseAlaska: 16990,
  fplIncrementAlaska: 5900,
  fplBaseHawaii: 15630,
  fplIncrementHawaii: 5430,
  qcdAnnualLimit: 100000,
  eblThresholdSingle: 289000,
  eblThresholdMfj: 578000,
  smallBizGrossReceipts: 29000000,
  retirementLimits: {
    "401k": { 49: 22500, [Infinity]: 30000 },
    "403b": { 49: 22500, [Infinity]: 30000 },
    "457b": { 49: 22500, [Infinity]: 30000 },
    "simple": { 49: 15500, [Infinity]: 19000 },
  },
  ltcPerDiemDailyLimit: 420,
  sec199aSingleThreshold: 182100,
  sec199aMfjThreshold: 364200,
  sliPhaseOutStartSingle: 75000,
  sliPhaseOutEndSingle: 90000,
  sliPhaseOutStartMfj: 155000,
  sliPhaseOutEndMfj: 185000,
  ltcPremiumLimits: [
    { maxAge: 40, limit: 480 },
    { maxAge: 50, limit: 890 },
    { maxAge: 60, limit: 1790 },
    { maxAge: 70, limit: 4770 },
    { maxAge: Infinity, limit: 5960 }
  ],
  sepMaxContribution: 66000,
  nonitemizerCharitableLimit: 0,
  nonitemizerCharitableLimitMfj: 0,
  mortgageInsurancePremiumsDeductible: false,
  adoptionCreditMax: 15950,
  adoptionPhaseoutStart: 239230,
  qualifyingRelativeGrossIncomeLimit: 4700,
  dependentStandardDeductionFloor: 1250,
  dependentStandardDeductionEarnedIncomeAddOn: 400,
  educatorExpenseLimit: 300,
  standardMileageRates: [
    { from: "2023-01-01", business: 0.655, medicalMoving: 0.22, charitable: 0.14 }
  ],
  eitcMaximumRounding: "unrounded",
  eitcByChildren: [
    { creditRate: 0.0765, phaseoutRate: 0.0765, earnedIncomeAmount: 7840, maxCredit: 600, phaseoutStart: 9800, phaseoutStartMfj: 16370, phaseoutEnd: 17640, phaseoutEndMfj: 24210 },
    { creditRate: 0.34, phaseoutRate: 0.1598, earnedIncomeAmount: 11750, maxCredit: 3995, phaseoutStart: 21560, phaseoutStartMfj: 28120, phaseoutEnd: 46560, phaseoutEndMfj: 53120 },
    { creditRate: 0.4, phaseoutRate: 0.2106, earnedIncomeAmount: 16510, maxCredit: 6604, phaseoutStart: 21560, phaseoutStartMfj: 28120, phaseoutEnd: 52918, phaseoutEndMfj: 59478 },
    { creditRate: 0.45, phaseoutRate: 0.2106, earnedIncomeAmount: 16510, maxCredit: 7430, phaseoutStart: 21560, phaseoutStartMfj: 28120, phaseoutEnd: 56838, phaseoutEndMfj: 63398 }
  ],
  ptcRequiredContributionPercentage: 0.0912,
  ptcRepaymentCaps: [
    { maxFplPct: 200, singleCap: 350, otherCap: 700 },
    { maxFplPct: 300, singleCap: 900, otherCap: 1800 },
    { maxFplPct: 400, singleCap: 1500, otherCap: 3000 }
  ],
  get foreignHousingLimits(): F1040Config["foreignHousingLimits"] {
    return unavailableHistoricalRule(2023, "foreignHousingLimits");
  },
  get smallAgriBiodieselSales(): F1040Config["smallAgriBiodieselSales"] {
    return unavailableHistoricalRule(2023, "smallAgriBiodieselSales");
  },
  get renewableProductionRates(): F1040Config["renewableProductionRates"] {
    return unavailableHistoricalRule(2023, "renewableProductionRates");
  },
  get paidLeaveCompensationLimit(): F1040Config["paidLeaveCompensationLimit"] {
    return unavailableHistoricalRule(2023, "paidLeaveCompensationLimit");
  },
  get employerProvidedChildcare(): F1040Config["employerProvidedChildcare"] {
    return unavailableHistoricalRule(2023, "employerProvidedChildcare");
  },
  get retirementContributionCreditWageLimit(): F1040Config["retirementContributionCreditWageLimit"] {
    return unavailableHistoricalRule(2023, "retirementContributionCreditWageLimit");
  },
  get form2210fPenaltyRate(): F1040Config["form2210fPenaltyRate"] {
    return unavailableHistoricalRule(2023, "form2210fPenaltyRate");
  },
};
