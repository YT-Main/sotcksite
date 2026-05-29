import { NextResponse } from "next/server";

import { MAX_SYMBOLS } from "@/lib/constants";
import { fetchQuote } from "@/lib/twelvedata";
import { normalizeSymbol } from "@/lib/symbols";
import type { StockRow } from "@/lib/stock-types";

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

  const raw = typeof body === "object" && body !== null ? (body as { symbols?: unknown }).symbols : null;
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
    return NextResponse.json({ rows: [] as StockRow[] });
  }

  const rows = await Promise.all(
    unique.map(async (ticker): Promise<StockRow> => {
      const quote = await fetchQuote(ticker, apiKey);

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

      return {
        ticker,
        name: quote?.name?.trim() || ticker,
        open: quote?.o ?? null,
        prevClose,
        price,
        high: quote?.h ?? null,
        low: quote?.l ?? null,
        gainPercent,
      };
    }),
  );

  const orderIndex = Object.fromEntries(unique.map((sym, i) => [sym, i]));
  rows.sort((a, b) => (orderIndex[a.ticker] ?? 0) - (orderIndex[b.ticker] ?? 0));

  return NextResponse.json({ rows });
}
