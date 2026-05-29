const BASE = "https://finnhub.io/api/v1";

export type FinnhubQuote = {
  c?: number | null;
  h?: number | null;
  l?: number | null;
  o?: number | null;
  pc?: number | null;
  t?: number;
};

export type FinnhubProfile2 = {
  name?: string | null;
  ticker?: string | null;
  marketCapitalization?: number | null;
};

export type FinnhubCandles = {
  c?: number[];
  t?: number[];
  v?: number[];
  s?: string;
};

export type FinnhubIndicator = {
  t?: number[];
  ema?: number[];
  s?: string;
};

export type FinnhubFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CandleResolution = "D" | "30" | "60";

function withToken(searchParams: Record<string, string>, token: string) {
  return new URLSearchParams({ ...searchParams, token }).toString();
}

export async function fetchFinnhubQuote(
  symbol: string,
  token: string,
): Promise<FinnhubQuote | null> {
  const qs = withToken({ symbol }, token);
  const res = await fetch(`${BASE}/quote?${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchFinnhubProfile(
  symbol: string,
  token: string,
): Promise<FinnhubProfile2 | null> {
  const qs = withToken({ symbol }, token);
  const res = await fetch(`${BASE}/stock/profile2?${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.error) return null;
  return data;
}

export async function fetchFinnhubCandles(
  symbol: string,
  token: string,
  from: number,
  to: number,
  resolution: CandleResolution = "D",
): Promise<FinnhubCandles | null> {
  const qs = withToken(
    { symbol, resolution, from: String(from), to: String(to) },
    token,
  );
  const res = await fetch(`${BASE}/stock/candle?${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as FinnhubCandles;
  if (data?.s !== "ok" || !Array.isArray(data.c) || !data.c.length) return null;
  return data;
}

export async function fetchFinnhubIndicator(
  symbol: string,
  token: string,
  resolution: CandleResolution,
  from: number,
  to: number,
  timeperiod: number,
): Promise<FinnhubFetchResult<FinnhubIndicator>> {
  const qs = withToken(
    {
      symbol,
      resolution,
      from: String(from),
      to: String(to),
      indicator: "ema",
      timeperiod: String(timeperiod),
    },
    token,
  );
  try {
    const res = await fetch(`${BASE}/indicator?${qs}`, { cache: "no-store" });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (typeof errBody?.error === "string") msg = errBody.error;
      } catch {
        /* ignore */
      }
      return { ok: false, error: `Finnhub ${res.status}: ${msg}` };
    }
    const data = (await res.json()) as FinnhubIndicator;
    if (data?.s !== "ok") {
      const status = data?.s ?? "unknown";
      const msg =
        status === "no_data"
          ? "No EMA data for this symbol/resolution"
          : `Indicator status: ${status}`;
      return { ok: false, error: msg };
    }
    if (!Array.isArray(data.ema) || !data.ema.length) {
      return { ok: false, error: "Empty EMA series returned" };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to fetch EMA indicator",
    };
  }
}
