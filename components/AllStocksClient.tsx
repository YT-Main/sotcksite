"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import StockTable from "@/components/StockTable";
import { useWatchlist } from "@/components/WatchlistProvider";
import type { StockRow } from "@/lib/stock-types";

const REFRESH_INTERVAL_MS = 60_000;

export default function AllStocksClient() {
  const { watchlist, addTicker } = useWatchlist();
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const inFlightRef = useRef(false);

  const symKey = useMemo(() => watchlist.join(","), [watchlist]);

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
        const res = await fetch("/api/stocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: watchlist }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : "Unable to load quotes.");
          if (!silent) setRows([]);
          return;
        }
        setError(null);
        setRows(Array.isArray(data?.rows) ? data.rows : []);
        setLastUpdated(Date.now());
      } catch {
        setError("Network error while loading quotes.");
        if (!silent) setRows([]);
      } finally {
        if (!silent) setLoading(false);
        inFlightRef.current = false;
      }
    },
    [watchlist],
  );

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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    addTicker(draft.trim());
    setDraft("");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white tracking-tight">All stocks</h1>
        <p className="text-zinc-400 text-sm">
          Symbols are saved in local storage. Set up price alerts on the Alerts page.
        </p>
      </header>

      <form className="flex flex-wrap gap-3 items-center" onSubmit={onSubmit}>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <span>Add ticker</span>
          <input
            className="w-36 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="NVDA"
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Add
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
          onClick={() => refresh()}
          disabled={loading}
        >
          Refresh
        </button>
        <span className="text-xs text-zinc-500 ml-auto" aria-live="polite">
          {lastUpdated
            ? `Live · updated ${new Date(lastUpdated).toLocaleTimeString()}`
            : "Live prices"}
        </span>
      </form>

      <StockTable error={error} loading={loading} rows={rows} />
    </div>
  );
}
