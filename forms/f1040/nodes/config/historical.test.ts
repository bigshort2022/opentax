import { test } from "bun:test";
import { assertEquals, assertThrows } from "@std/assert";
import { FilingStatus } from "../types.ts";
import { configForYear, HSA_LIMITS_BY_YEAR } from "./index.ts";
import { ordinaryTaxForYear, preferentialRateSchedule } from "../intermediate/worksheets/taxes/calculation/year_schedule.ts";
import { qualifiedDividendTax } from "../intermediate/worksheets/taxes/calculation/tax_table_2025.ts";
import { nonitemizerCharitableDeduction } from "../intermediate/worksheets/deductions/standard/standard_deduction/deduction-limits-2026.ts";
import { form6251 } from "../intermediate/forms/taxes/amt/form6251/index.ts";

// Archived Form 1040 instructions, Tax Table row $50,000–$50,050.
for (const [year, single, joint, hoh] of [
  [2021, 6754, 5605, 5719], [2022, 6623, 5592, 5710],
  [2023, 6313, 5563, 5689], [2024, 6059, 5539, 5672],
]) {
  test(`${year} uses published Tax Table cells, not exact-income brackets`, () => {
    for (const [status, expected] of [
      [FilingStatus.Single, single], [FilingStatus.MFS, single],
      [FilingStatus.MFJ, joint], [FilingStatus.QSS, joint], [FilingStatus.HOH, hoh],
    ] as const) {
      assertEquals(ordinaryTaxForYear(50_000, status, year), expected);
      assertEquals(ordinaryTaxForYear(50_049, status, year), expected);
      assertEquals(ordinaryTaxForYear(0, status, year), 0);
      assertEquals(ordinaryTaxForYear(5, status, year), 1);
      assertEquals(ordinaryTaxForYear(3_000, status, year), 303);
    }
    assertThrows(() => ordinaryTaxForYear(-1, FilingStatus.Single, year));
  });
}

test("historical qualified dividends use the year's zero-rate boundary and ordinary tax table", () => {
  // 2021 QDCGT worksheet: $40,400 at 0%, next $9,600 at 15%.
  assertEquals(qualifiedDividendTax(50_000, 50_000, 0, FilingStatus.Single, preferentialRateSchedule(2021)), 1440);
  // 2024: $47,025 at 0%, next $2,975 at 15%, rounded at line 25.
  assertEquals(qualifiedDividendTax(50_000, 25_000, 25_000, FilingStatus.Single, preferentialRateSchedule(2024)), 446);
  assertEquals(ordinaryTaxForYear(100_000, FilingStatus.Single, 2021), 18021);
  assertEquals(ordinaryTaxForYear(100_000, FilingStatus.Single, 2024), 17053);
});

test("historical deductions and annual employment limits are not current-year values", () => {
  for (const [year, standard, extra, ss, hsa, qbi] of [
    [2021, 12550, 1700, 142800, 3600, 164900],
    [2022, 12950, 1750, 147000, 3650, 170050],
    [2023, 13850, 1850, 160200, 3850, 182100],
    [2024, 14600, 1950, 168600, 4150, 191950],
  ]) {
    const cfg = configForYear(year);
    assertEquals(cfg.standardDeductionBase[FilingStatus.Single], standard);
    assertEquals(cfg.standardDeductionAdditional[FilingStatus.Single], extra);
    assertEquals(cfg.ssWageBase, ss);
    assertEquals(cfg.hsaSelfOnlyLimit, hsa);
    assertEquals(cfg.qbiThresholdSingle, qbi);
    assertEquals(cfg.saltCap, 10000);
    assertEquals(cfg.seniorDeductionMax, 0);
    assertEquals(cfg.qualifiedTipsCap, 0);
    assertEquals(cfg.qualifiedOvertimeCap, 0);
    assertEquals(cfg.vehicleLoanInterestCap, 0);
  }
  assertEquals(configForYear(2021).qbiThresholdMfs, 164925);
  assertEquals(HSA_LIMITS_BY_YEAR[2020], { selfOnly: 3550, family: 7100, catchup: 1000 });
  assertThrows(() => configForYear(1900));
});

test("only 2021 permits the historical nonitemizer cash deduction", () => {
  assertEquals(nonitemizerCharitableDeduction(configForYear(2021), FilingStatus.Single, 500), 300);
  assertEquals(nonitemizerCharitableDeduction(configForYear(2021), FilingStatus.MFJ, 800), 600);
  assertEquals(nonitemizerCharitableDeduction(configForYear(2021), FilingStatus.MFS, 800), 300);
  for (const year of [2022, 2023, 2024, 2025]) {
    assertEquals(nonitemizerCharitableDeduction(configForYear(year), FilingStatus.Single, 500), 0);
  }
  assertEquals(configForYear(2021).mortgageInsurancePremiumsDeductible, true);
  assertEquals(configForYear(2022).mortgageInsurancePremiumsDeductible, false);
});

test("the final historical Tax Table band stops at $100,000", () => {
  for (const [year, single, joint, hoh] of [
    [2021, 18015, 13492, 16563], [2022, 17830, 13229, 16330],
    [2023, 17394, 12610, 15788], [2024, 17048, 12101, 15354],
  ]) {
    for (const [status, expected] of [
      [FilingStatus.Single, single], [FilingStatus.MFS, single],
      [FilingStatus.MFJ, joint], [FilingStatus.QSS, joint],
      [FilingStatus.HOH, hoh],
    ] as const) {
      assertEquals(ordinaryTaxForYear(99_950, status, year), expected);
      assertEquals(ordinaryTaxForYear(99_999, status, year), expected);
    }
  }
});

test("historical AMT exemptions affect actual Form 6251 tax", () => {
  // Isolate the 26% calculation with zero regular-tax offset, no adjustments.
  for (const [year, exemption, tax] of [
    [2021, 73600, 6864], [2022, 75900, 6266],
    [2023, 81300, 4862], [2024, 85700, 3718],
  ]) {
    const result = form6251.compute({ taxYear: year, formType: "f1040" }, {
      filing_status: FilingStatus.Single,
      regular_tax_income: 100_000, regular_taxable_income: 100_000,
      regular_tax: 0,
    });
    const fields = result.outputs.find((o) => o.nodeType === "form6251")?.fields;
    assertEquals(fields?.exemption, exemption);
    assertEquals(fields?.tentative_tax, tax);
  }
});
