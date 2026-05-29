export type PortfolioLot = {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
};

export type PortfolioPosition = {
  symbol: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  costBasis: number;
  currentPrice: number | null;
  marketValue: number | null;
  portfolioPercent: number | null;
  pnl: number | null;
  pnlPercent: number | null;
};
