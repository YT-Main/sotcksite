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
