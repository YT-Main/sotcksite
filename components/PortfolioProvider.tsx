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

import { STORAGE_PORTFOLIO_KEY } from "@/lib/constants";
import type { PortfolioLot } from "@/lib/portfolio-types";
import { normalizeSymbol } from "@/lib/symbols";

function readLots(): PortfolioLot[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_PORTFOLIO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const row = item as Record<string, unknown>;
        const symbol = normalizeSymbol(String(row.symbol ?? ""));
        const quantity = Number(row.quantity);
        const buyPrice = Number(row.buyPrice);
        const id = typeof row.id === "string" ? row.id : "";
        if (!symbol || !id || !Number.isFinite(quantity) || quantity <= 0) return null;
        if (!Number.isFinite(buyPrice) || buyPrice <= 0) return null;
        return { id, symbol, quantity, buyPrice };
      })
      .filter(Boolean) as PortfolioLot[];
  } catch {
    return [];
  }
}

function writeLots(lots: PortfolioLot[]) {
  window.localStorage.setItem(STORAGE_PORTFOLIO_KEY, JSON.stringify(lots));
}

function newLotId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `lot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const PortfolioContext = createContext<{
  lots: PortfolioLot[];
  addLot: (symbol: string, quantity: number, buyPrice: number) => boolean;
  removeLot: (id: string) => void;
  removeSymbol: (symbol: string) => void;
} | null>(null);

export function PortfolioProvider(props: PropsWithChildren) {
  const [lots, setLots] = useState<PortfolioLot[]>([]);

  useLayoutEffect(() => {
    setLots(readLots());

    const onStorage = () => setLots(readLots());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addLot = useCallback((rawSymbol: string, quantity: number, buyPrice: number) => {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol || !Number.isFinite(quantity) || quantity <= 0) return false;
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) return false;

    const lot: PortfolioLot = { id: newLotId(), symbol, quantity, buyPrice };
    setLots((prev) => {
      const next = [...prev, lot];
      writeLots(next);
      return next;
    });
    return true;
  }, []);

  const removeLot = useCallback((id: string) => {
    setLots((prev) => {
      const next = prev.filter((lot) => lot.id !== id);
      writeLots(next);
      return next;
    });
  }, []);

  const removeSymbol = useCallback((symbol: string) => {
    setLots((prev) => {
      const next = prev.filter((lot) => lot.symbol !== symbol);
      writeLots(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ lots, addLot, removeLot, removeSymbol }),
    [lots, addLot, removeLot, removeSymbol],
  );

  return <PortfolioContext.Provider value={value}>{props.children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
