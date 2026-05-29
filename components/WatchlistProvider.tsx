"use client";

import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { DEFAULT_TICKERS, STORAGE_WATCHLIST_KEY } from "@/lib/constants";
import { normalizeSymbol } from "@/lib/symbols";

function readWatchlist(): string[] {
  try {
    const rawW = window.localStorage.getItem(STORAGE_WATCHLIST_KEY);
    let watchlist = [...DEFAULT_TICKERS];
    if (rawW) {
      const parsed = JSON.parse(rawW) as unknown;
      if (Array.isArray(parsed)) {
        watchlist = [
          ...new Set(
            parsed
              .map((x) => normalizeSymbol(String(x)))
              .filter(Boolean) as string[],
          ),
        ];
      }
    }
    if (!watchlist.length) watchlist = [...DEFAULT_TICKERS];
    return watchlist;
  } catch {
    return [...DEFAULT_TICKERS];
  }
}

function writeWatch(watchlist: string[]) {
  window.localStorage.setItem(STORAGE_WATCHLIST_KEY, JSON.stringify(watchlist));
}

const WatchContext = createContext<{
  watchlist: string[];
  setWatchlist: (next: string[]) => void;
  addTicker: (raw: string) => boolean;
} | null>(null);

export function WatchlistProvider(props: PropsWithChildren) {
  const [watchlist, setWatchlistState] = useState<string[]>([...DEFAULT_TICKERS]);

  useLayoutEffect(() => {
    setWatchlistState(readWatchlist());

    const onStorage = () => setWatchlistState(readWatchlist());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setWatchlist = useCallback((next: string[]) => {
    writeWatch(next);
    setWatchlistState(next);
  }, []);

  const addTicker = useCallback((raw: string) => {
    const sym = normalizeSymbol(raw);
    if (!sym) return false;
    let added = false;
    setWatchlistState((prev) => {
      if (prev.includes(sym)) {
        added = false;
        return prev;
      }
      added = true;
      const nextWatch = [...prev, sym];
      writeWatch(nextWatch);
      return nextWatch;
    });
    return added;
  }, []);

  const value = useMemo(
    () => ({ watchlist, setWatchlist, addTicker }),
    [watchlist, setWatchlist, addTicker],
  );

  return <WatchContext.Provider value={value}>{props.children}</WatchContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
