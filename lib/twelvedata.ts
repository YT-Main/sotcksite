const BASE = "https://api.twelvedata.com";

export type Quote = {
  c?: number | null;
  h?: number | null;
  l?: number | null;
  o?: number | null;
  pc?: number | null;
  name?: string | null;
};

export type Profile = {
  name?: string | null;
  ticker?: string | null;
  marketCapitalization?: number | null;
};

export type Candles = {
  c?: number[];
  t?: number[];
  v?: number[];
  s?: string;
};

export type IndicatorSeries = {
  t?: number[];
  ema?: number[];
  s?: string;
};

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type CandleResolution = "D" | "30" | "60";

type TwelveDataError = { status?: string; message?: string; code?: number };

type TwelveDataQuote = {
  symbol?: string;
  name?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  status?: string;
  message?: string;
};

type TwelveDataTimeSeries = {
  status?: string;
  message?: string;
  values?: Array<{
    datetime?: string;
    open?: string;
    high?: string;
    low?: string;
    close?: string;
    volume?: string;
  }>;
};

type TwelveDataEma = {
  status?: string;
  message?: string;
  values?: Array<{ datetime?: string; ema?: string }>;
};

type TwelveDataMarketCap = {
  status?: string;
  message?: string;
  meta?: { symbol?: string; name?: string };
  market_cap?: Array<{ date?: string; value?: number }>;
};

function withApiKey(searchParams: Record<string, string>, apiKey: string) {
  return new URLSearchParams({ ...searchParams, apikey: apiKey }).toString();
}

function parseNum(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseDatetime(datetime: string): number {
  const normalized = datetime.includes("T") ? datetime : datetime.replace(" ", "T");
  return Math.floor(new Date(normalized).getTime() / 1000);
}

function unixToDateString(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

function resolutionToInterval(resolution: CandleResolution): string {
  if (resolution === "D") return "1day";
  if (resolution === "30") return "30min";
  return "1h";
}

function apiError(prefix: string, status: number, body: TwelveDataError): string {
  const msg = body.message?.trim() || body.status || "Unknown error";
  return `${prefix} ${status}: ${msg}`;
}

async function fetchJson<T extends TwelveDataError>(
  url: string,
  label: string,
): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as T;
    if (!res.ok) {
      return { ok: false, error: apiError(label, res.status, data) };
    }
    if (data.status === "error") {
      return { ok: false, error: data.message?.trim() || `${label}: request failed` };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Failed to fetch ${label}`,
    };
  }
}

export async function fetchQuote(symbol: string, apiKey: string): Promise<Quote | null> {
  const qs = withApiKey({ symbol }, apiKey);
  const result = await fetchJson<TwelveDataQuote>(`${BASE}/quote?${qs}`, "Twelve Data quote");
  if (!result.ok) return null;

  const data = result.data;
  return {
    c: parseNum(data.close),
    o: parseNum(data.open),
    h: parseNum(data.high),
    l: parseNum(data.low),
    pc: parseNum(data.previous_close),
    name: data.name?.trim() || null,
  };
}

export async function fetchProfile(symbol: string, apiKey: string): Promise<Profile | null> {
  const qs = withApiKey({ symbol, outputsize: "1" }, apiKey);
  const result = await fetchJson<TwelveDataMarketCap>(
    `${BASE}/market_cap?${qs}`,
    "Twelve Data market cap",
  );
  if (!result.ok) return null;

  const data = result.data;
  const latest = data.market_cap?.[0];
  const capMillions =
    latest?.value !== undefined && Number.isFinite(latest.value)
      ? latest.value / 1_000_000
      : null;

  return {
    name: data.meta?.name?.trim() || null,
    ticker: data.meta?.symbol?.trim() || symbol,
    marketCapitalization: capMillions,
  };
}

export async function fetchCandles(
  symbol: string,
  apiKey: string,
  from: number,
  to: number,
  resolution: CandleResolution = "D",
): Promise<Candles | null> {
  const qs = withApiKey(
    {
      symbol,
      interval: resolutionToInterval(resolution),
      start_date: unixToDateString(from),
      end_date: unixToDateString(to),
      order: "asc",
    },
    apiKey,
  );
  const result = await fetchJson<TwelveDataTimeSeries>(
    `${BASE}/time_series?${qs}`,
    "Twelve Data time series",
  );
  if (!result.ok) return null;

  const values = result.data.values ?? [];
  if (!values.length) return null;

  const c: number[] = [];
  const t: number[] = [];
  const v: number[] = [];

  for (const row of values) {
    if (!row.datetime) continue;
    const close = parseNum(row.close);
    if (close === null) continue;
    c.push(close);
    t.push(parseDatetime(row.datetime));
    v.push(parseNum(row.volume) ?? 0);
  }

  if (!c.length) return null;
  return { c, t, v, s: "ok" };
}

export async function fetchEmaIndicator(
  symbol: string,
  apiKey: string,
  resolution: CandleResolution,
  from: number,
  to: number,
  timeperiod: number,
): Promise<FetchResult<IndicatorSeries>> {
  const qs = withApiKey(
    {
      symbol,
      interval: resolutionToInterval(resolution),
      time_period: String(timeperiod),
      start_date: unixToDateString(from),
      end_date: unixToDateString(to),
      order: "asc",
    },
    apiKey,
  );
  const result = await fetchJson<TwelveDataEma>(`${BASE}/ema?${qs}`, "Twelve Data EMA");
  if (!result.ok) return result;

  const values = result.data.values ?? [];
  if (!values.length) {
    return { ok: false, error: "Empty EMA series returned" };
  }

  const ema: number[] = [];
  const t: number[] = [];
  for (const row of values) {
    if (!row.datetime) continue;
    const val = parseNum(row.ema);
    if (val === null) continue;
    ema.push(val);
    t.push(parseDatetime(row.datetime));
  }

  if (!ema.length) {
    return { ok: false, error: "Empty EMA series returned" };
  }

  return { ok: true, data: { ema, t, s: "ok" } };
}
