import { NextResponse } from "next/server";

import { MAX_SYMBOLS, SCAN_EMA_FAST, SCAN_EMA_SLOW } from "@/lib/constants";
import {
  fetchCandles,
  fetchEmaIndicator,
  fetchProfile,
  fetchQuote,
} from "@/lib/twelvedata";
import {
  lastDayVolume,
  detectEmaCrossesInWindow,
  emaFiltersEnabledForResolution,
  evaluateScanPasses,
  parseScanConfig,
  passesAllEnabledFilters,
} from "@/lib/scan-utils";
import type {
  EmaSnapshot,
  ScanConfig,
  ScanMetrics,
  ScanResolution,
  ScanStockRow,
} from "@/lib/scan-types";
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

function lastEmaValue(series: number[] | undefined): number | null {
  if (!series?.length) return null;
  const v = series[series.length - 1];
  return Number.isFinite(v) ? v : null;
}

async function fetchEmaData(
  ticker: string,
  apiKey: string,
  resolution: ScanResolution,
  now: number,
): Promise<{
  snapshot: EmaSnapshot;
  cross: ScanMetrics["emaCross"][ScanResolution];
}> {
  const { from, to } = lookbackWindow(resolution, now);
  const [fast, slow] = await Promise.all([
    fetchEmaIndicator(ticker, apiKey, resolution, from, to, SCAN_EMA_FAST),
    fetchEmaIndicator(ticker, apiKey, resolution, from, to, SCAN_EMA_SLOW),
  ]);

  const errors: string[] = [];
  if (!fast.ok) errors.push(`EMA${SCAN_EMA_FAST}: ${fast.error}`);
  if (!slow.ok) errors.push(`EMA${SCAN_EMA_SLOW}: ${slow.error}`);

  const ema8 = fast.ok ? lastEmaValue(fast.data.ema) : null;
  const ema21 = slow.ok ? lastEmaValue(slow.data.ema) : null;

  console.log(
    `[scan] ${ticker} ${resolution} EMA${SCAN_EMA_FAST}=${ema8 ?? "—"} EMA${SCAN_EMA_SLOW}=${ema21 ?? "—"}${errors.length ? ` errors: ${errors.join("; ")}` : ""}`,
  );

  const snapshot: EmaSnapshot = {
    ema8,
    ema21,
    error: errors.length ? errors.join("; ") : null,
  };

  if (!fast.ok || !slow.ok) {
    return { snapshot, cross: null };
  }

  const timestamps = fast.data.t?.length ? fast.data.t : slow.data.t;
  const cross = detectEmaCrossesInWindow(
    fast.data.ema!,
    slow.data.ema!,
    timestamps,
    resolution,
  );
  return { snapshot, cross };
}

async function scanSymbol(
  ticker: string,
  apiKey: string,
  config: ScanConfig,
  now: number,
): Promise<ScanStockRow> {
  const needsCandles = config.enabled.minVolume;
  const candleLookback = now - 90 * DAY_SEC;

  const [quote, profile, candles] = await Promise.all([
    fetchQuote(ticker, apiKey),
    fetchProfile(ticker, apiKey),
    needsCandles ? fetchCandles(ticker, apiKey, candleLookback, now, "D") : null,
  ]);

  const price = quote?.c ?? null;
  const marketCapMillions = profile?.marketCapitalization ?? null;
  const lastVol = candles?.v?.length ? lastDayVolume(candles.v) : null;

  const ema: ScanMetrics["ema"] = { D: null, "30": null, "60": null };
  const emaCross: ScanMetrics["emaCross"] = { D: null, "30": null, "60": null };

  for (const resolution of SCAN_RESOLUTIONS) {
    const { bullish, bearish } = emaFiltersEnabledForResolution(config.enabled, resolution);
    if (!bullish && !bearish) continue;
    const result = await fetchEmaData(ticker, apiKey, resolution, now);
    ema[resolution] = result.snapshot;
    emaCross[resolution] = result.cross;
  }

  const metrics: ScanMetrics = {
    price,
    lastDayVolume: lastVol,
    marketCapMillions,
    ema,
    emaCross,
  };

  const passes = evaluateScanPasses(metrics, config);

  return {
    ticker,
    name: quote?.name?.trim() || profile?.name?.trim() || ticker,
    metrics,
    passes,
    passesAll: passesAllEnabledFilters(passes),
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing TWELVE_DATA_API_KEY environment variable." },
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
    scanSymbol(ticker, apiKey, config, now),
  );

  const orderIndex = Object.fromEntries(unique.map((sym, i) => [sym, i]));
  rows.sort((a, b) => (orderIndex[a.ticker] ?? 0) - (orderIndex[b.ticker] ?? 0));

  return NextResponse.json({ rows, scannedAt: Date.now() });
}
