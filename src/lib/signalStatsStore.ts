import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SignalAuditInfo } from "./signalAuditEngine";

export interface SignalHistoryEntry {
  key: string;
  time: string;
  outcome: "green" | "red";
  label?: string;
  confluence?: string;
  resultTime?: string;
  timestamp: number;
  targetTime?: string;
  strategyKey?: string;
  confirmedStrategies?: Array<{ code: string; name?: string; id?: number }>;
  windowLabel?: string;
  checkedResults?: number;
  winningResultId?: string | null;
  winningResultCreatedAt?: string | null;
  audit?: SignalAuditInfo;
  sources?: Array<{ analysis: number; value: number }>;
  category?: string;
  isSupreme?: boolean;
  isRare?: boolean;
  isAlavancagem?: boolean;
  isTop1?: boolean;
}

export interface AnalysisStat {
  green: number;
  red: number;
  lastUpdated: number;
}

interface SignalStatsStore {
  stats: Record<string, AnalysisStat>;
  recentSignals: SignalHistoryEntry[];
  updateStats: (key: string, outcome: "green" | "red") => void;
  recordCompletedSignal: (signal: {
    key: string;
    time: string;
    outcome: "green" | "red";
    label?: string;
    confluence?: string;
    resultTime?: string;
    strategyKey?: string;
    confirmedStrategies?: Array<{ code: string; name?: string; id?: number }>;
    targetTime?: string;
    windowLabel?: string;
    checkedResults?: number;
    winningResultId?: string | null;
    winningResultCreatedAt?: string | null;
    audit?: SignalAuditInfo;
    sources?: Array<{ analysis: number; value: number }>;
    category?: string;
    isSupreme?: boolean;
    isRare?: boolean;
    isAlavancagem?: boolean;
    isTop1?: boolean;
  }) => void;
  clearStats: () => void;
  getAssertivity: (key: string) => number;
}

export const useSignalStatsStore = create<SignalStatsStore>()(
  persist(
    (set, get) => ({
      stats: {},
      recentSignals: [],

      updateStats: (key, outcome) =>
        set((state) => {
          const current = state.stats[key] || { green: 0, red: 0, lastUpdated: Date.now() };
          return {
            stats: {
              ...state.stats,
              [key]: {
                ...current,
                green: outcome === "green" ? current.green + 1 : current.green,
                red: outcome === "red" ? current.red + 1 : current.red,
                lastUpdated: Date.now(),
              },
            },
          };
        }),

      recordCompletedSignal: (signal) =>
        set((state) => {
          const existingIndex = state.recentSignals.findIndex((s) => s.key === signal.key);
          const alreadyExists = existingIndex >= 0;
          const prevEntry = alreadyExists ? state.recentSignals[existingIndex] : null;

          // Se o sinal já foi registrado no histórico, seu resultado é definitivo (imutabilidade WIN/LOSS)
          if (
            alreadyExists &&
            prevEntry &&
            (prevEntry.outcome === "green" || prevEntry.outcome === "red")
          ) {
            const updatedRecent = state.recentSignals.map((s, idx) =>
              idx === existingIndex
                ? {
                    ...s,
                    audit: signal.audit || s.audit,
                    resultTime: signal.resultTime || s.resultTime,
                    winningResultId: signal.winningResultId ?? s.winningResultId,
                    winningResultCreatedAt:
                      signal.winningResultCreatedAt ?? s.winningResultCreatedAt,
                    checkedResults: signal.checkedResults ?? s.checkedResults,
                    windowLabel: signal.windowLabel ?? s.windowLabel,
                  }
                : s,
            );
            return {
              recentSignals: updatedRecent,
              stats: state.stats,
            };
          }

          const newEntry: SignalHistoryEntry = {
            key: signal.key,
            time: signal.time,
            outcome: signal.outcome,
            label: signal.label,
            confluence: signal.confluence,
            resultTime: signal.resultTime,
            timestamp: Date.now(),
            targetTime: signal.targetTime || signal.time,
            strategyKey: signal.strategyKey,
            confirmedStrategies: signal.confirmedStrategies,
            windowLabel: signal.windowLabel,
            checkedResults: signal.checkedResults,
            winningResultId: signal.winningResultId,
            winningResultCreatedAt: signal.winningResultCreatedAt,
            audit: signal.audit,
            sources: signal.sources,
            category: signal.category,
            isSupreme: signal.isSupreme,
            isRare: signal.isRare,
            isAlavancagem: signal.isAlavancagem,
            isTop1: signal.isTop1,
          };

          const updatedRecent = [newEntry, ...state.recentSignals].slice(0, 50);

          // Atualiza estatísticas por estratégia e confluência
          const newStats = { ...state.stats };
          const keysToUpdate = new Set<string>();

          if (signal.strategyKey) {
            keysToUpdate.add(signal.strategyKey);
            const clean = signal.strategyKey.replace(/^(S19_|S17_)/, "");
            keysToUpdate.add(clean);
            if (clean === "9-10" || clean === "10-9") keysToUpdate.add("S19_10-9");
            if (clean === "7-12" || clean === "12-7") keysToUpdate.add("S19_12-7");
            if (clean === "13-6" || clean === "6-13") keysToUpdate.add("S19_6-13");
            if (clean === "5-14" || clean === "14-5") keysToUpdate.add("S19_14-5");
            if (clean === "11-8") keysToUpdate.add("S19_11-8");
            if (clean === "8-11") keysToUpdate.add("S19_8-11");
            if (clean === "10-7") keysToUpdate.add("S17_10-7");
            if (clean === "7-10") keysToUpdate.add("S17_7-10");
            if (clean === "9-8" || clean === "8-9") keysToUpdate.add("S17_8-9");
            if (clean === "6-11" || clean === "11-6") keysToUpdate.add("S17_11-6");
            if (clean === "5-12") keysToUpdate.add("S17_5-12");
            if (clean === "12-5") keysToUpdate.add("S17_12-5");
            if (clean === "13-4") keysToUpdate.add("S17_13-4");
            if (clean === "4-13") keysToUpdate.add("S17_4-13");
            if (clean === "3-14" || clean === "14-3") keysToUpdate.add("S17_14-3");
          }
          if (Array.isArray(signal.confirmedStrategies)) {
            signal.confirmedStrategies.forEach((cs) => {
              if (cs && cs.code) {
                keysToUpdate.add(cs.code);
              }
            });
          }
          if (Array.isArray(signal.sources)) {
            signal.sources.forEach((src) => {
              if (src && src.analysis) {
                keysToUpdate.add(`A${src.analysis}`);
              }
            });
          }

          keysToUpdate.forEach((k) => {
            const cur = newStats[k] || { green: 0, red: 0, lastUpdated: Date.now() };
            newStats[k] = {
              ...cur,
              green: signal.outcome === "green" ? cur.green + 1 : cur.green,
              red: signal.outcome === "red" ? cur.red + 1 : cur.red,
              lastUpdated: Date.now(),
            };
          });

          return {
            recentSignals: updatedRecent,
            stats: newStats,
          };
        }),

      clearStats: () => {
        set({ stats: {}, recentSignals: [] });
        try {
          localStorage.removeItem("freitas-signal-stats-v3");
          localStorage.removeItem("freitas-signal-stats");
          localStorage.removeItem("freitas-signal-stats-v2");
        } catch {
          // ignore
        }
      },

      getAssertivity: (key) => {
        const s = get().stats[key];
        if (!s) return 100;
        const total = s.green + s.red;
        if (total === 0) return 100;
        return (s.green / total) * 100;
      },
    }),
    {
      name: "freitas-signal-stats-v3",
    },
  ),
);
