"use client";

import type { FiredAlert } from "@/lib/alert-types";

type Props = {
  alerts: FiredAlert[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
};

export default function AlertPopup({ alerts, onDismiss, onDismissAll }: Props) {
  if (!alerts.length) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-3"
      role="region"
      aria-live="assertive"
      aria-label="Stock alerts"
    >
      {alerts.length > 1 ? (
        <button
          type="button"
          className="self-end text-xs text-zinc-400 hover:text-zinc-200"
          onClick={onDismissAll}
        >
          Dismiss all
        </button>
      ) : null}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="animate-alert-pop rounded-lg border border-amber-500/60 bg-zinc-900 px-4 py-3 shadow-xl shadow-amber-950/40 ring-2 ring-amber-500/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-mono text-sm font-semibold text-amber-300">{alert.symbol}</p>
              <p className="text-sm text-zinc-200">{alert.message}</p>
              <p className="text-xs text-zinc-500">
                {new Date(alert.firedAt).toLocaleTimeString()}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-zinc-500 hover:text-zinc-200"
              aria-label={`Dismiss alert for ${alert.symbol}`}
              onClick={() => onDismiss(alert.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
