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

import {
  DEFAULT_TICKERS,
  STORAGE_SELECTED_KEY,
  STORAGE_WATCHLIST_KEY,
} from "@/lib/constants";
import { normalizeSymbol } from "@/lib/symbols";

type WatchStore = {
  watchlist: string[];
  selected: string[];
};

const defaultStore: WatchStore = {
  watchlist: [...DEFAULT_TICKERS],
  selected: [],
};

function readStore(): WatchStore {
  try {
    const rawW = window.localStorage.getItem(STORAGE_WATCHLIST_KEY);
    const rawS = window.localStorage.getItem(STORAGE_SELECTED_KEY);
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

    let selected: string[] = [];
    if (rawS) {
      const parsed = JSON.parse(rawS) as unknown;
      if (Array.isArray(parsed)) {
        selected = [
          ...new Set(
            parsed
              .map((x) => normalizeSymbol(String(x)))
              .filter(Boolean) as string[],
          ),
        ];
      }
    }

    selected = selected.filter((s) => watchlist.includes(s));

    return { watchlist, selected };
  } catch {
    return defaultStore;
  }
}

function writeWatch(watchlist: string[]) {
  window.localStorage.setItem(STORAGE_WATCHLIST_KEY, JSON.stringify(watchlist));
}

function writeSelected(selected: string[]) {
  window.localStorage.setItem(STORAGE_SELECTED_KEY, JSON.stringify(selected));
}

const WatchContext = createContext<{
  watchlist: string[];
  selectedSymbols: Set<string>;
  setWatchlist: (next: string[]) => void;
  addTicker: (raw: string) => boolean;
  toggleSelected: (symbol: string, on: boolean) => void;
} | null>(null);

export function WatchlistProvider(props: PropsWithChildren) {
  const [store, setStore] = useState<WatchStore>(defaultStore);

  useLayoutEffect(() => {
    setStore(readStore());

    const onStorage = () => setStore(readStore());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setWatchlist = useCallback((next: string[]) => {
    setStore((prev) => {
      const selected = prev.selected.filter((s) => next.includes(s));
      writeWatch(next);
      writeSelected(selected);
      return { watchlist: next, selected };
    });
  }, []);

  const addTicker = useCallback((raw: string) => {
    const sym = normalizeSymbol(raw);
    if (!sym) return false;
    let added = false;
    setStore((prev) => {
      if (prev.watchlist.includes(sym)) {
        added = false;
        return prev;
      }
      added = true;
      const nextWatch = [...prev.watchlist, sym];
      writeWatch(nextWatch);
      return { watchlist: nextWatch, selected: prev.selected };
    });
    return added;
  }, []);

  const toggleSelected = useCallback((symbol: string, on: boolean) => {
    setStore((prev) => {
      if (on && !prev.watchlist.includes(symbol)) return prev;
      const nextSel = on
        ? [...new Set([...prev.selected, symbol])]
        : prev.selected.filter((s) => s !== symbol);
      writeSelected(nextSel);
      return { watchlist: prev.watchlist, selected: nextSel };
    });
  }, []);

  const value = useMemo(
    () => ({
      watchlist: store.watchlist,
      selectedSymbols: new Set(store.selected),
      setWatchlist,
      addTicker,
      toggleSelected,
    }),
    [store.watchlist, store.selected, setWatchlist, addTicker, toggleSelected],
  );

  return <WatchContext.Provider value={value}>{props.children}</WatchContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
