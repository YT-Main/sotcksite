import type { CandleResolution } from "@/lib/finnhub";

export type ScanResolution = CandleResolution;

export type ScanFilterToggles = {
  minVolume: boolean;
  minPrice: boolean;
  minMarketCap: boolean;
  emaBullishD: boolean;
  emaBearishD: boolean;
  emaBullish30: boolean;
  emaBearish30: boolean;
  emaBullish60: boolean;
  emaBearish60: boolean;
};

export type ScanThresholds = {
  /** Minimum 20-day average daily share volume */
  minAvgVolume: number;
  /** Minimum current price (USD) */
  minPrice: number;
  /** Minimum market cap (billions USD) */
  minMarketCapBillions: number;
};

export type ScanConfig = {
  enabled: ScanFilterToggles;
  thresholds: ScanThresholds;
};

/** @deprecated Use ScanConfig — kept for localStorage migration */
export type ScanFilters = ScanFilterToggles;

export const DEFAULT_SCAN_THRESHOLDS: ScanThresholds = {
  minAvgVolume: 1_000_000,
  minPrice: 5,
  minMarketCapBillions: 10,
};

export const DEFAULT_SCAN_TOGGLES: ScanFilterToggles = {
  minVolume: false,
  minPrice: false,
  minMarketCap: false,
  emaBullishD: false,
  emaBearishD: false,
  emaBullish30: false,
  emaBearish30: false,
  emaBullish60: false,
  emaBearish60: false,
};

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  enabled: { ...DEFAULT_SCAN_TOGGLES },
  thresholds: { ...DEFAULT_SCAN_THRESHOLDS },
};

export type EmaCrossState = {
  bullish: boolean;
  bearish: boolean;
  bullishCrossDay: string | null;
  bearishCrossDay: string | null;
};

export type ScanMetrics = {
  price: number | null;
  avgVolume20: number | null;
  marketCapMillions: number | null;
  emaCross: Record<ScanResolution, EmaCrossState | null>;
};

export type ScanPassResults = {
  minVolume: boolean | null;
  minPrice: boolean | null;
  minMarketCap: boolean | null;
  emaBullishD: boolean | null;
  emaBearishD: boolean | null;
  emaBullish30: boolean | null;
  emaBearish30: boolean | null;
  emaBullish60: boolean | null;
  emaBearish60: boolean | null;
};

export type ScanStockRow = {
  ticker: string;
  name: string;
  metrics: ScanMetrics;
  passes: ScanPassResults;
  passesAll: boolean;
};

export const SCAN_RESOLUTIONS: ScanResolution[] = ["D", "30", "60"];

export const SCAN_RESOLUTION_LABELS: Record<ScanResolution, string> = {
  D: "Daily",
  "30": "30 min",
  "60": "Hourly",
};
