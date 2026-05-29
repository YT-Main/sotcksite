import { NextResponse } from "next/server";

import { MAX_SYMBOLS, SCAN_ADTV_DAYS, SCAN_EMA_FAST, SCAN_EMA_SLOW } from "@/lib/constants";
import {
  fetchFinnhubCandles,
  fetchFinnhubIndicator,
  fetchFinnhubProfile,
  fetchFinnhubQuote,
} from "@/lib/finnhub";
import {
  averageDailyVolume,
  detectEmaCrossesInWindow,
  emaFiltersEnabledForResolution,
  evaluateScanPasses,
  parseScanConfig,
  passesAllEnabledFilters,
} from "@/lib/scan-utils";
import type { ScanConfig, ScanMetrics, ScanResolution, ScanStockRow } from "@/lib/scan-types";
import { SCAN_RESOLUTIONS } from "@/lib/scan-types";
import { normalizeSymbol } from "@/lib/symbols";

const DAY_SEC = 24 * 60 * 60;

const LOOKBACK_DAYS: Record<ScanResolution, number> = {
  D: 120,
  "30": 10,
  "60": 14,
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function lookbackWindow(resolution: ScanResolution, now: number): { from: number; to: number } {
  const days = LOOKBACK_DAYS[resolution];
  return { from: now - days * DAY_SEC, to: now };
}

async function fetchEmaCross(
  ticker: string,
  token: string,
  resolution: ScanResolution,
  now: number,
): Promise<ScanMetrics["emaCross"][ScanResolution]> {
  const { from, to } = lookbackWindow(resolution, now);
  const [fast, slow] = await Promise.all([
    fetchFinnhubIndicator(ticker, token, resolution, from, to, SCAN_EMA_FAST),
    fetchFinnhubIndicator(ticker, token, resolution, from, to, SCAN_EMA_SLOW),
  ]);
  if (!fast?.ema || !slow?.ema) return null;
  const timestamps = fast.t?.length ? fast.t : slow.t;
  return detectEmaCrossesInWindow(fast.ema, slow.ema, timestamps, resolution);
}

async function scanSymbol(
  ticker: string,
  token: string,
  config: ScanConfig,
  now: number,
): Promise<ScanStockRow> {
  const needsCandles = config.enabled.minVolume;
  const candleLookback = now - 90 * DAY_SEC;

  const [quote, profile, candles] = await Promise.all([
    fetchFinnhubQuote(ticker, token),
    fetchFinnhubProfile(ticker, token),
    needsCandles ? fetchFinnhubCandles(ticker, token, candleLookback, now, "D") : null,
  ]);

  const price = quote?.c ?? null;
  const marketCapMillions = profile?.marketCapitalization ?? null;
  const avgVolume20 =
    candles?.v && candles.v.length >= SCAN_ADTV_DAYS
      ? averageDailyVolume(candles.v, SCAN_ADTV_DAYS)
      : null;

  const emaCross: ScanMetrics["emaCross"] = { D: null, "30": null, "60": null };

  for (const resolution of SCAN_RESOLUTIONS) {
    const { bullish, bearish } = emaFiltersEnabledForResolution(config.enabled, resolution);
    if (!bullish && !bearish) continue;
    emaCross[resolution] = await fetchEmaCross(ticker, token, resolution, now);
  }

  const metrics: ScanMetrics = {
    price,
    avgVolume20,
    marketCapMillions,
    emaCross,
  };

  const passes = evaluateScanPasses(metrics, config);

  return {
    ticker,
    name: profile?.name?.trim() || ticker,
    metrics,
    passes,
    passesAll: passesAllEnabledFilters(passes),
  };
}

export async function POST(request: Request) {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Missing FINNHUB_API_KEY environment variable." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw =
    typeof body === "object" && body !== null ? (body as { symbols?: unknown }).symbols : null;
  const configRaw =
    typeof body === "object" && body !== null
      ? (body as { config?: unknown; filters?: unknown }).config ??
        (body as { filters?: unknown }).filters
      : null;

  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Expected { symbols: string[], config?: ScanConfig }." },
      { status: 400 },
    );
  }

  const config = parseScanConfig(configRaw);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const n = normalizeSymbol(String(item ?? ""));
    if (!n || seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
    if (unique.length >= MAX_SYMBOLS) break;
  }

  if (!unique.length) {
    return NextResponse.json({ rows: [] as ScanStockRow[], scannedAt: Date.now() });
  }

  const now = Math.floor(Date.now() / 1000);

  const rows = await mapWithConcurrency(unique, 2, (ticker) =>
    scanSymbol(ticker, token, config, now),
  );

  const orderIndex = Object.fromEntries(unique.map((sym, i) => [sym, i]));
  rows.sort((a, b) => (orderIndex[a.ticker] ?? 0) - (orderIndex[b.ticker] ?? 0));

  return NextResponse.json({ rows, scannedAt: Date.now() });
}
