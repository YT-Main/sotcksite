"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";

import AlertPopup from "@/components/AlertPopup";
import { DEFAULT_MA_PERIOD, useAlerts } from "@/components/AlertProvider";
import { useWatchlist } from "@/components/WatchlistProvider";
import type { AlertKind, FiredAlert } from "@/lib/alert-types";
import { playAlertDing } from "@/lib/alert-sound";
import {
  activeAlertKinds,
  detectNewAlerts,
  evaluateConditions,
  type ConditionState,
} from "@/lib/alert-utils";
import type { AlertComparator } from "@/lib/alert-types";
import type { AlertStockRow } from "@/lib/stock-types";

const REFRESH_INTERVAL_MS = 15_000;

const KIND_LABELS: Record<AlertKind, string> = {
  dailyGain: "Daily",
  weeklyGain: "Weekly",
  movingAverage: "MA",
};

function fmtMoney(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | null): ReactNode {
  if (n === null || Number.isNaN(n)) return "—";
  const formatted = `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const tone = n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-300";
  return <span className={tone}>{formatted}</span>;
}

export default function AlertsClient() {
  const { watchlist } = useWatchlist();
  const { configs, getConfig, updateConfig, setThresholdRule, setMaRule } = useAlerts();

  const symKey = useMemo(() => watchlist.join(","), [watchlist]);
  const maPeriods = useMemo(() => {
    const periods = watchlist.map(
      (s) => getConfig(s).movingAverage?.period ?? DEFAULT_MA_PERIOD,
    );
    return [...new Set(periods)];
  }, [watchlist, configs, getConfig]);
  const maKey = maPeriods.join(",");
  const [rows, setRows] = useState<AlertStockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [popups, setPopups] = useState<FiredAlert[]>([]);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

  const inFlightRef = useRef(false);
  const conditionsRef = useRef<Map<string, ConditionState>>(new Map());
  const seededRef = useRef(false);

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!watchlist.length) {
        setRows([]);
        setLastUpdated(null);
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: watchlist, maPeriods }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : "Unable to load alerts data.");
          if (!silent) setRows([]);
          return;
        }
        const nextRows: AlertStockRow[] = Array.isArray(data?.rows) ? data.rows : [];
        setError(null);
        setRows(nextRows);
        setLastUpdated(Date.now());

        const skipFire = !seededRef.current;
        const { next, fired } = detectNewAlerts(nextRows, configs, conditionsRef.current, skipFire);
        conditionsRef.current = next;
        seededRef.current = true;

        if (fired.length) {
          playAlertDing();
          setPopups((prev) => [...fired, ...prev].slice(0, 8));
          setHighlighted((prev) => {
            const s = new Set(prev);
            for (const alert of fired) s.add(alert.symbol);
            return s;
          });
        }

        const active = new Set<string>();
        for (const row of nextRows) {
          const kinds = activeAlertKinds(next.get(row.ticker));
          if (kinds.length) active.add(row.ticker);
        }
        setHighlighted(active);
      } catch {
        setError("Network error while loading alerts data.");
        if (!silent) setRows([]);
      } finally {
        if (!silent) setLoading(false);
        inFlightRef.current = false;
      }
    },
    [watchlist, configs, maPeriods],
  );

  useEffect(() => {
    seededRef.current = false;
    conditionsRef.current = new Map();
  }, [symKey, maKey]);

  useEffect(() => {
    refresh();
  }, [symKey, refresh]);

  useEffect(() => {
    if (!watchlist.length) return;
    const id = window.setInterval(() => {
      refresh({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [symKey, refresh, watchlist.length]);

  function dismissPopup(id: string) {
    setPopups((prev) => prev.filter((a) => a.id !== id));
  }

  function dismissAllPopups() {
    setPopups([]);
  }

  if (!watchlist.length && !loading) {
    return (
      <div className="space-y-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Alerts</h1>
        <p className="text-zinc-400 text-sm">
          No symbols in your watchlist. Add tickers on{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            All stocks
          </Link>{" "}
          first, then configure alerts here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Alerts</h1>
            <p className="text-zinc-400 text-sm">
              Custom alerts for every watchlist symbol — daily gain, weekly gain, and moving
              average. Triggers show a popup, play a sound, and highlight the row.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500" aria-live="polite">
              {lastUpdated
                ? `Live · updated ${new Date(lastUpdated).toLocaleTimeString()}`
                : "Live prices"}
            </span>
            <button
              type="button"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => refresh()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </header>

        {loading && !rows.length ? (
          <p className="text-sm text-zinc-400">Loading market data…</p>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-3 font-medium whitespace-nowrap w-12">On</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Ticker</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Price</th>
                  <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Day %</th>
                  <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Week %</th>
                  <th className="px-3 py-3 font-medium text-right whitespace-nowrap">MA</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Daily alert</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Weekly alert</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">MA alert</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((symbol) => {
                  const row = rows.find((r) => r.ticker === symbol);
                  const config = getConfig(symbol);
                  const conditions = row
                    ? evaluateConditions(row, config)
                    : { dailyGain: false, weeklyGain: false, movingAverage: false };
                  const isHighlighted = highlighted.has(symbol);
                  const activeKinds = activeAlertKinds(conditions);

                  return (
                    <tr
                      key={symbol}
                      className={`border-b border-zinc-800/80 last:border-0 transition-colors ${
                        isHighlighted
                          ? "bg-amber-500/15 ring-1 ring-inset ring-amber-500/40 animate-alert-highlight"
                          : "hover:bg-zinc-800/40"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          aria-label={`Enable alerts for ${symbol}`}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => updateConfig(symbol, { enabled: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-zinc-100 whitespace-nowrap">
                        {symbol}
                      </td>
                      <td className="px-3 py-2 text-zinc-300 max-w-[140px] truncate">
                        {row?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-right text-white">
                        {fmtMoney(row?.price ?? null)}
                      </td>
                      <td className="px-3 py-2 font-mono text-right">{fmtPct(row?.gainPercent ?? null)}</td>
                      <td className="px-3 py-2 font-mono text-right">
                        {fmtPct(row?.weeklyGainPercent ?? null)}
                      </td>
                      <td className="px-3 py-2 font-mono text-right text-zinc-200">
                        {config.movingAverage
                          ? fmtMoney(row?.smas[config.movingAverage.period] ?? null)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <ThresholdInput
                          disabled={!config.enabled}
                          rule={config.dailyGain}
                          onChange={(rule) => setThresholdRule(symbol, "dailyGain", rule)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <ThresholdInput
                          disabled={!config.enabled}
                          rule={config.weeklyGain}
                          onChange={(rule) => setThresholdRule(symbol, "weeklyGain", rule)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <MaInput
                          disabled={!config.enabled}
                          rule={config.movingAverage}
                          onChange={(rule) => setMaRule(symbol, rule)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {config.enabled && activeKinds.length ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                            {activeKinds.map((k) => KIND_LABELS[k]).join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertPopup alerts={popups} onDismiss={dismissPopup} onDismissAll={dismissAllPopups} />
    </>
  );
}

type ThresholdInputProps = {
  rule: { comparator: AlertComparator; threshold: number } | null;
  disabled: boolean;
  onChange: (rule: { comparator: AlertComparator; threshold: number } | null) => void;
};

function ThresholdInput({ rule, disabled, onChange }: ThresholdInputProps) {
  const comparator = rule?.comparator ?? "above";
  const threshold = rule?.threshold ?? "";

  return (
    <div className="flex items-center gap-1">
      <select
        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-200 disabled:opacity-40"
        disabled={disabled}
        value={comparator}
        onChange={(e) => {
          const nextComparator = e.target.value as AlertComparator;
          const num = Number(threshold);
          if (!Number.isFinite(num)) {
            onChange({ comparator: nextComparator, threshold: 0 });
            return;
          }
          onChange({ comparator: nextComparator, threshold: num });
        }}
      >
        <option value="above">≥</option>
        <option value="below">≤</option>
      </select>
      <input
        className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 font-mono text-xs text-white disabled:opacity-40"
        disabled={disabled}
        inputMode="decimal"
        placeholder="—"
        value={threshold}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const num = Number(raw);
          if (!Number.isFinite(num)) return;
          onChange({ comparator, threshold: num });
        }}
      />
      <span className="text-xs text-zinc-500">%</span>
    </div>
  );
}

type MaInputProps = {
  rule: { period: number; comparator: AlertComparator } | null;
  disabled: boolean;
  onChange: (rule: { period: number; comparator: AlertComparator } | null) => void;
};

function MaInput({ rule, disabled, onChange }: MaInputProps) {
  const period = rule?.period ?? DEFAULT_MA_PERIOD;
  const comparator = rule?.comparator ?? "above";

  return (
    <div className="flex items-center gap-1">
      <input
        className="w-10 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 font-mono text-xs text-white disabled:opacity-40"
        disabled={disabled}
        inputMode="numeric"
        placeholder="—"
        value={rule ? period : ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const num = Number(raw);
          if (!Number.isFinite(num) || num <= 0) return;
          onChange({ period: Math.round(num), comparator });
        }}
      />
      <span className="text-xs text-zinc-500">d</span>
      <select
        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-200 disabled:opacity-40"
        disabled={disabled}
        value={comparator}
        onChange={(e) => {
          const nextComparator = e.target.value as AlertComparator;
          if (!rule) {
            onChange({ period: DEFAULT_MA_PERIOD, comparator: nextComparator });
            return;
          }
          onChange({ ...rule, comparator: nextComparator });
        }}
      >
        <option value="above">above</option>
        <option value="below">below</option>
      </select>
    </div>
  );
}
