export type StockRow = {
  ticker: string;
  name: string;
  open: number | null;
  prevClose: number | null;
  price: number | null;
  high: number | null;
  low: number | null;
  gainPercent: number | null;
};

export type AlertStockRow = StockRow & {
  weeklyGainPercent: number | null;
  /** SMA keyed by period (e.g. 20, 50) */
  smas: Record<number, number | null>;
};
