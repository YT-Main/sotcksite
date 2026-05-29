import type { PortfolioLot, PortfolioPosition } from "@/lib/portfolio-types";
import type { StockRow } from "@/lib/stock-types";

export function aggregatePositions(
  lots: PortfolioLot[],
  quotes: StockRow[],
): PortfolioPosition[] {
  const quoteBySymbol = Object.fromEntries(quotes.map((q) => [q.ticker, q]));
  const bySymbol = new Map<string, { quantity: number; costBasis: number }>();

  for (const lot of lots) {
    const prev = bySymbol.get(lot.symbol) ?? { quantity: 0, costBasis: 0 };
    bySymbol.set(lot.symbol, {
      quantity: prev.quantity + lot.quantity,
      costBasis: prev.costBasis + lot.quantity * lot.buyPrice,
    });
  }

  const positions: PortfolioPosition[] = [];

  for (const [symbol, agg] of bySymbol) {
    const avgBuyPrice = agg.quantity > 0 ? agg.costBasis / agg.quantity : 0;
    const quote = quoteBySymbol[symbol];
    const currentPrice = quote?.price ?? null;
    const marketValue =
      currentPrice !== null && Number.isFinite(currentPrice)
        ? agg.quantity * currentPrice
        : null;
    const pnl = marketValue !== null ? marketValue - agg.costBasis : null;
    const pnlPercent =
      pnl !== null && agg.costBasis > 0 ? (pnl / agg.costBasis) * 100 : null;

    positions.push({
      symbol,
      name: quote?.name ?? symbol,
      quantity: agg.quantity,
      avgBuyPrice,
      costBasis: agg.costBasis,
      currentPrice,
      marketValue,
      portfolioPercent: null,
      pnl,
      pnlPercent,
    });
  }

  const totalValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);

  for (const position of positions) {
    position.portfolioPercent =
      position.marketValue !== null && totalValue > 0
        ? (position.marketValue / totalValue) * 100
        : null;
  }

  positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return positions;
}

export function portfolioTotals(positions: PortfolioPosition[]) {
  const totalMarketValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const totalCostBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);
  const totalPnl = totalMarketValue - totalCostBasis;
  const totalPnlPercent =
    totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : null;

  return { totalMarketValue, totalCostBasis, totalPnl, totalPnlPercent };
}
