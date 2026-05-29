"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import PortfolioPieChart, { SLICE_COLORS } from "@/components/PortfolioPieChart";
import { usePortfolio } from "@/components/PortfolioProvider";
import { aggregatePositions, portfolioTotals } from "@/lib/portfolio-utils";
import type { PortfolioPosition } from "@/lib/portfolio-types";
import type { StockRow } from "@/lib/stock-types";

const REFRESH_INTERVAL_MS = 60_000;

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

function fmtSignedMoney(n: number | null): ReactNode {
  if (n === null || Number.isNaN(n)) return "—";
  const formatted = `${n >= 0 ? "+" : ""}${fmtMoney(n)}`;
  const tone = n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-300";
  return <span className={tone}>{formatted}</span>;
}

export default function PortfolioClient() {
  const { lots, addLot, removeLot, removeSymbol } = usePortfolio();
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const inFlightRef = useRef(false);

  const symbols = useMemo(
    () => [...new Set(lots.map((lot) => lot.symbol))],
    [lots],
  );
  const symKey = useMemo(() => symbols.join(","), [symbols]);

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!symbols.length) {
        setQuotes([]);
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
          body: JSON.stringify({ symbols }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : "Unable to load quotes.");
          if (!silent) setQuotes([]);
          return;
        }
        setError(null);
        setQuotes(Array.isArray(data?.rows) ? data.rows : []);
        setLastUpdated(Date.now());
      } catch {
        setError("Network error while loading quotes.");
        if (!silent) setQuotes([]);
      } finally {
        if (!silent) setLoading(false);
        inFlightRef.current = false;
      }
    },
    [symbols],
  );

  useEffect(() => {
    refresh();
  }, [symKey, refresh]);

  useEffect(() => {
    if (!symbols.length) return;
    const id = window.setInterval(() => {
      refresh({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [symKey, refresh, symbols.length]);

  const positions = useMemo(
    () => aggregatePositions(lots, quotes),
    [lots, quotes],
  );
  const totals = useMemo(() => portfolioTotals(positions), [positions]);

  const pieSlices = useMemo(
    () =>
      positions
        .filter((p) => p.marketValue !== null && p.marketValue > 0)
        .map((p, i) => ({
          label: p.symbol,
          value: p.marketValue as number,
          color: SLICE_COLORS[i % SLICE_COLORS.length],
        })),
    [positions],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const qty = Number(quantity);
    const price = Number(buyPrice);
    const ok = addLot(ticker.trim(), qty, price);
    if (!ok) {
      setFormError("Enter a valid ticker, quantity > 0, and buy price > 0.");
      return;
    }
    setTicker("");
    setQuantity("");
    setBuyPrice("");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Portfolio</h1>
        <p className="text-zinc-400 text-sm">
          Track holdings with quantity and cost basis. Data is saved in local storage and valued
          at live market prices.
        </p>
      </header>

      <form
        className="flex flex-wrap gap-3 items-end rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
        onSubmit={onSubmit}
      >
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          <span>Ticker</span>
          <input
            className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="NVDA"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          <span>Quantity</span>
          <input
            className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="10"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          <span>Buy price</span>
          <input
            className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            placeholder="120.50"
            inputMode="decimal"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Add position
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          onClick={() => refresh()}
          disabled={loading || !symbols.length}
        >
          Refresh
        </button>
        {formError ? (
          <p className="w-full text-sm text-rose-400">{formError}</p>
        ) : null}
      </form>

      {!lots.length ? (
        <p className="text-sm text-zinc-400">
          No positions yet. Add a ticker above to start tracking your portfolio.
        </p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Allocation
              </h2>
              {loading && !pieSlices.length ? (
                <p className="text-sm text-zinc-400">Loading…</p>
              ) : (
                <PortfolioPieChart slices={pieSlices} />
              )}
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
                Summary
              </h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-zinc-500">Total value</dt>
                  <dd className="font-mono text-xl text-white">{fmtMoney(totals.totalMarketValue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Cost basis</dt>
                  <dd className="font-mono text-xl text-zinc-200">{fmtMoney(totals.totalCostBasis)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Total P/L</dt>
                  <dd className="font-mono text-xl">{fmtSignedMoney(totals.totalPnl)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Total P/L %</dt>
                  <dd className="font-mono text-xl">{fmtPct(totals.totalPnlPercent)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-zinc-500" aria-live="polite">
                {lastUpdated
                  ? `Live · updated ${new Date(lastUpdated).toLocaleTimeString()}`
                  : "Live prices"}
              </p>
            </section>
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <PositionsTable
            loading={loading}
            positions={positions}
            onRemoveSymbol={removeSymbol}
          />

          <LotsTable lots={lots} onRemoveLot={removeLot} />
        </>
      )}
    </div>
  );
}

type PositionsTableProps = {
  positions: PortfolioPosition[];
  loading: boolean;
  onRemoveSymbol: (symbol: string) => void;
};

function PositionsTable({ positions, loading, onRemoveSymbol }: PositionsTableProps) {
  if (loading && !positions.length) {
    return <p className="text-sm text-zinc-400">Loading positions…</p>;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Positions</h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60">
        <table className="min-w-[960px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium whitespace-nowrap">Ticker</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Qty</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Avg buy</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Price</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Value</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">% port</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">P/L</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">P/L %</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap w-20" />
            </tr>
          </thead>
          <tbody>
            {positions.map((row) => (
              <tr
                key={row.symbol}
                className="border-b border-zinc-800/80 last:border-0 hover:bg-zinc-800/40"
              >
                <td className="px-4 py-2 font-mono font-semibold text-zinc-100 whitespace-nowrap">
                  {row.symbol}
                </td>
                <td className="px-4 py-2 text-zinc-300 max-w-xs truncate">{row.name}</td>
                <td className="px-4 py-2 font-mono text-right text-zinc-200">
                  {row.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </td>
                <td className="px-4 py-2 font-mono text-right text-zinc-200">
                  {fmtMoney(row.avgBuyPrice)}
                </td>
                <td className="px-4 py-2 font-mono text-right text-white">
                  {fmtMoney(row.currentPrice)}
                </td>
                <td className="px-4 py-2 font-mono text-right text-white">
                  {fmtMoney(row.marketValue)}
                </td>
                <td className="px-4 py-2 font-mono text-right text-zinc-200">
                  {row.portfolioPercent !== null ? `${row.portfolioPercent.toFixed(1)}%` : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-right">{fmtSignedMoney(row.pnl)}</td>
                <td className="px-4 py-2 font-mono text-right">{fmtPct(row.pnlPercent)}</td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    className="text-xs text-zinc-500 hover:text-rose-400"
                    onClick={() => onRemoveSymbol(row.symbol)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type LotsTableProps = {
  lots: { id: string; symbol: string; quantity: number; buyPrice: number }[];
  onRemoveLot: (id: string) => void;
};

function LotsTable({ lots, onRemoveLot }: LotsTableProps) {
  if (lots.length <= 1) return null;

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/40">
      <summary className="cursor-pointer px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200">
        Individual lots ({lots.length})
      </summary>
      <div className="overflow-x-auto border-t border-zinc-800">
        <table className="min-w-[520px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium whitespace-nowrap">Ticker</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Qty</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Buy price</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Cost</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap w-20" />
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr
                key={lot.id}
                className="border-b border-zinc-800/80 last:border-0 hover:bg-zinc-800/40"
              >
                <td className="px-4 py-2 font-mono text-zinc-100">{lot.symbol}</td>
                <td className="px-4 py-2 font-mono text-right text-zinc-200">
                  {lot.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </td>
                <td className="px-4 py-2 font-mono text-right text-zinc-200">
                  {fmtMoney(lot.buyPrice)}
                </td>
                <td className="px-4 py-2 font-mono text-right text-zinc-200">
                  {fmtMoney(lot.quantity * lot.buyPrice)}
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    className="text-xs text-zinc-500 hover:text-rose-400"
                    onClick={() => onRemoveLot(lot.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
