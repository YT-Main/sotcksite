import type { StockRow } from "@/lib/stock-types";

type Props = {
  rows: StockRow[];
  selectable?: boolean;
  selectedSymbols: Set<string>;
  onToggleSelected: (symbol: string, nextChecked: boolean) => void;
  loading?: boolean;
  error?: string | null;
};

function fmtMoney(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | null): JSX.Element | string {
  if (n === null || Number.isNaN(n)) return "—";
  const formatted = `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const tone = n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-zinc-300";
  return <span className={tone}>{formatted}</span>;
}

export default function StockTable({
  rows,
  selectable,
  selectedSymbols,
  onToggleSelected,
  loading,
  error,
}: Props) {
  if (loading) {
    return <p className="text-sm text-zinc-400">Loading market data…</p>;
  }
  if (error) {
    return <p className="text-sm text-rose-400">{error}</p>;
  }
  if (!rows.length) {
    return (
      <p className="text-sm text-zinc-400">
        No symbols to show. Add tickers above or adjust your selections.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60">
      <table className="min-w-[720px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
            {selectable ? (
              <th className="px-4 py-3 font-medium whitespace-nowrap w-28">Pinned</th>
            ) : null}
            <th className="px-4 py-3 font-medium whitespace-nowrap">Ticker</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Open</th>
            <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Prev close</th>
            <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Price</th>
            <th className="px-4 py-3 font-medium text-right whitespace-nowrap">High</th>
            <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Low</th>
            <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Day %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.ticker}
              className="border-b border-zinc-800/80 last:border-0 hover:bg-zinc-800/40"
            >
              {selectable ? (
                <td className="px-4 py-2">
                  <input
                    aria-label={`Pin ${row.ticker}`}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                    checked={selectedSymbols.has(row.ticker)}
                    type="checkbox"
                    onChange={(e) => onToggleSelected(row.ticker, e.target.checked)}
                  />
                </td>
              ) : null}
              <td className="px-4 py-2 font-mono font-semibold text-zinc-100 whitespace-nowrap">
                {row.ticker}
              </td>
              <td className="px-4 py-2 text-zinc-300 max-w-xs truncate">{row.name}</td>
              <td className="px-4 py-2 font-mono text-right text-zinc-200">{fmtMoney(row.open)}</td>
              <td className="px-4 py-2 font-mono text-right text-zinc-200">{fmtMoney(row.prevClose)}</td>
              <td className="px-4 py-2 font-mono text-right text-white">{fmtMoney(row.price)}</td>
              <td className="px-4 py-2 font-mono text-right text-zinc-200">{fmtMoney(row.high)}</td>
              <td className="px-4 py-2 font-mono text-right text-zinc-200">{fmtMoney(row.low)}</td>
              <td className="px-4 py-2 font-mono text-right">{fmtPct(row.gainPercent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
