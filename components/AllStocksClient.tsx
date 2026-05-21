"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import StockTable from "@/components/StockTable";
import { useWatchlist } from "@/components/WatchlistProvider";
import type { StockRow } from "@/lib/stock-types";

export default function AllStocksClient() {
  const { watchlist, selectedSymbols, addTicker, toggleSelected } = useWatchlist();
  const [draft, setDraft] = useState("");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symKey = useMemo(() => watchlist.join(","), [watchlist]);

  const refresh = useCallback(async () => {
    if (!watchlist.length) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: watchlist }),
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
  }, [watchlist]);

  useEffect(() => {
    refresh();
  }, [symKey, refresh]);

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
          Symbols are saved in local storage. Check &ldquo;Pinned&rdquo; to show a company on the
          Selected page.
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
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </button>
      </form>

      <StockTable
        error={error}
        loading={loading}
        rows={rows}
        selectable
        selectedSymbols={selectedSymbols}
        onToggleSelected={toggleSelected}
      />
    </div>
  );
}
