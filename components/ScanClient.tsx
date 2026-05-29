"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { useWatchlist } from "@/components/WatchlistProvider";
import { SCAN_EMA_CROSS_TRADING_DAYS, STORAGE_SCAN_FILTERS_KEY } from "@/lib/constants";
import {
  anyScanFilterEnabled,
  emaCrossDayForPass,
  parseScanConfig,
} from "@/lib/scan-utils";
import {
  DEFAULT_SCAN_CONFIG,
  SCAN_RESOLUTION_LABELS,
  SCAN_RESOLUTIONS,
  type ScanConfig,
  type ScanFilterToggles,
  type ScanPassResults,
  type ScanResolution,
  type ScanStockRow,
  type ScanThresholds,
} from "@/lib/scan-types";
import { normalizeSymbol } from "@/lib/symbols";

function readConfig(): ScanConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_SCAN_FILTERS_KEY);
    if (!raw) return { ...DEFAULT_SCAN_CONFIG, enabled: { ...DEFAULT_SCAN_CONFIG.enabled }, thresholds: { ...DEFAULT_SCAN_CONFIG.thresholds } };
    return parseScanConfig(JSON.parse(raw) as unknown);
  } catch {
    return {
      enabled: { ...DEFAULT_SCAN_CONFIG.enabled },
      thresholds: { ...DEFAULT_SCAN_CONFIG.thresholds },
    };
  }
}

function writeConfig(config: ScanConfig) {
  window.localStorage.setItem(STORAGE_SCAN_FILTERS_KEY, JSON.stringify(config));
}

function parseTickers(text: string): string[] {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const n = normalizeSymbol(part);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function fmtMoney(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVolume(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function fmtMarketCap(millions: number | null): string {
  if (millions === null || Number.isNaN(millions)) return "—";
  if (millions >= 1_000) return `$${(millions / 1_000).toFixed(2)}B`;
  return `$${millions.toFixed(0)}M`;
}

function emaFilterKeys(resolution: ScanResolution): {
  bullish: keyof ScanFilterToggles;
  bearish: keyof ScanFilterToggles;
} {
  if (resolution === "D") return { bullish: "emaBullishD", bearish: "emaBearishD" };
  if (resolution === "30") return { bullish: "emaBullish30", bearish: "emaBearish30" };
  return { bullish: "emaBullish60", bearish: "emaBearish60" };
}

function isEmaFilterKey(key: keyof ScanFilterToggles): boolean {
  return key.startsWith("ema");
}

function filterColumnLabel(key: keyof ScanFilterToggles, thresholds: ScanThresholds): string {
  if (key === "minVolume") return `Vol > ${fmtVolume(thresholds.minLastDayVolume)}`;
  if (key === "minPrice") return `Price > $${thresholds.minPrice}`;
  if (key === "minMarketCap") return `Mkt cap > $${thresholds.minMarketCapBillions}B`;
  if (key === "emaBullishD") return "EMA8↑21 Daily";
  if (key === "emaBearishD") return "EMA8↓21 Daily";
  if (key === "emaBullish30") return "EMA8↑21 30m";
  if (key === "emaBearish30") return "EMA8↓21 30m";
  if (key === "emaBullish60") return "EMA8↑21 60m";
  return "EMA8↓21 60m";
}

function emaResolutionForKey(key: keyof ScanFilterToggles): ScanResolution | null {
  if (key.endsWith("D")) return "D";
  if (key.includes("30")) return "30";
  if (key.includes("60")) return "60";
  return null;
}

function PassCell({
  pass,
  crossDay,
}: {
  pass: boolean | null;
  crossDay: string | null;
}) {
  if (pass === null) return <span className="text-zinc-600">—</span>;
  return (
    <div className="flex flex-col items-center gap-0.5">
      {pass ? (
        <span className="text-emerald-400">✓</span>
      ) : (
        <span className="text-rose-400">✗</span>
      )}
      {pass && crossDay && (
        <span className="text-[10px] text-zinc-500 leading-tight">{crossDay}</span>
      )}
    </div>
  );
}

export default function ScanClient() {
  const { watchlist } = useWatchlist();
  const [tickerText, setTickerText] = useState("");
  const [config, setConfig] = useState<ScanConfig>(DEFAULT_SCAN_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [rows, setRows] = useState<ScanStockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [showOnlyMatches, setShowOnlyMatches] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    setConfig(readConfig());
    setConfigReady(true);
  }, []);

  useEffect(() => {
    if (!configReady) return;
    writeConfig(config);
  }, [config, configReady]);

  const tickers = useMemo(() => parseTickers(tickerText), [tickerText]);

  const setEnabled = useCallback((key: keyof ScanFilterToggles, value: boolean) => {
    setConfig((prev) => ({
      ...prev,
      enabled: { ...prev.enabled, [key]: value },
    }));
  }, []);

  const setThreshold = useCallback(<K extends keyof ScanThresholds>(key: K, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setConfig((prev) => ({
      ...prev,
      thresholds: { ...prev.thresholds, [key]: value },
    }));
  }, []);

  const displayRows = useMemo(() => {
    if (!showOnlyMatches || !anyScanFilterEnabled(config)) return rows;
    return rows.filter((r) => r.passesAll);
  }, [rows, showOnlyMatches, config]);

  const activeFilterKeys = useMemo(
    () =>
      (Object.keys(config.enabled) as (keyof ScanFilterToggles)[]).filter(
        (k) => config.enabled[k],
      ),
    [config.enabled],
  );

  async function runScan() {
    if (!tickers.length) {
      setError("Add at least one ticker to scan.");
      return;
    }
    if (!anyScanFilterEnabled(config)) {
      setError("Enable at least one filter.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(`Scanning ${tickers.length} symbol${tickers.length === 1 ? "" : "s"}…`);
    setRows([]);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: tickers, config }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Scan failed.");
        return;
      }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setScannedAt(typeof data?.scannedAt === "number" ? data.scannedAt : Date.now());
    } catch {
      setError("Network error while scanning.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function loadWatchlist() {
    setTickerText(watchlist.join(", "));
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Stock scan</h1>
        <p className="text-zinc-400 text-sm">
          Run togglable filters against a ticker list using Finnhub quotes, fundamentals, and EMA
          indicators.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block text-sm text-zinc-300">
          <span className="font-medium">Tickers</span>
          <textarea
            className="mt-1.5 w-full min-h-[88px] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="AAPL, MSFT, NVDA"
            value={tickerText}
            onChange={(e) => setTickerText(e.target.value.toUpperCase())}
          />
        </label>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={loadWatchlist}
          >
            Use watchlist
          </button>
          <span className="text-xs text-zinc-500">
            {tickers.length ? `${tickers.length} symbol${tickers.length === 1 ? "" : "s"}` : "No symbols parsed"}
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
        <h2 className="text-sm font-medium text-zinc-200">Filters</h2>
        <p className="text-xs text-zinc-500">
          Enabled filters use AND logic. EMA crosses must occur within the last{" "}
          {SCAN_EMA_CROSS_TRADING_DAYS} trading days.
        </p>

        <div className="space-y-3">
          <FundamentalFilterRow
            label="Last day volume"
            enabled={config.enabled.minVolume}
            onEnabledChange={(v) => setEnabled("minVolume", v)}
          >
            <span className="text-zinc-500 text-sm">&gt;</span>
            <ThresholdInput
              value={config.thresholds.minLastDayVolume}
              onChange={(v) => setThreshold("minLastDayVolume", v)}
              disabled={!config.enabled.minVolume}
              step={100_000}
            />
            <span className="text-xs text-zinc-500">shares/day</span>
          </FundamentalFilterRow>

          <FundamentalFilterRow
            label="Price"
            enabled={config.enabled.minPrice}
            onEnabledChange={(v) => setEnabled("minPrice", v)}
          >
            <span className="text-zinc-500 text-sm">&gt; $</span>
            <ThresholdInput
              value={config.thresholds.minPrice}
              onChange={(v) => setThreshold("minPrice", v)}
              disabled={!config.enabled.minPrice}
              step={0.5}
            />
          </FundamentalFilterRow>

          <FundamentalFilterRow
            label="Market cap"
            enabled={config.enabled.minMarketCap}
            onEnabledChange={(v) => setEnabled("minMarketCap", v)}
          >
            <span className="text-zinc-500 text-sm">&gt; $</span>
            <ThresholdInput
              value={config.thresholds.minMarketCapBillions}
              onChange={(v) => setThreshold("minMarketCapBillions", v)}
              disabled={!config.enabled.minMarketCap}
              step={1}
            />
            <span className="text-xs text-zinc-500">B</span>
          </FundamentalFilterRow>
        </div>

        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">
            EMA 8 / 21 cross in the last {SCAN_EMA_CROSS_TRADING_DAYS} trading days (Finnhub
            indicator). 30m and hourly may be unavailable for some exchanges.
          </p>
          {SCAN_RESOLUTIONS.map((res) => {
            const keys = emaFilterKeys(res);
            return (
              <div key={res} className="flex flex-wrap gap-x-6 gap-y-2 items-center">
                <span className="text-xs font-medium text-zinc-400 w-16">
                  {SCAN_RESOLUTION_LABELS[res]}
                </span>
                <FilterCheckbox
                  label="Bullish cross"
                  checked={config.enabled[keys.bullish]}
                  onChange={(v) => setEnabled(keys.bullish, v)}
                />
                <FilterCheckbox
                  label="Bearish cross"
                  checked={config.enabled[keys.bearish]}
                  onChange={(v) => setEnabled(keys.bearish, v)}
                />
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          onClick={runScan}
          disabled={loading}
        >
          {loading ? "Scanning…" : "Run scan"}
        </button>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="rounded border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-emerald-600"
            checked={showOnlyMatches}
            onChange={(e) => setShowOnlyMatches(e.target.checked)}
          />
          Show only matches
        </label>
        {progress && <span className="text-xs text-zinc-500">{progress}</span>}
        {scannedAt && !loading && (
          <span className="text-xs text-zinc-500 ml-auto">
            Scanned {new Date(scannedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {loading && !rows.length && (
        <p className="text-sm text-zinc-400">Fetching data from Finnhub…</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60">
          <table className="min-w-[960px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">Ticker</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">Last day vol</th>
                <th className="px-4 py-3 font-medium text-right">Mkt cap</th>
                {activeFilterKeys.map((key) => (
                  <th key={key} className="px-3 py-3 font-medium text-center whitespace-nowrap">
                    {filterColumnLabel(key, config.thresholds)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + activeFilterKeys.length}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No symbols match all enabled filters.
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => (
                  <tr
                    key={row.ticker}
                    className={`border-b border-zinc-800/80 hover:bg-zinc-800/40 ${
                      row.passesAll && anyScanFilterEnabled(config)
                        ? "bg-emerald-950/20"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-emerald-400">{row.ticker}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{row.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {fmtMoney(row.metrics.price)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {fmtVolume(row.metrics.lastDayVolume)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {fmtMarketCap(row.metrics.marketCapMillions)}
                    </td>
                    {activeFilterKeys.map((key) => {
                      const pass = row.passes[key as keyof ScanPassResults];
                      let crossDay: string | null = null;
                      if (isEmaFilterKey(key) && pass) {
                        const res = emaResolutionForKey(key);
                        const kind = key.includes("Bullish") ? "bullish" : "bearish";
                        if (res) crossDay = emaCrossDayForPass(row.metrics, res, kind);
                      }
                      return (
                        <td key={key} className="px-3 py-2.5 text-center">
                          <PassCell pass={pass} crossDay={crossDay} />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FundamentalFilterRow({
  label,
  enabled,
  onEnabledChange,
  children,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <FilterCheckbox label={label} checked={enabled} onChange={onEnabledChange} />
      <div
        className={`flex flex-wrap items-center gap-2 ${enabled ? "" : "opacity-50 pointer-events-none"}`}
      >
        {children}
      </div>
    </div>
  );
}

function ThresholdInput({
  value,
  onChange,
  disabled,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <input
      type="number"
      min={step && step < 1 ? 0.01 : 1}
      step={step ?? 1}
      disabled={disabled}
      className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-sm text-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
      <input
        type="checkbox"
        className="rounded border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-emerald-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
