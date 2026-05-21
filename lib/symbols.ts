export function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/^US:/, "");
  if (!s || !/^[A-Z0-9.-]{1,10}$/.test(s)) return null;
  return s;
}
