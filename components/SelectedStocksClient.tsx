"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import StockTable from "@/components/StockTable";
import { useWatchlist } from "@/components/WatchlistProvider";
import type { StockRow } from "@/lib/stock-types";

export default function SelectedStocksClient() {
  const { watchlist, selectedSymbols } = useWatchlist();

  const selectedList = useMemo(
    () => watchlist.filter((s) => selectedSymbols.has(s)),
    [watchlist, selectedSymbols],
  );

  const symKey = useMemo(() => selectedList.join(","), [selectedList]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!selectedList.length) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: selectedList }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Unable to load quotes.");
        setRows([]);
        return;
      }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setError("Network error while loading quotes.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedList]);

  useEffect(() => {
    refresh();
  }, [symKey, refresh]);

  if (!selectedList.length && !loading) {
    return (
      <div className="space-y-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 p-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Selected</h1>
        <p className="text-zinc-400 text-sm">
          Nothing pinned yet. Open{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            All stocks
          </Link>{" "}
          and check the &ldquo;Pinned&rdquo; column for the companies you want here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Selected</h1>
          <p className="text-zinc-400 text-sm">
            Same table as All stocks, limited to pinned tickers ({selectedList.length}).
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </button>
      </header>

      <StockTable error={error} loading={loading} rows={rows} selectable={false} selectedSymbols={new Set()} onToggleSelected={() => {}} />
    </div>
  );
}
