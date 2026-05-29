export function sma(closes: number[], period: number): number | null {
  if (period <= 0 || closes.length < period) return null;
  const slice = closes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

/** % change from close ~5 trading days ago to current price */
export function weeklyGainPercent(closes: number[], currentPrice: number): number | null {
  if (closes.length < 6 || !Number.isFinite(currentPrice)) return null;
  const weekAgoClose = closes[closes.length - 6];
  if (!Number.isFinite(weekAgoClose) || weekAgoClose === 0) return null;
  return ((currentPrice - weekAgoClose) / weekAgoClose) * 100;
}

export function meetsThreshold(
  value: number | null,
  rule: { comparator: "above" | "below"; threshold: number } | null,
): boolean {
  if (value === null || !rule || !Number.isFinite(value)) return false;
  return rule.comparator === "above" ? value >= rule.threshold : value <= rule.threshold;
}

export function meetsMaRule(
  price: number | null,
  ma: number | null,
  rule: { comparator: "above" | "below" } | null,
): boolean {
  if (price === null || ma === null || !rule) return false;
  return rule.comparator === "above" ? price >= ma : price <= ma;
}
