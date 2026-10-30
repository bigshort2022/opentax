// forms/f1040/nodes/config/index.ts
//
// CONFIG_BY_YEAR — year-keyed config for all config-injected f1040 nodes.
//
// To add a new tax year, export `config{year}: F1040Config` from ./{year}.ts
// and add it here. Nodes read CONFIG_BY_YEAR[ctx.taxYear].
import { config2021 } from "./2021.ts";
import { config2022 } from "./2022.ts";
import { config2023 } from "./2023.ts";
import { config2024 } from "./2024.ts";
import { config2025 } from "./2025.ts";
import { config2026 } from "./2026.ts";
import { FilingStatus } from "../types.ts";
import type { F1040Config } from "./types.ts";
export type { F1040Config } from "./types.ts";

const historicalConfigs = {
  2021: config2021,
  2022: config2022,
  2023: config2023,
  2024: config2024,
};

export function isHistoricalTaxYear(taxYear: number): boolean {
  return Object.hasOwn(historicalConfigs, taxYear);
}

export const CONFIG_BY_YEAR: Record<number, F1040Config> = {
  ...historicalConfigs,
  2025: config2025,
  2026: config2026,
};

export function configForYear(taxYear: number): F1040Config {
  const cfg = CONFIG_BY_YEAR[taxYear];
  if (!cfg) throw new Error(`No f1040 config for year ${taxYear}`);
  return cfg;
}

/** Prior-year Form 8889 testing-period limits do not register a 2020 return. */
export const HSA_LIMITS_BY_YEAR: Readonly<Record<number, {
  readonly selfOnly: number;
  readonly family: number;
  readonly catchup: number;
}>> = {
  // 2020 Instructions for Form 8889, line 3.
  2020: { selfOnly: 3_550, family: 7_100, catchup: 1_000 },
  ...Object.fromEntries(Object.entries(CONFIG_BY_YEAR).map(([year, cfg]) => [
    year,
    { selfOnly: cfg.hsaSelfOnlyLimit, family: cfg.hsaFamilyLimit, catchup: cfg.hsaCatchup },
  ])),
};

/**
 * Single-dependent standard deduction and filing-threshold inputs (Pub. 501
 * Table 2; IRC §63(c)(5), §63(f)). A person is 65 on the day before the 65th
 * birthday, so "65 or older" means born before January 2 of year - 64.
 */
export function dependentFilingThresholds(taxYear: number) {
  const cfg = configForYear(taxYear);
  return {
    singleStandardDeduction: cfg.standardDeductionBase[FilingStatus.Single],
    jointStandardDeduction: cfg.standardDeductionBase[FilingStatus.MFJ],
    floor: cfg.dependentStandardDeductionFloor,
    earnedIncomeAddOn: cfg.dependentStandardDeductionEarnedIncomeAddOn,
    unmarriedAgeBlindAddition:
      cfg.standardDeductionAdditional[FilingStatus.Single],
    jointAgeBlindAddition: cfg.standardDeductionAdditional[FilingStatus.MFJ],
    age65BornBefore: `${taxYear - 64}-01-02`,
  };
}
