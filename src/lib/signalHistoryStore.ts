import { create } from "zustand";
import { PredictiveSignal } from "./signalsStore";

interface SignalHistoryStore {
  history: (PredictiveSignal & { timestamp: number })[];
  addSignal: (signal: PredictiveSignal) => void;
  updateSignal: (key: string, updates: Partial<PredictiveSignal>) => void;
  removeSignal: (key: string) => void;
}

export const useSignalHistoryStore = create<SignalHistoryStore>((set) => ({
  history: [],
  addSignal: (signal) =>
    set((state) => {
      if (state.history.some((s) => s.key === signal.key)) return state;
      const now = Date.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
      const newHistory = [{ ...signal, timestamp: now }, ...state.history]
        .filter((s) => s.timestamp > twentyFourHoursAgo)
        .slice(0, 500);
      return { history: newHistory };
    }),
  updateSignal: (key, updates) =>
    set((state) => ({
      history: state.history.map((s) =>
        s.key === key ? { ...s, ...updates, timestamp: Date.now() } : s,
      ),
    })),
  removeSignal: (key) =>
    set((state) => ({
      history: state.history.filter((s) => s.key !== key),
    })),
}));
