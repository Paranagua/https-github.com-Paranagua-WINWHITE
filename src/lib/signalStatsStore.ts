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
  isEmAlta?: boolean;
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
  clearedAt?: number;
  updateStats: (key: string, outcome: "green" | "red") => void;
  recordCompletedSignal: (signal: {
    key: string;
    time: string;
    outcome: "green" | "red";
    label?: string;
    confluence?: string;
    resultTime?: string;
    strategyKey?: string;
    strategies?: string[];
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
    isEmAlta?: boolean;
    isTop1?: boolean;
  }) => void;
  clearStats: () => void;
  getAssertivity: (key: string) => number;
  syncWithServerData: (data: {
    recentSignals?: SignalHistoryEntry[];
    stats?: Record<string, AnalysisStat>;
  }) => void;
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

          const isCorrectionFromRedToGreen =
            alreadyExists && prevEntry && prevEntry.outcome === "red" && signal.outcome === "green";

          // Se o sinal já foi registrado no histórico como WIN ("green"), ele é imutável
          // Se foi registrado como LOSS ("red"), só pode ser alterado se a nova auditoria comprovou WIN ("green")
          if (
            alreadyExists &&
            prevEntry &&
            (prevEntry.outcome === "green" ||
              (prevEntry.outcome === "red" && !isCorrectionFromRedToGreen))
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

          const isEmAltaSignal =
            signal.isEmAlta === true ||
            signal.category === "em_alta" ||
            (typeof signal.key === "string" && signal.key.startsWith("EM_ALTA_")) ||
            (typeof signal.label === "string" &&
              (signal.label.toUpperCase().includes("EM ALTA") ||
                signal.label.startsWith("Tendência 3/3"))) ||
            (typeof signal.confluence === "string" &&
              signal.confluence.toUpperCase().includes("EM ALTA"));

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
            strategies: signal.strategies,
            confirmedStrategies: signal.confirmedStrategies,
            windowLabel: signal.windowLabel,
            checkedResults: signal.checkedResults,
            winningResultId: signal.winningResultId,
            winningResultCreatedAt: signal.winningResultCreatedAt,
            audit: signal.audit,
            sources: signal.sources,
            category: isEmAltaSignal ? "em_alta" : signal.category,
            isSupreme: isEmAltaSignal ? false : signal.isSupreme,
            isRare: isEmAltaSignal ? false : signal.isRare,
            isAlavancagem: isEmAltaSignal ? false : signal.isAlavancagem,
            isEmAlta: isEmAltaSignal,
            isTop1: isEmAltaSignal ? false : signal.isTop1,
          };

          let updatedRecent: SignalHistoryEntry[];
          if (isCorrectionFromRedToGreen && existingIndex >= 0) {
            updatedRecent = state.recentSignals.map((s, idx) =>
              idx === existingIndex ? newEntry : s,
            );
          } else {
            updatedRecent = [newEntry, ...state.recentSignals].slice(0, 50);
          }

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
            if (clean === "F2") keysToUpdate.add("F2");
          }
          if (Array.isArray(signal.strategies)) {
            signal.strategies.forEach((st) => {
              if (st) {
                keysToUpdate.add(st);
                const clean = st.replace(/^(S19_|S17_)/, "");
                keysToUpdate.add(clean);
                if (clean === "9-10" || clean === "10-9" || clean === "109" || clean === "910") {
                  keysToUpdate.add("10-9");
                  keysToUpdate.add("S19_10-9");
                }
                if (clean === "7-12" || clean === "12-7" || clean === "127" || clean === "712") {
                  keysToUpdate.add("12-7");
                  keysToUpdate.add("S19_12-7");
                }
                if (clean === "13-6" || clean === "6-13" || clean === "613" || clean === "136") {
                  keysToUpdate.add("6-13");
                  keysToUpdate.add("S19_6-13");
                }
                if (clean === "5-14" || clean === "14-5" || clean === "145" || clean === "514") {
                  keysToUpdate.add("14-5");
                  keysToUpdate.add("S19_14-5");
                }
                if (clean === "11-8" || clean === "118") {
                  keysToUpdate.add("11-8");
                  keysToUpdate.add("S19_11-8");
                }
                if (clean === "8-11" || clean === "811") {
                  keysToUpdate.add("8-11");
                  keysToUpdate.add("S19_8-11");
                }
                if (clean === "10-7" || clean === "7-10" || clean === "107" || clean === "710") {
                  keysToUpdate.add("10-7");
                  keysToUpdate.add("S17_10-7");
                }
                if (clean === "9-8" || clean === "8-9" || clean === "89" || clean === "98") {
                  keysToUpdate.add("8-9");
                  keysToUpdate.add("S17_8-9");
                }
                if (clean === "6-11" || clean === "11-6" || clean === "116") {
                  keysToUpdate.add("11-6");
                  keysToUpdate.add("S17_11-6");
                }
                if (clean === "5-12" || clean === "12-5" || clean === "512") {
                  keysToUpdate.add("5-12");
                  keysToUpdate.add("S17_5-12");
                }
                if (clean === "13-4" || clean === "4-13" || clean === "134") {
                  keysToUpdate.add("13-4");
                  keysToUpdate.add("S17_13-4");
                }
                if (clean === "3-14" || clean === "14-3" || clean === "143") {
                  keysToUpdate.add("14-3");
                  keysToUpdate.add("S17_14-3");
                }
                if (clean === "F2") keysToUpdate.add("F2");
              }
            });
          }
          if (Array.isArray(signal.confirmedStrategies)) {
            signal.confirmedStrategies.forEach((cs) => {
              if (cs && cs.code) {
                keysToUpdate.add(cs.code);
                if (cs.code === "F2") keysToUpdate.add("F2");
              }
            });
          }
          if (Array.isArray(signal.sources)) {
            signal.sources.forEach((src) => {
              if (src && src.analysis) {
                let code = "";
                if (src.analysis === 202) {
                  code = "F2";
                } else if (src.analysis >= 101 && src.analysis <= 115) {
                  code = `E${src.analysis - 100}`;
                } else if (src.analysis >= 50 && src.analysis <= 56) {
                  code = `Q${src.analysis - 49}`;
                } else {
                  code = `A${src.analysis}`;
                }
                keysToUpdate.add(code);
                if (typeof src.value === "number" && src.value >= 0 && src.value <= 14) {
                  keysToUpdate.add(`${code}_${src.value}`);
                  keysToUpdate.add(`A${src.analysis}_${src.value}`);
                }
              }
            });
          }
          if (signal.strategyKey && /^[AQ]\d+/i.test(signal.strategyKey)) {
            keysToUpdate.add(signal.strategyKey.toUpperCase());
          }

          keysToUpdate.forEach((k) => {
            const cur = newStats[k] || { green: 0, red: 0, lastUpdated: Date.now() };
            if (isCorrectionFromRedToGreen) {
              newStats[k] = {
                ...cur,
                green: cur.green + 1,
                red: Math.max(0, cur.red - 1),
                lastUpdated: Date.now(),
              };
            } else {
              newStats[k] = {
                ...cur,
                green: signal.outcome === "green" ? cur.green + 1 : cur.green,
                red: signal.outcome === "red" ? cur.red + 1 : cur.red,
                lastUpdated: Date.now(),
              };
            }
          });

          return {
            recentSignals: updatedRecent,
            stats: newStats,
          };
        }),

      syncWithServerData: (data) =>
        set((state) => {
          if (!data) return state;
          const incomingSignals = Array.isArray(data.recentSignals) ? data.recentSignals : [];
          if (
            incomingSignals.length === 0 &&
            (!data.stats || Object.keys(data.stats).length === 0)
          ) {
            return state;
          }

          const effectiveClearedAt = state.clearedAt || 0;

          // Se o servidor foi limpo (recentSignals vazio e sem stats), zera tudo localmente também
          if (
            Array.isArray(data.recentSignals) &&
            data.recentSignals.length === 0 &&
            (!data.stats || Object.keys(data.stats).length === 0)
          ) {
            return {
              recentSignals: state.recentSignals.filter(
                (s) => (s.timestamp || 0) > effectiveClearedAt,
              ),
              stats: Object.fromEntries(
                Object.entries(state.stats).filter(
                  ([_, st]) => (st.lastUpdated || 0) > effectiveClearedAt,
                ),
              ),
            };
          }

          // Mescla os sinais com base na chave única
          const signalMap = new Map<string, SignalHistoryEntry>();
          // Primeiro adiciona os locais que sejam posteriores ao clearedAt
          state.recentSignals
            .filter((s) => (s.timestamp || 0) > effectiveClearedAt)
            .forEach((s) => signalMap.set(s.key, s));
          // Depois mescla com os do servidor autônomo (priorizando dados de auditoria confirmados)
          incomingSignals
            .filter((s) => (s.timestamp || 0) > effectiveClearedAt)
            .forEach((incoming) => {
              const existing = signalMap.get(incoming.key);
              if (!existing) {
                signalMap.set(incoming.key, incoming);
              } else {
                // Se qualquer um dos dois (local ou servidor) comprovou WIN ("green"), prevalece "green" (WIN)!
                const resolvedOutcome: "green" | "red" =
                  existing.outcome === "green" || incoming.outcome === "green" ? "green" : "red";
                const resolvedLabel = resolvedOutcome === "green" ? "WIN" : "LOSS";

                signalMap.set(incoming.key, {
                  ...incoming,
                  ...existing,
                  outcome: resolvedOutcome,
                  label: resolvedLabel,
                  resultTime: existing.resultTime || incoming.resultTime,
                  winningResultId: existing.winningResultId || incoming.winningResultId,
                  winningResultCreatedAt:
                    existing.winningResultCreatedAt || incoming.winningResultCreatedAt,
                  audit: incoming.audit || existing.audit,
                  checkedResults: incoming.checkedResults ?? existing.checkedResults,
                  windowLabel: incoming.windowLabel || existing.windowLabel,
                });
              }
            });

          const mergedRecent = Array.from(signalMap.values())
            .map((sig) => {
              const isEmAltaSignal =
                sig.isEmAlta === true ||
                sig.category === "em_alta" ||
                (typeof sig.key === "string" && sig.key.startsWith("EM_ALTA_")) ||
                (typeof sig.label === "string" &&
                  (sig.label.toUpperCase().includes("EM ALTA") ||
                    sig.label.startsWith("Tendência 3/3"))) ||
                (typeof sig.confluence === "string" &&
                  sig.confluence.toUpperCase().includes("EM ALTA"));

              if (isEmAltaSignal) {
                return {
                  ...sig,
                  category: "em_alta",
                  isEmAlta: true,
                  isAlavancagem: false,
                  isSupreme: false,
                  isRare: false,
                  isTop1: false,
                };
              }
              return sig;
            })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 100);

          // Mescla estatísticas por chave
          const mergedStats: Record<string, AnalysisStat> = { ...state.stats };
          if (data.stats) {
            Object.entries(data.stats).forEach(([k, servStat]) => {
              const cur = mergedStats[k] || { green: 0, red: 0, lastUpdated: 0 };
              mergedStats[k] = {
                green: Math.max(cur.green, servStat.green),
                red: Math.max(cur.red, servStat.red),
                lastUpdated: Math.max(cur.lastUpdated || 0, servStat.lastUpdated || 0),
              };
            });
          }

          return {
            recentSignals: mergedRecent,
            stats: mergedStats,
          };
        }),

      clearStats: () => {
        const now = Date.now();
        set({ stats: {}, recentSignals: [], clearedAt: now });
        try {
          localStorage.removeItem("freitas-signal-stats-v3");
          localStorage.removeItem("freitas-signal-stats");
          localStorage.removeItem("freitas-signal-stats-v2");
          localStorage.setItem("freitas-signal-stats-cleared-at", String(now));
        } catch {
          // ignore
        }
        // Limpa o servidor autônomo também para que nenhum dado retorne nas próximas consultas
        if (typeof fetch !== "undefined") {
          fetch("/api/public/autonomous-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "clear" }),
          }).catch(() => {
            fetch("/api/public/autonomous-audit", { method: "DELETE" }).catch(() => {});
          });
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
