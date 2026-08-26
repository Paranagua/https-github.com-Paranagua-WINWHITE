import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SignalStats {
  green: number;
  red: number;
  lastUpdated: number;
}

interface SignalStatsStore {
  stats: Record<string, SignalStats>;
  updateStats: (key: string, outcome: "green" | "red") => void;
  getAssertivity: (key: string) => number;
}

export const useSignalStatsStore = create<SignalStatsStore>()(
  persist(
    (set, get) => ({
      stats: {},
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
      getAssertivity: (key) => {
        const s = get().stats[key];
        if (!s) return 100; // Default fallback if no history
        const total = s.green + s.red;
        if (total === 0) return 100;
        return (s.green / total) * 100;
      },
    }),
    {
      name: "freitas-signal-stats",
    },
  ),
);
