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
};

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
