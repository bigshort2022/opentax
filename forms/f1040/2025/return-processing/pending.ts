/**
 * Format-neutral normalization of the raw executor pending dict.
 *
 * The executor promotes a pending value to an array when multiple nodes write
 * to the same key. Both MEF and PDF builders expect scalar calculated lines,
 * so this module resolves most all-numeric arrays to their last element (the
 * most recently computed value). Independent Schedule E sources are additive.
 * Form 8995 QBI contributions are additive, as in its calculation input.
 * Form 4952 source arrays retain their per-payer amounts for export review.
 * Form 8962 monthly source vectors retain all twelve positions.
 * Historical Form 461 K-1 business amounts are signed additive contributions.
 */
const additiveNumericKeys = new Set([
  "line2g_pab_interest",
  "line5_schedule_e",
  "eic_passive_k1_income",
]);

export function normalizePendingDict(
  raw: unknown,
  nodeType: string,
): Record<string, unknown> | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((v) => typeof v === "number")
    ) {
      result[key] = (nodeType === "form4952" && key.startsWith("source_")) ||
          (nodeType === "form8962" &&
            (key === "monthly_premiums" || key === "monthly_slcsps" ||
              key === "monthly_aptcs"))
        ? value
        : additiveNumericKeys.has(key) ||
            (nodeType === "agi_aggregator" &&
              (key === "line1h_other_earned" || key === "tax_exempt_interest" ||
                key === "line3b_ordinary_dividends" ||
                key === "pal_current_income" ||
                key === "pal_rental_income")) ||
            (nodeType === "form8995" && key === "qbi") ||
            (nodeType === "form461" && key === "historical_k1_business_income_loss") ||
            (nodeType === "form8582" &&
              (key === "current_income" || key === "rental_current_income"))
        ? value.reduce((sum, amount) => sum + amount, 0)
        : value[value.length - 1];
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Normalize all keys in a raw pending dict. */
export function normalizeAllPending(
  pending: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(pending)) {
    const normalized = normalizePendingDict(pending[key], key);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return result;
}
