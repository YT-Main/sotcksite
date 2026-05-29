import { SCAN_EMA_CROSS_TRADING_DAYS } from "@/lib/constants";
import {
  DEFAULT_SCAN_CONFIG,
  DEFAULT_SCAN_THRESHOLDS,
  type EmaCrossState,
  type ScanConfig,
  type ScanFilterToggles,
  type ScanMetrics,
  type ScanPassResults,
  type ScanResolution,
  type ScanThresholds,
} from "@/lib/scan-types";

export function lastDayVolume(volumes: number[]): number | null {
  const valid = volumes.filter((v) => Number.isFinite(v) && v >= 0);
  if (!valid.length) return null;
  return valid[valid.length - 1];
}

function dayKeyFromUnix(sec: number): number {
  const d = new Date(sec * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function formatCrossDay(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function lastNTradingDayKeys(timestamps: number[], n: number): Set<number> {
  const keys = new Set<number>();
  for (let i = timestamps.length - 1; i >= 0 && keys.size < n; i--) {
    if (!Number.isFinite(timestamps[i])) continue;
    keys.add(dayKeyFromUnix(timestamps[i]));
  }
  return keys;
}

function indexInLastTradingDays(
  timestamps: number[] | undefined,
  index: number,
  resolution: ScanResolution,
  tradingDays: number,
): boolean {
  if (!timestamps?.length || index >= timestamps.length) {
    if (resolution === "D") {
      const len = timestamps?.length ?? 0;
      return index >= Math.max(1, len - tradingDays);
    }
    return false;
  }

  if (resolution === "D") {
    const len = timestamps.length;
    return index >= Math.max(1, len - tradingDays);
  }

  const allowed = lastNTradingDayKeys(timestamps, tradingDays);
  return allowed.has(dayKeyFromUnix(timestamps[index]));
}

export function detectEmaCrossesInWindow(
  ema8: number[],
  ema21: number[],
  timestamps: number[] | undefined,
  resolution: ScanResolution,
  tradingDays = SCAN_EMA_CROSS_TRADING_DAYS,
): EmaCrossState | null {
  const len = Math.min(ema8.length, ema21.length);
  if (len < 2) return null;

  let bullish = false;
  let bearish = false;
  let bullishCrossDay: string | null = null;
  let bearishCrossDay: string | null = null;
  let bullishAt = -1;
  let bearishAt = -1;

  for (let i = 1; i < len; i++) {
    if (!indexInLastTradingDays(timestamps, i, resolution, tradingDays)) continue;

    const prev8 = ema8[i - 1];
    const prev21 = ema21[i - 1];
    const cur8 = ema8[i];
    const cur21 = ema21[i];
    if (
      !Number.isFinite(prev8) ||
      !Number.isFinite(prev21) ||
      !Number.isFinite(cur8) ||
      !Number.isFinite(cur21)
    ) {
      continue;
    }

    const ts = timestamps?.[i];
    const at = Number.isFinite(ts) ? (ts as number) : i;

    if (prev8 <= prev21 && cur8 > cur21 && at >= bullishAt) {
      bullish = true;
      bullishAt = at;
      bullishCrossDay = Number.isFinite(ts) ? formatCrossDay(ts as number) : null;
    }
    if (prev8 >= prev21 && cur8 < cur21 && at >= bearishAt) {
      bearish = true;
      bearishAt = at;
      bearishCrossDay = Number.isFinite(ts) ? formatCrossDay(ts as number) : null;
    }
  }

  if (!bullish && !bearish) return null;

  return { bullish, bearish, bullishCrossDay, bearishCrossDay };
}

export function emaFiltersEnabledForResolution(
  enabled: ScanFilterToggles,
  resolution: ScanResolution,
): { bullish: boolean; bearish: boolean } {
  if (resolution === "D") {
    return { bullish: enabled.emaBullishD, bearish: enabled.emaBearishD };
  }
  if (resolution === "30") {
    return { bullish: enabled.emaBullish30, bearish: enabled.emaBearish30 };
  }
  return { bullish: enabled.emaBullish60, bearish: enabled.emaBearish60 };
}

export function anyScanFilterEnabled(config: ScanConfig): boolean {
  return Object.values(config.enabled).some(Boolean);
}

export function marketCapMillionsFromBillions(billions: number): number {
  return billions * 1_000;
}

export function evaluateScanPasses(metrics: ScanMetrics, config: ScanConfig): ScanPassResults {
  const { enabled, thresholds } = config;
  const minCapMillions = marketCapMillionsFromBillions(thresholds.minMarketCapBillions);

  const emaPass = (
    resolution: ScanResolution,
    kind: "bullish" | "bearish",
  ): boolean | null => {
    const onFlags = emaFiltersEnabledForResolution(enabled, resolution);
    const on = kind === "bullish" ? onFlags.bullish : onFlags.bearish;
    if (!on) return null;
    const cross = metrics.emaCross[resolution];
    if (!cross) return false;
    return kind === "bullish" ? cross.bullish : cross.bearish;
  };

  return {
    minVolume: enabled.minVolume
      ? metrics.lastDayVolume !== null && metrics.lastDayVolume > thresholds.minLastDayVolume
      : null,
    minPrice: enabled.minPrice
      ? metrics.price !== null && metrics.price > thresholds.minPrice
      : null,
    minMarketCap: enabled.minMarketCap
      ? metrics.marketCapMillions !== null && metrics.marketCapMillions > minCapMillions
      : null,
    emaBullishD: emaPass("D", "bullish"),
    emaBearishD: emaPass("D", "bearish"),
    emaBullish30: emaPass("30", "bullish"),
    emaBearish30: emaPass("30", "bearish"),
    emaBullish60: emaPass("60", "bullish"),
    emaBearish60: emaPass("60", "bearish"),
  };
}

export function passesAllEnabledFilters(passes: ScanPassResults): boolean {
  const active = Object.values(passes).filter((v) => v !== null);
  if (!active.length) return true;
  return active.every((v) => v === true);
}

function parseThresholds(raw: unknown): ScanThresholds {
  const base = { ...DEFAULT_SCAN_THRESHOLDS };
  if (typeof raw !== "object" || raw === null) return base;
  const obj = raw as Record<string, unknown>;
  const vol =
    typeof obj.minLastDayVolume === "number"
      ? obj.minLastDayVolume
      : typeof obj.minAvgVolume === "number"
        ? obj.minAvgVolume
        : null;
  if (vol !== null && vol > 0) base.minLastDayVolume = vol;
  if (typeof obj.minPrice === "number" && obj.minPrice > 0) {
    base.minPrice = obj.minPrice;
  }
  if (typeof obj.minMarketCapBillions === "number" && obj.minMarketCapBillions > 0) {
    base.minMarketCapBillions = obj.minMarketCapBillions;
  }
  return base;
}

function parseToggles(raw: unknown): ScanFilterToggles {
  const base = { ...DEFAULT_SCAN_CONFIG.enabled };
  if (typeof raw !== "object" || raw === null) return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof ScanFilterToggles)[]) {
    if (typeof obj[key] === "boolean") base[key] = obj[key];
  }
  return base;
}

/** Accepts ScanConfig, legacy flat toggles, or { enabled, thresholds }. */
export function parseScanConfig(raw: unknown): ScanConfig {
  if (typeof raw !== "object" || raw === null) {
    return {
      enabled: { ...DEFAULT_SCAN_CONFIG.enabled },
      thresholds: { ...DEFAULT_SCAN_THRESHOLDS },
    };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.enabled !== undefined || obj.thresholds !== undefined) {
    return {
      enabled: parseToggles(obj.enabled),
      thresholds: parseThresholds(obj.thresholds),
    };
  }

  const toggles = parseToggles(raw);
  const hasThresholdKeys =
    "minLastDayVolume" in obj || "minAvgVolume" in obj || "minPrice" in obj || "minMarketCapBillions" in obj;
  return {
    enabled: toggles,
    thresholds: hasThresholdKeys ? parseThresholds(raw) : { ...DEFAULT_SCAN_THRESHOLDS },
  };
}

/** @deprecated Use parseScanConfig */
export function parseScanFilters(raw: unknown): ScanConfig {
  return parseScanConfig(raw);
}

export function emaCrossDayForPass(
  metrics: ScanMetrics,
  resolution: ScanResolution,
  kind: "bullish" | "bearish",
): string | null {
  const cross = metrics.emaCross[resolution];
  if (!cross) return null;
  return kind === "bullish" ? cross.bullishCrossDay : cross.bearishCrossDay;
}
