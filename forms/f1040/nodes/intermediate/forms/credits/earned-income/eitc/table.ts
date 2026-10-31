import type { EitcMaximumRounding, EitcParameters } from "../../../../../config/types.ts";

const BAND_WIDTH = 50;

/**
 * The IRS EIC Table for one year's IRC §32(b) parameters. Each $50 row is the
 * credit at the row's midpoint, rounded to the dollar: the credit rate times
 * the midpoint, or the applicable maximum once the row reaches the earned
 * income amount, less the phaseout rate times the midpoint's excess over the
 * phaseout start once the row lies wholly above that start. The row holding
 * the completed phaseout amount is split there: below it the credit uses the
 * remaining band's midpoint, and at or above it no credit is allowed.
 * The "rounded" policy uses the rounded maximum for full bands and the
 * unrounded maximum for terminal bands, reproducing the published TY2025 table.
 * TY2021–2023 instead retain the unrounded statutory maximum throughout;
 * TY2024 uses the rounded maximum throughout, including its terminal
 * footnotes. See annual-rules-sources.json and historical.test.ts.
 */
export function lookupEicFromParameters(
  table: ReadonlyArray<EitcParameters>,
  amount: number,
  children: number,
  joint: boolean,
  maximumRounding: EitcMaximumRounding,
): number {
  const params = table[Math.min(children, 3)];
  const end = joint ? params.phaseoutEndMfj : params.phaseoutEnd;
  if (amount < 1 || amount >= end) return 0;
  const low = Math.floor(amount / BAND_WIDTH) * BAND_WIDTH;
  const split = low + BAND_WIDTH > end;
  const midpoint = (low + (split ? end : low + BAND_WIDTH)) / 2;
  // Historical statutory rates have at most four decimal places. Work in
  // 1/10,000-dollar units so half-dollar results do not drift below .50.
  // Preserve the existing floating-point calculation for rounded profiles.
  const units = maximumRounding === "unrounded" ? 10_000 : 1;
  const creditRate = maximumRounding === "unrounded"
    ? Math.round(params.creditRate * units)
    : params.creditRate;
  const phaseoutRate = maximumRounding === "unrounded"
    ? Math.round(params.phaseoutRate * units)
    : params.phaseoutRate;
  const maximum = maximumRounding === "unrounded" ||
      (split && maximumRounding === "rounded")
    ? creditRate * params.earnedIncomeAmount
    : params.maxCredit;
  const phaseIn = low + BAND_WIDTH > params.earnedIncomeAmount
    ? maximum
    : creditRate * midpoint;
  const phaseoutStart = joint ? params.phaseoutStartMfj : params.phaseoutStart;
  const reduction = low >= phaseoutStart
    ? phaseoutRate * (midpoint - phaseoutStart)
    : 0;
  const credit = phaseIn - reduction;
  return Math.max(0, Math.round(credit / units));
}
