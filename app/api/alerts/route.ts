import { NextResponse } from "next/server";

import { DEFAULT_MA_PERIOD, MAX_SYMBOLS } from "@/lib/constants";
import { sma, weeklyGainPercent } from "@/lib/indicators";
import { normalizeSymbol } from "@/lib/symbols";
import type { AlertStockRow } from "@/lib/stock-types";
import { fetchCandles, fetchQuote } from "@/lib/twelvedata";

const CANDLE_LOOKBACK_DAYS = 120;

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
  const maPeriodsRaw =
    typeof body === "object" && body !== null
      ? (body as { maPeriods?: unknown }).maPeriods
      : undefined;
  let maPeriods = [DEFAULT_MA_PERIOD];
  if (Array.isArray(maPeriodsRaw)) {
    const parsed = maPeriodsRaw
      .map((p) => Number(p))
      .filter((p) => Number.isFinite(p) && p > 0)
      .map((p) => Math.round(p));
    if (parsed.length) maPeriods = [...new Set(parsed)];
  }

  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "Expected { symbols: string[] }." }, { status: 400 });
  }

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
    return NextResponse.json({ rows: [] as AlertStockRow[] });
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - CANDLE_LOOKBACK_DAYS * 24 * 60 * 60;

  const rows = await Promise.all(
    unique.map(async (ticker): Promise<AlertStockRow> => {
      const [quote, candles] = await Promise.all([
        fetchQuote(ticker, apiKey),
        fetchCandles(ticker, apiKey, from, now),
      ]);

      const price = quote?.c ?? null;
      const prevClose = quote?.pc ?? null;
      const gainPercent =
        price !== null &&
        prevClose !== null &&
        prevClose !== 0 &&
        Number.isFinite(price) &&
        Number.isFinite(prevClose)
          ? ((price - prevClose) / prevClose) * 100
          : null;

      const closes = candles?.c ?? [];
      const weekly =
        price !== null && closes.length ? weeklyGainPercent(closes, price) : null;
      const smas: Record<number, number | null> = {};
      for (const period of maPeriods) {
        smas[period] = closes.length ? sma(closes, period) : null;
      }

      return {
        ticker,
        name: quote?.name?.trim() || ticker,
        open: quote?.o ?? null,
        prevClose,
        price,
        high: quote?.h ?? null,
        low: quote?.l ?? null,
        gainPercent,
        weeklyGainPercent: weekly,
        smas,
      };
    }),
  );

  const orderIndex = Object.fromEntries(unique.map((sym, i) => [sym, i]));
  rows.sort((a, b) => (orderIndex[a.ticker] ?? 0) - (orderIndex[b.ticker] ?? 0));

  return NextResponse.json({ rows });
}
