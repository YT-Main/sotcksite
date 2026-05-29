import type { AlertKind, FiredAlert, SymbolAlertConfig } from "@/lib/alert-types";
import { meetsMaRule, meetsThreshold } from "@/lib/indicators";
import type { AlertStockRow } from "@/lib/stock-types";

export type ConditionState = Record<AlertKind, boolean>;

export function evaluateConditions(
  row: AlertStockRow,
  config: SymbolAlertConfig,
): ConditionState {
  if (!config.enabled) {
    return { dailyGain: false, weeklyGain: false, movingAverage: false };
  }

  const ma =
    config.movingAverage !== null
      ? (row.smas[config.movingAverage.period] ?? null)
      : null;

  return {
    dailyGain: meetsThreshold(row.gainPercent, config.dailyGain),
    weeklyGain: meetsThreshold(row.weeklyGainPercent, config.weeklyGain),
    movingAverage: meetsMaRule(row.price, ma, config.movingAverage),
  };
}

function kindLabel(kind: AlertKind): string {
  if (kind === "dailyGain") return "Daily gain";
  if (kind === "weeklyGain") return "Weekly gain";
  return "Moving average";
}

function formatMessage(row: AlertStockRow, config: SymbolAlertConfig, kind: AlertKind): string {
  if (kind === "dailyGain" && config.dailyGain) {
    const v = row.gainPercent?.toFixed(2) ?? "?";
    return `${row.ticker} daily gain ${v}% (${config.dailyGain.comparator} ${config.dailyGain.threshold}%)`;
  }
  if (kind === "weeklyGain" && config.weeklyGain) {
    const v = row.weeklyGainPercent?.toFixed(2) ?? "?";
    return `${row.ticker} weekly gain ${v}% (${config.weeklyGain.comparator} ${config.weeklyGain.threshold}%)`;
  }
  if (kind === "movingAverage" && config.movingAverage) {
    const maVal = row.smas[config.movingAverage.period]?.toFixed(2) ?? "?";
    const px = row.price?.toFixed(2) ?? "?";
    return `${row.ticker} price ${px} is ${config.movingAverage.comparator} ${config.movingAverage.period}-day MA (${maVal})`;
  }
  return `${row.ticker} ${kindLabel(kind)} alert`;
}

export function detectNewAlerts(
  rows: AlertStockRow[],
  configs: Record<string, SymbolAlertConfig>,
  prev: Map<string, ConditionState>,
  skipFire: boolean,
): { next: Map<string, ConditionState>; fired: FiredAlert[] } {
  const next = new Map<string, ConditionState>();
  const fired: FiredAlert[] = [];
  const now = Date.now();

  for (const row of rows) {
    const config = configs[row.ticker];
    if (!config) continue;
    const conditions = evaluateConditions(row, config);
    next.set(row.ticker, conditions);

    const prevConditions = prev.get(row.ticker);
    if (skipFire || !prevConditions) continue;

    for (const kind of ["dailyGain", "weeklyGain", "movingAverage"] as const) {
      if (conditions[kind] && !prevConditions[kind]) {
        fired.push({
          id: `${row.ticker}-${kind}-${now}`,
          symbol: row.ticker,
          name: row.name,
          kind,
          message: formatMessage(row, config, kind),
          firedAt: now,
        });
      }
    }
  }

  return { next, fired };
}

export function activeAlertKinds(conditions: ConditionState | undefined): AlertKind[] {
  if (!conditions) return [];
  return (["dailyGain", "weeklyGain", "movingAverage"] as const).filter((k) => conditions[k]);
}
