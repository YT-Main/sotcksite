export type AlertComparator = "above" | "below";

export type ThresholdRule = {
  comparator: AlertComparator;
  threshold: number;
};

export type MovingAverageRule = {
  period: number;
  comparator: AlertComparator;
};

export type SymbolAlertConfig = {
  symbol: string;
  enabled: boolean;
  dailyGain: ThresholdRule | null;
  weeklyGain: ThresholdRule | null;
  movingAverage: MovingAverageRule | null;
};

export type AlertKind = "dailyGain" | "weeklyGain" | "movingAverage";

export type FiredAlert = {
  id: string;
  symbol: string;
  name: string;
  kind: AlertKind;
  message: string;
  firedAt: number;
};
