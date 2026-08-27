import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SignalHistoryEntry {
  key: string;
  time: string;
  outcome: "green" | "red";
  label?: string;
  confluence?: string;
  resultTime?: string;
  timestamp: number;
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
          const prevOutcome = prevEntry?.outcome;

          let updatedRecent: SignalHistoryEntry[];
          if (alreadyExists) {
            updatedRecent = state.recentSignals.map((s, idx) =>
              idx === existingIndex
                ? {
                    ...s,
                    outcome: signal.outcome,
                    resultTime: signal.resultTime || s.resultTime,
                    sources: signal.sources || s.sources,
                    category: signal.category || s.category,
                    isSupreme: signal.isSupreme ?? s.isSupreme,
                    isRare: signal.isRare ?? s.isRare,
                    isAlavancagem: signal.isAlavancagem ?? s.isAlavancagem,
                    isTop1: signal.isTop1 ?? s.isTop1,
                  }
                : s,
            );
          } else {
            updatedRecent = [
              {
                key: signal.key,
                time: signal.time,
                outcome: signal.outcome,
                label: signal.label,
                confluence: signal.confluence,
                resultTime: signal.resultTime,
                timestamp: Date.now(),
                sources: signal.sources,
                category: signal.category,
                isSupreme: signal.isSupreme,
                isRare: signal.isRare,
                isAlavancagem: signal.isAlavancagem,
                isTop1: signal.isTop1,
              },
              ...state.recentSignals,
            ].slice(0, 50); // Mantém até os 50 mais recentes
          }

          // Atualiza estatísticas por análise individual
          const newStats = { ...state.stats };
          const keysToUpdate = new Set<string>();

          if (signal.strategyKey) {
            keysToUpdate.add(signal.strategyKey);
          }
          if (Array.isArray(signal.sources)) {
            signal.sources.forEach((src) => {
              if (src && src.analysis) {
                keysToUpdate.add(`A${src.analysis}`);
              }
            });
          }

          if (!alreadyExists) {
            // Novo sinal sendo registrado
            keysToUpdate.forEach((k) => {
              const cur = newStats[k] || { green: 0, red: 0, lastUpdated: Date.now() };
              newStats[k] = {
                ...cur,
                green: signal.outcome === "green" ? cur.green + 1 : cur.green,
                red: signal.outcome === "red" ? cur.red + 1 : cur.red,
                lastUpdated: Date.now(),
              };
            });
          } else if (prevOutcome && prevOutcome !== signal.outcome) {
            // Sinal existente mudou de status (ex: de RED para GREEN por chegada de resultado)
            keysToUpdate.forEach((k) => {
              const cur = newStats[k] || { green: 0, red: 0, lastUpdated: Date.now() };
              const newGreen =
                signal.outcome === "green"
                  ? cur.green + 1
                  : prevOutcome === "green"
                    ? Math.max(0, cur.green - 1)
                    : cur.green;
              const newRed =
                signal.outcome === "red"
                  ? cur.red + 1
                  : prevOutcome === "red"
                    ? Math.max(0, cur.red - 1)
                    : cur.red;
              newStats[k] = {
                ...cur,
                green: newGreen,
                red: newRed,
                lastUpdated: Date.now(),
              };
            });
          }

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
