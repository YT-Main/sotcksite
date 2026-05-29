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

import type { MovingAverageRule, SymbolAlertConfig, ThresholdRule } from "@/lib/alert-types";
import { DEFAULT_MA_PERIOD, STORAGE_ALERTS_KEY } from "@/lib/constants";
import { normalizeSymbol } from "@/lib/symbols";

function defaultConfig(symbol: string): SymbolAlertConfig {
  return {
    symbol,
    enabled: false,
    dailyGain: null,
    weeklyGain: null,
    movingAverage: null,
  };
}

function parseThresholdRule(raw: unknown): ThresholdRule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const comparator = row.comparator === "below" ? "below" : row.comparator === "above" ? "above" : null;
  const threshold = Number(row.threshold);
  if (!comparator || !Number.isFinite(threshold)) return null;
  return { comparator, threshold };
}

function parseMaRule(raw: unknown): MovingAverageRule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const comparator = row.comparator === "below" ? "below" : row.comparator === "above" ? "above" : null;
  const period = Number(row.period);
  if (!comparator || !Number.isFinite(period) || period <= 0) return null;
  return { comparator, period: Math.round(period) };
}

function parseConfig(raw: unknown, symbol: string): SymbolAlertConfig {
  if (typeof raw !== "object" || raw === null) return defaultConfig(symbol);
  const row = raw as Record<string, unknown>;
  return {
    symbol,
    enabled: Boolean(row.enabled),
    dailyGain: parseThresholdRule(row.dailyGain),
    weeklyGain: parseThresholdRule(row.weeklyGain),
    movingAverage: parseMaRule(row.movingAverage),
  };
}

function readStore(): Record<string, SymbolAlertConfig> {
  try {
    const raw = window.localStorage.getItem(STORAGE_ALERTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, SymbolAlertConfig> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const symbol = normalizeSymbol(key);
      if (!symbol) continue;
      out[symbol] = parseConfig(value, symbol);
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, SymbolAlertConfig>) {
  window.localStorage.setItem(STORAGE_ALERTS_KEY, JSON.stringify(store));
}

const AlertContext = createContext<{
  configs: Record<string, SymbolAlertConfig>;
  getConfig: (symbol: string) => SymbolAlertConfig;
  updateConfig: (symbol: string, patch: Partial<SymbolAlertConfig>) => void;
  setThresholdRule: (
    symbol: string,
    field: "dailyGain" | "weeklyGain",
    rule: ThresholdRule | null,
  ) => void;
  setMaRule: (symbol: string, rule: MovingAverageRule | null) => void;
} | null>(null);

export function AlertProvider(props: PropsWithChildren) {
  const [configs, setConfigs] = useState<Record<string, SymbolAlertConfig>>({});

  useLayoutEffect(() => {
    setConfigs(readStore());
    const onStorage = () => setConfigs(readStore());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const getConfig = useCallback(
    (symbol: string) => configs[symbol] ?? defaultConfig(symbol),
    [configs],
  );

  const updateConfig = useCallback((symbol: string, patch: Partial<SymbolAlertConfig>) => {
    const sym = normalizeSymbol(symbol);
    if (!sym) return;
    setConfigs((prev) => {
      const next = {
        ...prev,
        [sym]: { ...defaultConfig(sym), ...prev[sym], ...patch, symbol: sym },
      };
      writeStore(next);
      return next;
    });
  }, []);

  const setThresholdRule = useCallback(
    (symbol: string, field: "dailyGain" | "weeklyGain", rule: ThresholdRule | null) => {
      updateConfig(symbol, { [field]: rule });
    },
    [updateConfig],
  );

  const setMaRule = useCallback(
    (symbol: string, rule: MovingAverageRule | null) => {
      updateConfig(symbol, { movingAverage: rule });
    },
    [updateConfig],
  );

  const value = useMemo(
    () => ({ configs, getConfig, updateConfig, setThresholdRule, setMaRule }),
    [configs, getConfig, updateConfig, setThresholdRule, setMaRule],
  );

  return <AlertContext.Provider value={value}>{props.children}</AlertContext.Provider>;
}

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used within AlertProvider");
  return ctx;
}

export { DEFAULT_MA_PERIOD };
