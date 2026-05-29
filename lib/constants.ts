/** Default symbols shown until the watchlist exists in localStorage */
export const DEFAULT_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "META"];

export const STORAGE_WATCHLIST_KEY = "stock-watchlist-v1";

export const STORAGE_ALERTS_KEY = "stock-alerts-v1";

export const STORAGE_PORTFOLIO_KEY = "stock-portfolio-v1";

export const DEFAULT_MA_PERIOD = 20;

export const MAX_SYMBOLS = 30;

export const STORAGE_SCAN_FILTERS_KEY = "stock-scan-filters-v1";

export const SCAN_MIN_AVG_VOLUME = 1_000_000;
export const SCAN_MIN_PRICE = 5;
export const SCAN_MIN_MARKET_CAP_MILLIONS = 10_000;
export const SCAN_EMA_FAST = 8;
export const SCAN_EMA_SLOW = 21;
export const SCAN_ADTV_DAYS = 20;
export const SCAN_EMA_CROSS_TRADING_DAYS = 7;
