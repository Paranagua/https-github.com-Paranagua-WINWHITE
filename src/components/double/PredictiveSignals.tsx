import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPredictiveSignals,
  setPredictiveSignals,
  subscribePredictive,
  setSignals,
  type StoredSignal,
  type PredictiveSignal,
} from "@/lib/signalsStore";
import { Loader2, Sparkles, Target, Layers, Zap, Flame } from "lucide-react";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { parseUtcDate } from "@/lib/utils";
import { Card } from "@/components/double/Card";
import {
  getCanonicalSignalKey,
  getSignalRank,
  evaluateSignalLevel,
  hasWhiteInPreviousMinute,
  mergeSignalsLifecycle,
  buildSignalConfluences,
  buildStrategyTriggeredSignals,
  buildEmAltaSignals,
  type RawCandidate,
  SignalRank,
  extractSignalStrategies,
  extractSignalAnalyses,
  formatStrategyCode,
} from "@/lib/signalHierarchy";
import { computeAnalysisTendency, type RawTendencyCandidate } from "@/lib/tendencias";
import { computeAllSumTriggerProjections } from "@/lib/sum19Strategies";
import { computeConfirmationProjections } from "@/lib/confirmationStrategies";
import {
  detectAllColorPatternBreaks,
  colorBreaksToCycles,
  COLOR_PATTERNS,
} from "@/lib/colorPatternBreaks";
import {
  buildA2,
  buildA3,
  buildA4,
  buildA5,
  buildA8_11,
  buildA11_11,
  buildA4_11,
  buildA4_14,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  buildA1Minuto5,
  buildA2Minuto5,
  buildA1Minuto1,
  buildA2Minuto1,
  buildA1Minuto2,
  buildA2Minuto2,
  buildA1Minuto3,
  buildA2Minuto3,
  buildA1Minuto4,
  buildA2Minuto4,
  buildA1Minuto6,
  buildA2Minuto6,
  buildA1Minuto7,
  buildA2Minuto7,
  buildA1Minuto8,
  buildA2Minuto8,
  buildA1Minuto9,
  buildASandwichPontas,
  buildASandwichMeio,
  buildA7_11,
  buildSecondary,
  buildRecAlerts,
  checkHighTendency,
  computeTop,
  fmtClock,
  latestByValue,
  isValidCycle,
  MAX_ZEROS,
  MAX_CYCLES,
  MIN_CYCLES,
  TIMEOUT_MINUTES,
  type Cycle,
  type Row,
} from "@/lib/predictive";
import {
  persistCyclesBatch,
  mergePersistedWithLiveCycles,
  fetchPersistedCyclesMap,
} from "@/lib/cyclePersistence";

type Mode1Signal = {
  key: string;
  title: string;
  at: Date;
  pct: number;
  label: string;
  confluence?: string;
  strategies?: string[];
  analysisCount: number;
  sources: Array<{ analysis: number; value: number; pct?: number; top3?: boolean; rank?: number }>;
  isHighTendency: boolean;
  isVerified?: boolean;
  hasYellowSeal?: boolean;
  hasBlueSeal?: boolean;
  confirmedStrategies?: any[];
  isRare?: boolean;
  isSupreme?: boolean;
  isAlavancagem?: boolean;
  isEmAlta?: boolean;
  category?: string;
  isNoConfluence?: boolean;
  strategyKey?: string;
  isConsecutive?: boolean;
  levelOffset?: number;

  outcome?: "pending" | "green" | "red";
  resultTime?: string;
};

type Mode2Signal = {
  key: string;
  title: string;
  times: Date[];
  pct: number;
  sources: Array<{ analysis: number; value: number; pct: number; top3: boolean; rank?: number }>;
  confluence: string;
  analysisCount: number;
  isHighTendency: boolean;
  isVerified?: boolean;
  hasYellowSeal?: boolean;
  hasBlueSeal?: boolean;
  confirmedStrategies?: any[];
  isRare?: boolean;
  isSupreme?: boolean;
  isAlavancagem?: boolean;
  isEmAlta?: boolean;
  category?: string;
  isNoConfluence?: boolean;
  strategyKey?: string;

  outcome?: "pending" | "green" | "red";
  resultTime?: string;
};

const MIN_ASSERTIVIDADE_TOP1 = 80;
const MAX_ASSERTIVIDADE_TOP1 = 100;
const MIN_ASSERTIVIDADE_TOP3 = 75;
const MAX_ASSERTIVIDADE_TOP3 = 79.99;
const MIN_GATILHOS = MIN_CYCLES; // Mínimo de 5 ciclos válidos (com no mínimo 1 resultado) para envio de sinais (janela de 5 a 6)

function addMinutes(d: Date, m: number) {
  const out = new Date(d.getTime() + m * 60_000);
  out.setSeconds(0, 0);
  return out;
}

/** Quantidade de projeções consideradas como candidatas por análise/pedra. */
const CANDIDATE_DEPTH = 6;
/** Somente as N primeiras contam como Top 3 validador. */
const TOP3_DEPTH = 3;

const getMedalStyles = (
  count: number,
  isConsecutive?: boolean,
  levelOffset: number = 0,
  isTop1: boolean = true,
  category?: string,
  isNoConfluence?: boolean,
) => {
  if (isNoConfluence || category === "no_confluence") {
    return {
      label: "⚪ Sem Confluência",
      classes: "border-zinc-700/80 bg-zinc-900/90 text-zinc-300 shadow-sm ring-1 ring-zinc-700/40",
      badge: "bg-zinc-800 text-zinc-300 border-zinc-700",
    };
  }

  if (category === "alavancagem") {
    return {
      label: `🚀 ALAVANCAGEM (${count}x Top 1)`,
      classes:
        "border-white bg-white text-slate-950 shadow-[0_0_30px_rgba(255,255,255,0.4)] ring-2 ring-white/80",
      badge: "bg-slate-950 text-white border-slate-800",
    };
  }

  if (category === "supreme" || category === "winn") {
    return {
      label: "👑 Supremo",
      classes:
        "border-purple-400 bg-purple-950/50 text-purple-200 shadow-purple-500/25 ring-1 ring-purple-500/30 animate-pulse",
      badge: "bg-purple-400/20 text-purple-300 border-purple-400/30",
    };
  }

  if (category === "rare") {
    return {
      label: `💎 Raro (${count}x Top 1)`,
      classes: "border-cyan-400/60 bg-cyan-950/40 text-cyan-200 shadow-cyan-500/15",
      badge: "bg-cyan-400/20 text-cyan-200 border-cyan-400/30",
    };
  }

  if (category === "em_alta") {
    return {
      label: `🥈 EM ALTA (${count}x Tendência 3/3)`,
      classes:
        "border-slate-300/80 bg-gradient-to-br from-slate-400/20 via-zinc-800/85 to-zinc-900/90 text-slate-100 shadow-[0_0_25px_rgba(203,213,225,0.25)] ring-1 ring-slate-300/60",
      badge: "bg-slate-300/20 text-slate-100 border-slate-300/50",
    };
  }

  // ⚡ Top 1 & Top 3 (Padrão)
  return {
    label: "⚡ Top 1 & Top 3",
    classes: "border-yellow-400/60 bg-yellow-950/40 text-yellow-200 shadow-yellow-500/15",
    badge: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
  };
};

const SignalCard = ({ signal: s }: { signal: any }) => {
  const isNoConfluence =
    !!s.isNoConfluence ||
    s.category === "no_confluence" ||
    getSignalRank(s) === SignalRank.NO_CONFLUENCE;
  const isTop1Signal = !isNoConfluence && (s.isTop1 ?? s.category !== "top5_only");
  const top1Sources = (s.sources || []).filter((src: any) => !src.top5);
  const distinctTop1 = new Set(top1Sources.map((src: any) => src.analysis));
  const rank = getSignalRank(s);
  const isAlavancagem = !isNoConfluence && rank === SignalRank.ALAVANCAGEM;

  const medal = getMedalStyles(
    distinctTop1.size || s.analysisCount || 0,
    s.isConsecutive,
    s.levelOffset || 0,
    isTop1Signal,
    isAlavancagem ? "alavancagem" : s.category,
    isNoConfluence,
  );

  const rawAssertivity = s.pct ?? 0;
  const safeAssertivity = Number.isFinite(Number(rawAssertivity))
    ? Number(rawAssertivity).toFixed(1)
    : "0.0";

  let displayTime = "--:--";
  if (s.at) {
    displayTime = fmtClock(s.at);
  } else if (Array.isArray(s.times) && s.times.length > 0) {
    displayTime = s.times.map((t: any) => fmtClock(t)).join(" / ");
  }

  const cardStrategies = extractSignalStrategies(s).filter((st) => !/^T[_-]/i.test(st));
  const cardAnalyses = extractSignalAnalyses(s);

  const primarySources = (s.sources || []).filter((src: any) => {
    const a = src.analysis;
    return [2, 19, 20, 10, 11, 12, 13, 21, 14, 15, 16, 50, 51, 52, 53, 54, 55, 56].includes(a);
  });
  const primaryCodes: string[] = Array.from(
    new Set<string>(
      primarySources.map((src: any) =>
        src.analysis >= 50 && src.analysis <= 56 ? `Q${src.analysis - 49}` : `A${src.analysis}`,
      ),
    ),
  ).filter((code) => !/^T[_-]/i.test(code));
  if (
    primaryCodes.length === 0 &&
    s.strategyKey &&
    typeof s.strategyKey === "string" &&
    /^[AQ]\d+/i.test(s.strategyKey) &&
    !/^T[_-]/i.test(s.strategyKey)
  ) {
    primaryCodes.push(s.strategyKey.toUpperCase());
  }

  return (
    <div
      key={s.key}
      className={`rounded-2xl border px-5 py-4 backdrop-blur-sm transition-all duration-300 ${
        isAlavancagem
          ? "border-white bg-white text-slate-950 shadow-[0_0_30px_rgba(255,255,255,0.4)] ring-2 ring-white"
          : isNoConfluence
            ? "border-zinc-700/80 bg-zinc-900/80 text-zinc-300 shadow-md ring-1 ring-zinc-700/40 hover:border-zinc-600"
            : medal
              ? medal.classes
              : "border-white/[0.05] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`text-xs font-semibold flex items-center gap-1.5 ${
              isAlavancagem
                ? "text-slate-600"
                : isNoConfluence
                  ? "text-zinc-400"
                  : "text-muted-foreground opacity-80"
            }`}
          >
            {s.title || "Sinal"}
            {primaryCodes.length > 0 ? (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                  isAlavancagem
                    ? "bg-slate-100 border-slate-300 text-slate-800"
                    : "bg-white/10 border-white/20 text-white"
                }`}
                title="Análise Primária Geradora do Sinal"
              >
                {primaryCodes.join(", ")}
              </span>
            ) : null}
            {cardStrategies.length > 0 && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded border font-bold bg-amber-500/15 border-amber-500/30 text-amber-300"
                title="Estratégias de Confluência"
              >
                +{cardStrategies.join(", ")}
              </span>
            )}
          </div>
          {isAlavancagem ? (
            <span className="flex items-center gap-0.5 rounded-full bg-slate-950 px-2 py-0.5 text-[8px] font-black text-white border border-slate-800 shadow-sm animate-pulse">
              🚀 ALAVANCAGEM
            </span>
          ) : s.isSupreme ? (
            <span className="flex items-center gap-0.5 rounded-full bg-purple-500/25 px-1.5 py-0.5 text-[8px] font-black text-purple-300 border border-purple-400/40 shadow-[0_0_12px_rgba(168,85,247,0.25)] animate-pulse">
              👑 SUPREMO
            </span>
          ) : s.isRare ? (
            <span className="flex items-center gap-0.5 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-black text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
              💎 RARO
            </span>
          ) : null}
          {s.isRecAlert && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-black text-amber-600 border border-amber-500/30">
              🙌 possível rec
            </span>
          )}
          {s.outcome === "green" ? (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/25 px-1.5 py-0.5 text-[8px] font-black text-emerald-400 border border-emerald-500/40 animate-pulse">
              ✓ GREEN {s.resultTime ? `(${s.resultTime})` : ""}
            </span>
          ) : s.outcome === "red" ? (
            <span className="flex items-center gap-0.5 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[8px] font-black text-red-400 border border-red-500/30">
              ✕ RED
            </span>
          ) : (
            <span className="flex items-center gap-0.5 rounded-full bg-white/5 px-1.5 py-0.5 text-[8px] font-bold text-zinc-400 border border-white/10">
              ⏳ PENDENTE
            </span>
          )}
        </div>
        {medal && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
              isAlavancagem ? "bg-slate-950 text-white border-slate-800" : medal.badge
            }`}
          >
            {isAlavancagem
              ? `🚀 ALAVANCAGEM (${distinctTop1.size || s.analysisCount}x)`
              : medal.label}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between">
        <div
          className={`text-3xl font-black tabular-nums font-outfit ${
            isAlavancagem ? "text-slate-950" : "text-white"
          }`}
        >
          {displayTime}
        </div>
        {s.isHighTendency && (
          <span className="flex items-center gap-1 rounded-md bg-red-500/20 px-1.5 py-0.5 text-[9px] font-black text-red-500 animate-pulse border border-red-500/30">
            🔥 Alta Tendência
          </span>
        )}
      </div>
      <div
        className={`mt-1 text-[11px] tabular-nums font-bold flex items-center gap-1.5 ${
          isAlavancagem ? "text-slate-900" : isNoConfluence ? "text-zinc-400" : "text-primary"
        }`}
      >
        <span>{safeAssertivity}%</span>
        <span className="opacity-50 text-[10px]">·</span>
        <span
          className={
            isAlavancagem
              ? "text-slate-600 font-semibold"
              : isNoConfluence
                ? "text-zinc-400 font-normal"
                : "text-white/60"
          }
        >
          {isAlavancagem
            ? "Confluência Máxima (4+ Top 1)"
            : isNoConfluence
              ? "Aguardando confluência futura"
              : formatStrategyCode(s.label || "Entrada")}
        </span>
      </div>

      {/* Badges do card: Estratégias ANTES das Análises e sem percentual */}
      <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
        {/* 1. Estratégias (ex: E1, 145 sem o '-' e sem percentual) */}
        {cardStrategies.map((stratCode, idx) => {
          const isE = /^E\d+$/i.test(stratCode);
          const eNum = isE ? parseInt(stratCode.substring(1), 10) : 0;
          const isYellowE = isE && eNum <= 10;
          const isBlueE = isE && eNum > 10;

          return (
            <span
              key={`strat-${idx}-${stratCode}`}
              className={`rounded-md border px-2 py-0.5 text-[9.5px] font-black tracking-wide shadow-xs flex items-center gap-1 ${
                isAlavancagem
                  ? "border-slate-800 bg-slate-900 text-white"
                  : isNoConfluence
                    ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                    : isYellowE
                      ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                      : isBlueE
                        ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                        : "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
              }`}
              title={isE ? `Estratégia ${stratCode} (Top 2/3)` : `Estratégia ${stratCode}`}
            >
              <span>{stratCode}</span>
              {isE && (
                <span className="text-[8px] font-bold opacity-75 px-1 py-0.2 rounded bg-black/20">
                  Top 2/3
                </span>
              )}
            </span>
          );
        })}

        {/* 2. Análises (ex: A1-5 88%, A18-2 100%...) */}
        {cardAnalyses.map((ana, idx) => {
          const isTop3Secondary = !!ana.top3;
          // Tendência A18-2 100% (ou qualquer análise de tendência A18 / 100%) em laranja
          const isA18Tendency =
            (ana.text.startsWith("A18") || ana.analysis === 18) &&
            (ana.isTendency ||
              (ana.pct && ana.pct.includes("100%")) ||
              s.isEmAlta ||
              s.category === "em_alta" ||
              s.isHighTendency);
          const isOtherTendency =
            !isA18Tendency && (ana.isTendency || s.isEmAlta || s.category === "em_alta");

          return (
            <span
              key={`ana-${idx}`}
              className={`rounded-md border px-2 py-0.5 text-[9.5px] font-black tabular-nums shadow-xs flex items-center gap-1 ${
                isAlavancagem
                  ? "border-slate-300 bg-slate-100 text-slate-900 font-bold"
                  : isA18Tendency
                    ? "border-orange-500/80 bg-orange-500/25 text-orange-200 ring-1 ring-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.35)] font-black"
                    : isOtherTendency
                      ? "border-orange-500/60 bg-orange-500/15 text-orange-300 font-bold"
                      : isTop3Secondary
                        ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                        : "border-white/15 bg-white/[0.07] text-white/90"
              }`}
              title={`Análise ${ana.text} ${ana.pct ? `(${ana.pct})` : ""}`}
            >
              <span>{ana.text}</span>
              {ana.pct && (
                <span
                  className={`font-bold text-[9px] ${
                    isA18Tendency ? "text-orange-300 opacity-100" : "opacity-80"
                  }`}
                >
                  {ana.pct}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {isNoConfluence && (
        <div className="mt-2.5 text-[10px] text-zinc-400 bg-zinc-800/60 rounded-lg px-2.5 py-1.5 border border-zinc-700/50 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 flex-shrink-0" />
          <span>
            Estratégia sem confluência (não contabilizada no auditor a menos que receba
            confluência).
          </span>
        </div>
      )}
    </div>
  );
};

export function PredictiveSignals() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode1, setMode1] = useState<Mode1Signal[]>([]);
  const [mode2, setMode2] = useState<Mode2Signal[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [activeRecAlerts, setActiveRecAlerts] = useState<
    Array<{ type: string; start: number; end: number }>
  >([]);
  const [persistedCycles, setPersistedCycles] = useState<Record<number, Cycle[]>>({});

  // 0. Carrega ciclos preditivos persistidos do Supabase/Servidor com fallback seguro
  useEffect(() => {
    let alive = true;
    const mainIds = [
      2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56,
    ];

    const loadCycles = async () => {
      try {
        const map = await fetchPersistedCyclesMap(mainIds, 50);
        if (alive && Object.keys(map).length > 0) {
          setPersistedCycles(map);
        }
      } catch {
        // Fallback transparente: o motor utiliza o cálculo em memória das rodadas
      }
    };

    loadCycles();
    const interval = setInterval(loadCycles, 60000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // 1. Carrega dados e sincroniza via realtime + polling de alta frequência
  useEffect(() => {
    let alive = true;

    async function loadInitial() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("id", { ascending: false })
          .limit(3000);

        if (error) throw error;
        if (!alive) return;

        const sorted = (data || []).slice().sort((a, b) => a.id - b.id);
        setRows(sorted);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Erro ao carregar dados do banco");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadInitial();

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("id", { ascending: false })
          .limit(15);
        if (data && data.length > 0 && alive) {
          setRows((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newRows = data.filter((r) => !existingIds.has(r.id)).reverse();
            if (newRows.length === 0) return prev;
            return [...prev, ...newRows];
          });
        }
      } catch (e) {
        console.error("[PredictiveSignals] Polling error:", e);
      }
    }, 4000);

    const channel = supabase
      .channel("predictive_signals_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "blaze_results" },
        (payload) => {
          if (!alive || !payload.new) return;
          setRows((prev) => {
            const newItem = payload.new as Row;
            if (prev.some((r) => String(r.id) === String(newItem.id))) return prev;
            return [...prev, newItem];
          });
        },
      )
      .subscribe();

    const onVisible = () => {
      if (!document.hidden && alive) {
        supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("id", { ascending: false })
          .limit(20)
          .then(({ data }) => {
            if (data && data.length > 0 && alive) {
              setRows((prev) => {
                const existingIds = new Set(prev.map((r) => r.id));
                const newRows = data.filter((r) => !existingIds.has(r.id)).reverse();
                if (newRows.length === 0) return prev;
                return [...prev, ...newRows];
              });
            }
          });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      alive = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const engine = useMemo(() => {
    try {
      const main: Record<number, Cycle[]> = {
        2: buildA2(rows),
        3: buildA3(rows),
        4: buildA4(rows),
        5: buildA5(rows),
        10: buildA8_11(rows),
        11: buildA11_11(rows),
        12: buildA4_11(rows),
        13: buildA4_14(rows),
        14: buildASoma17(rows),
        15: buildASoma19(rows),
        16: buildASoma21(rows),
        17: buildA1Minuto5(rows),
        18: buildA2Minuto5(rows),
        19: buildASandwichPontas(rows),
        20: buildASandwichMeio(rows),
        21: buildA7_11(rows),
        22: buildA1Minuto1(rows),
        23: buildA2Minuto1(rows),
        24: buildA1Minuto2(rows),
        25: buildA2Minuto2(rows),
        26: buildA1Minuto3(rows),
        27: buildA2Minuto3(rows),
        28: buildA1Minuto4(rows),
        29: buildA2Minuto4(rows),
        30: buildA1Minuto6(rows),
        31: buildA2Minuto6(rows),
        32: buildA1Minuto7(rows),
        33: buildA2Minuto7(rows),
        34: buildA1Minuto8(rows),
        35: buildA2Minuto8(rows),
        36: buildA1Minuto9(rows),
      };

      // Adiciona as 7 Quebras de Padrões de Cores (IDs 50 a 56)
      const colorBreakCyclesMap = detectAllColorPatternBreaks(rows);
      COLOR_PATTERNS.forEach((p) => {
        const brks = colorBreakCyclesMap[p.id] || [];
        main[p.analysisId] = colorBreaksToCycles(brks, rows);
      });

      // Mescla com ciclos persistidos prévios quando disponíveis (com cálculo ao vivo como fallback seguro)
      const mainAnalysisIds = [
        2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56,
      ];
      mainAnalysisIds.forEach((a) => {
        if (persistedCycles[a]?.length) {
          main[a] = mergePersistedWithLiveCycles(persistedCycles[a], main[a] || []);
        }
      });

      const secondary: Record<number, Cycle[]> = {};
      for (let i = 1; i <= 9; i++) {
        secondary[100 + i] = buildSecondary(rows, i);
      }
      return { ...main, ...secondary } as Record<number, Cycle[]>;
    } catch (err) {
      console.error("[PredictiveSignals] Engine build error:", err);
      return {} as Record<number, Cycle[]>;
    }
  }, [rows, persistedCycles]);

  // Sincronização e persistência contínua dos ciclos no Supabase/Servidor de forma idempotente
  useEffect(() => {
    if (rows.length === 0) return;
    const timer = setTimeout(() => {
      const mainIds = [
        2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56,
      ];
      const batch: Cycle[] = [];
      mainIds.forEach((a) => {
        const list = engine[a];
        if (list && list.length > 0) {
          batch.push(...list.slice(-10));
        }
      });
      if (batch.length > 0) {
        persistCyclesBatch(batch).catch(() => {});
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [engine, rows.length]);

  /** Ciclos em aberto (status < MAX_ZEROS) por análise + valor. O gatilho ativo é o ciclo aberto mais recente de cada pedra. */
  const active = useMemo(() => {
    try {
      const out: Array<{ analysis: number; value: number; open: Cycle }> = [];
      const mainIds = [
        2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56,
      ];
      mainIds.forEach((a) => {
        const cycles = engine[a] || [];
        const openByValue = new Map<number, Cycle>();
        cycles.forEach((cycle) => {
          if (cycle.gaps.length < MAX_ZEROS) {
            const existing = openByValue.get(cycle.value);
            if (!existing || cycle.triggerAt.getTime() > existing.triggerAt.getTime()) {
              openByValue.set(cycle.value, cycle);
            }
          }
        });
        openByValue.forEach((open, value) => {
          out.push({ analysis: a, value, open });
        });
      });
      return out;
    } catch (err) {
      console.error("[PredictiveSignals] Active cycles error:", err);
      return [];
    }
  }, [engine]);

  /** Ciclos secundários ativos (#1..#9). */
  const secondaryActive = useMemo(() => {
    try {
      const out: Array<{ analysis: number; value: number; open: Cycle }> = [];
      for (let i = 1; i <= 9; i++) {
        const a = 100 + i;
        const cycles = engine[a] || [];
        const openByValue = new Map<number, Cycle>();
        cycles.forEach((cycle) => {
          if (cycle.gaps.length < MAX_ZEROS) {
            const existing = openByValue.get(cycle.value);
            if (!existing || cycle.triggerAt.getTime() > existing.triggerAt.getTime()) {
              openByValue.set(cycle.value, cycle);
            }
          }
        });
        openByValue.forEach((open, value) => {
          out.push({ analysis: a, value, open });
        });
      }
      return out;
    } catch (err) {
      console.error("[PredictiveSignals] Secondary active cycles error:", err);
      return [];
    }
  }, [engine]);

  const hasOpportunity = active.length > 0;

  const generate = useCallback(async () => {
    try {
      const now = new Date();
      now.setSeconds(0, 0);
      now.setMilliseconds(0);
      setGeneratedAt(now);

      // Alertas de Segurança ("possível rec")
      const recAlerts = buildRecAlerts(rows);
      const activeAlerts = recAlerts.filter((alert) => {
        const diff = (now.getTime() - alert.triggerAt.getTime()) / 60000;
        return diff >= 0 && diff <= alert.duration;
      });

      // 1. Extração de todos os candidatos brutos das análises elegíveis e cálculo de Tendências
      const rawCandidates: RawCandidate[] = [];
      const tendencyCandidates: RawTendencyCandidate[] = [];

      for (const item of active) {
        // Obter todos os ciclos daquela análise para aquele valor
        const allCycles = (engine[item.analysis] || []).filter((c) => c.value === item.value);

        // Ciclos anteriores ao gatilho ativo atual (item.open) que já são válidos (gaps.length >= 1)
        const pastValid = allCycles.filter(
          (c) =>
            c !== item.open &&
            c.triggerAt.getTime() <= item.open.triggerAt.getTime() &&
            isValidCycle(c),
        );

        // TENDÊNCIA: baseada exclusivamente nos 3 ciclos mais recentes daquela mesma análise
        if (pastValid.length >= 3) {
          const tendencyResult = computeAnalysisTendency(pastValid, item.open.triggerAt);
          if (tendencyResult.hasTendency && tendencyResult.tendency) {
            const t = tendencyResult.tendency;
            let targetMinutes = t.gap;
            if ([17, 18].includes(item.analysis)) targetMinutes += 1;
            const at = addMinutes(item.open.triggerAt, targetMinutes);
            const targetMs = at.getTime();

            if (targetMs >= now.getTime() - 60_000) {
              const stratKey =
                item.analysis >= 50 && item.analysis <= 56
                  ? `Q${item.analysis - 49}`
                  : `A${item.analysis}`;

              tendencyCandidates.push({
                analysis: item.analysis,
                value: item.value,
                gap: t.gap,
                targetDate: at,
                ratio: t.ratio,
                count: t.count,
                pct: t.pct,
                triggerAt: item.open.triggerAt,
                cycleKey: `TEND_A${item.analysis}_V${item.value}_T${item.open.triggerAt.getTime()}`,
                strategyKey: stratKey,
                label: `Tendência ${t.ratio} (${stratKey}-${item.value})`,
              });
            }
          }
        }

        // Regra de ciclos para envio de sinais padrão e confluência:
        // - Análise "Quebra de Padrões de Cores" (IDs 50 a 56):
        //   Requer no mínimo 4 ciclos no total (3 ciclos anteriores válidos + 1 gatilho ativo).
        //   Calcula os Top Tempos Recorrentes dos 3 ciclos anteriores (slice(-3)).
        // - Demais análises padrão:
        //   Requer no mínimo 4 ciclos anteriores válidos (5 ciclos totais com o gatilho).
        //   Calcula sobre os 5 ciclos passados mais recentes (slice(-5)).
        const isColorBreakAnalysis = item.analysis >= 50 && item.analysis <= 56;
        const minRequiredPastValid = isColorBreakAnalysis ? 3 : 4;

        if (pastValid.length < minRequiredPastValid) continue;

        // Janela estatística: 3 ciclos anteriores para Quebra de Padrões de Cores, ou 5 ciclos passados para as demais
        const hist = isColorBreakAnalysis ? pastValid.slice(-3) : pastValid.slice(-5);

        const candidates = computeTop(hist, CANDIDATE_DEPTH);
        if (!candidates.length) continue;

        const cycleKey = `A${item.analysis}_V${item.value}_T${item.open.triggerAt.getTime()}`;

        // 1. Projeção Top 1 Principal (Regra: Top 1 de 80% a 100%)
        const top1Candidate = candidates[0];

        if (
          top1Candidate &&
          top1Candidate.pct >= MIN_ASSERTIVIDADE_TOP1 &&
          top1Candidate.pct <= MAX_ASSERTIVIDADE_TOP1
        ) {
          let targetMinutes = top1Candidate.m;
          if ([17, 18].includes(item.analysis)) targetMinutes += 1;
          const at = addMinutes(item.open.triggerAt, targetMinutes);
          const t = at.getTime();

          // Sem limite superior de 60 minutos: captura projeções futuras em qualquer horizonte
          if (t >= now.getTime() - 60_000) {
            const isTendency = checkHighTendency(engine[item.analysis] || [], item.value);
            const isPossibleRec = activeAlerts.some((alert) => {
              const signalTime = at.getTime();
              const alertStart = alert.triggerAt.getTime();
              const alertEnd = alertStart + alert.duration * 60000;
              return signalTime >= alertStart && signalTime <= alertEnd;
            });

            const stratKey =
              item.analysis >= 50 && item.analysis <= 56
                ? `Q${item.analysis - 49}`
                : `A${item.analysis}`;

            rawCandidates.push({
              analysis: item.analysis,
              value: item.value,
              pct: top1Candidate.pct,
              targetDate: at,
              isTop1: true,
              rank: 1,
              isHighTendency: isTendency,
              isRecAlert: isPossibleRec,
              strategyKey: stratKey,
              cycleKey,
            });
          }
        } else if (
          top1Candidate &&
          top1Candidate.pct >= MIN_ASSERTIVIDADE_TOP3 &&
          top1Candidate.pct <= MAX_ASSERTIVIDADE_TOP3
        ) {
          // Se estiver na faixa de 75-79%, atua estritamente como confluência (rank 2)
          let targetMinutes = top1Candidate.m;
          if ([17, 18].includes(item.analysis)) targetMinutes += 1;
          const at = addMinutes(item.open.triggerAt, targetMinutes);
          const t = at.getTime();

          if (t >= now.getTime() - 60_000) {
            const isTendency = checkHighTendency(engine[item.analysis] || [], item.value);
            const isPossibleRec = activeAlerts.some((alert) => {
              const signalTime = at.getTime();
              const alertStart = alert.triggerAt.getTime();
              const alertEnd = alertStart + alert.duration * 60000;
              return signalTime >= alertStart && signalTime <= alertEnd;
            });

            const stratKey =
              item.analysis >= 50 && item.analysis <= 56
                ? `Q${item.analysis - 49}`
                : `A${item.analysis}`;

            rawCandidates.push({
              analysis: item.analysis,
              value: item.value,
              pct: top1Candidate.pct,
              targetDate: at,
              isTop1: false,
              rank: 2,
              isHighTendency: isTendency,
              isRecAlert: isPossibleRec,
              strategyKey: stratKey,
              cycleKey,
            });
          }
        }

        // 2. Projeções Secundárias Top 2 ao Top 3 (Validadores: Regra Top 2/3 de 75% a 79%)
        candidates.slice(1, TOP3_DEPTH).forEach((cand, idx) => {
          if (cand.pct < MIN_ASSERTIVIDADE_TOP3 || cand.pct > MAX_ASSERTIVIDADE_TOP3) return;

          let m = cand.m;
          if ([17, 18].includes(item.analysis)) m += 1;
          const at = addMinutes(item.open.triggerAt, m);
          const t = at.getTime();

          // Sem limite superior de 60 minutos: captura projeções futuras em qualquer horizonte
          if (t >= now.getTime() - 60_000) {
            const isTendency = checkHighTendency(engine[item.analysis] || [], item.value);
            const isPossibleRec = activeAlerts.some((alert) => {
              const signalTime = at.getTime();
              const alertStart = alert.triggerAt.getTime();
              const alertEnd = alertStart + alert.duration * 60000;
              return signalTime >= alertStart && signalTime <= alertEnd;
            });

            const stratKey =
              item.analysis >= 50 && item.analysis <= 56
                ? `Q${item.analysis - 49}`
                : `A${item.analysis}`;

            rawCandidates.push({
              analysis: item.analysis,
              value: item.value,
              pct: cand.pct,
              targetDate: at,
              isTop1: false,
              rank: idx + 2,
              isHighTendency: isTendency,
              isRecAlert: isPossibleRec,
              strategyKey: stratKey,
              cycleKey,
            });
          }
        });
      }

      // 2. Extração dos Gatilhos das Estratégias de Soma (Soma 19 + Soma 17) e Estratégias E1-E15
      const sumProjections = computeAllSumTriggerProjections(rows);
      const confProjections = computeConfirmationProjections(rows);

      const alertWindow = activeAlerts.map((a) => ({
        type: a.type,
        start: a.triggerAt.getTime(),
        end: a.triggerAt.getTime() + a.duration * 60000,
      }));
      setActiveRecAlerts(alertWindow);

      // 3. Geração de Sinais: Estratégias de Soma 19 e Soma 17 ativas nas confluências.
      // Estratégias "E" desativadas nas confluências conforme regra do usuário.
      const strategySignals = buildStrategyTriggeredSignals(
        sumProjections,
        rawCandidates,
        [],
        alertWindow,
        now.getTime(),
        undefined,
        tendencyCandidates,
      );

      // 4. Grupo 'EM ALTA':
      // - Fica abaixo de todos os outros grupos (Alavancagem, Supremo, Raro, Top 1 & Top 3).
      // - Só recebe sinais da "TENDÊNCIA".
      // - Regra 3: Apenas tendências com 100% de 3/3 têm poder para enviar sinal no grupo 'EM ALTA'.
      // - Regra 3: Tendências acima de 60% e abaixo de 100% (2/3) só servem de confluência exclusivamente no grupo 'EM ALTA'.
      // - Regra 4: Se algum outro grupo mostrar mesmo horário (sinal), o sinal do grupo 'em alta' some.
      const emAltaSignalsGenerated = buildEmAltaSignals(
        tendencyCandidates,
        strategySignals,
        now.getTime(),
      );

      const allGeneratedSignals = [...strategySignals, ...emAltaSignalsGenerated];

      // Constrói lista m1 (sinais elegíveis)
      const m1: Mode1Signal[] = allGeneratedSignals.map((s) => {
        const dt = s.entryDate instanceof Date ? s.entryDate : new Date(s.entryDate || 0);
        const analysisCount = new Set((s.sources || []).map((src) => src.analysis)).size;

        return {
          key: s.key,
          title: s.label || `Sinal ${s.time}`,
          at: dt,
          pct: s.pct,
          label: s.label,
          confluence: s.confluence,
          strategies: s.strategies || extractSignalStrategies(s),
          analysisCount,
          sources: (s.sources || []).map((src) => ({
            analysis: src.analysis,
            value: src.value,
            pct: src.pct,
            top3: !!src.top3,
            rank: src.rank,
            cycleKey: src.cycleKey,
          })),
          isHighTendency: !!s.isHighTendency,
          isVerified: !!s.isVerified,
          hasYellowSeal: !!s.hasYellowSeal,
          hasBlueSeal: !!s.hasBlueSeal,
          confirmedStrategies: s.confirmedStrategies || [],
          isRare: s.isRare,
          isSupreme: s.isSupreme,
          isAlavancagem: s.isAlavancagem,
          isEmAlta: s.isEmAlta,
          category: s.category,
          isNoConfluence: s.isNoConfluence,
          strategyKey: s.strategyKey,
          isConsecutive: s.isConsecutive,
          levelOffset: s.levelOffset,
        };
      });

      setMode1(m1);
      setMode2([]);
    } catch (err) {
      console.error("[PredictiveSignals] Signal generation error:", err);
    }
  }, [rows, active, engine]);

  // Inscrição em tempo real para sincronizar o status de validação dos sinais (WIN/LOSS/PENDENTE)
  const [liveStoredMap, setLiveStoredMap] = useState<Map<string, PredictiveSignal>>(() => {
    const arr = getPredictiveSignals();
    return new Map(arr.map((s) => [s.key, s]));
  });

  useEffect(() => {
    const updateMap = () => {
      const arr = getPredictiveSignals();
      setLiveStoredMap(new Map(arr.map((s) => [s.key, s])));
    };
    return subscribePredictive(updateMap);
  }, []);

  // Executa geração automática quando os dados estiverem prontos, a cada novo giro ou a cada 8s
  useEffect(() => {
    if (rows.length === 0 || loading) return;

    // Gera imediatamente com os novos dados
    generate();

    // Timer a cada 8 segundos para avançar janelas e projetar próximos minutos continuamente
    const interval = setInterval(() => {
      generate();
    }, 8000);

    const onVisible = () => {
      if (!document.hidden) generate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [rows, loading, generate]);

  // Lista unificada de todos os sinais com ciclo de vida estável
  const activeSignals = useMemo(() => {
    const storedList = Array.from(liveStoredMap.values());
    const sourceList =
      storedList.length > 0
        ? storedList
        : mode1.map((s) => ({
            ...s,
            category: s.isNoConfluence
              ? "no_confluence"
              : s.isAlavancagem
                ? "alavancagem"
                : s.isSupreme
                  ? "supreme"
                  : s.isRare
                    ? "rare"
                    : s.isEmAlta || s.category === "em_alta"
                      ? "em_alta"
                      : "top1_top3",
            isTop1: !s.isNoConfluence && !s.isEmAlta && s.category !== "em_alta",
            times: [s.at],
            entryDate: s.at,
            outcome: "pending" as const,
          }));

    return sourceList
      .map((s) => {
        const dt =
          s.entryDate instanceof Date
            ? s.entryDate
            : s.entryDate
              ? parseUtcDate(s.entryDate as any)
              : new Date();
        const top1Sources = (s.sources || []).filter((src: any) => !src.top3 && !src.top5);
        const top3Sources = (s.sources || []).filter((src: any) => src.top3 || src.top5);

        const evalLevel = evaluateSignalLevel(top1Sources, top3Sources, {
          forcedAlavancagem: s.isAlavancagem,
          forcedSupreme: s.isSupreme,
          forcedRare: s.isRare,
        });

        const rank = getSignalRank(s);
        const isNoConf =
          !!s.isNoConfluence || rank === SignalRank.NO_CONFLUENCE || s.category === "no_confluence";
        const isEmAlta =
          !isNoConf &&
          (rank === SignalRank.EM_ALTA || s.category === "em_alta" || !!(s as any).isEmAlta);

        const category = isNoConf
          ? "no_confluence"
          : isEmAlta
            ? "em_alta"
            : rank === SignalRank.ALAVANCAGEM
              ? "alavancagem"
              : rank === SignalRank.SUPREME
                ? "supreme"
                : rank === SignalRank.RARE
                  ? "rare"
                  : "top1_top3";
        const groupName = isNoConf
          ? "E1–E15 (Sem Confluência)"
          : isEmAlta
            ? "Em Alta"
            : rank === SignalRank.ALAVANCAGEM
              ? "Alavancagem"
              : rank === SignalRank.SUPREME
                ? "Supremo"
                : rank === SignalRank.RARE
                  ? "Raro"
                  : "Top 1 & Top 3";

        return {
          ...s,
          at: dt,
          times: [dt],
          category,
          groupName,
          isNoConfluence: isNoConf,
          isAlavancagem: !isNoConf && rank === SignalRank.ALAVANCAGEM,
          isSupreme: !isNoConf && rank === SignalRank.SUPREME,
          isRare: !isNoConf && rank === SignalRank.RARE,
          isEmAlta,
          isTop1: !isNoConf && !isEmAlta,
        };
      })
      .filter((s) => {
        if (s.isNoConfluence || s.category === "no_confluence") return false;
        const rank = getSignalRank(s);
        return (
          rank === SignalRank.ALAVANCAGEM ||
          rank === SignalRank.SUPREME ||
          rank === SignalRank.RARE ||
          rank === SignalRank.TOP1_TOP3 ||
          rank === SignalRank.EM_ALTA
        );
      })
      .sort((a, b) => {
        const tA = a.at instanceof Date ? a.at.getTime() : 0;
        const tB = b.at instanceof Date ? b.at.getTime() : 0;
        return tA - tB;
      });
  }, [liveStoredMap, mode1]);

  // 1. 🚀 ALAVANCAGEM (Rank 4: >= 4x Top 1 + 0 ou mais Top 2/3)
  const alavancagemSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (s.isNoConfluence || s.category === "no_confluence") return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.ALAVANCAGEM;
    });
  }, [activeSignals]);

  // 2. 👑 SUPREMO (Rank 3: 2x ou 3x Top 1 + 2 ou mais Top 2/3)
  const supremeSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (s.isNoConfluence || s.category === "no_confluence") return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.SUPREME;
    });
  }, [activeSignals]);

  // 3. 💎 RARO (Rank 2: 2x ou 3x Top 1 + 0 ou 1 Top 2/3)
  const rareSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (s.isNoConfluence || s.category === "no_confluence") return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.RARE;
    });
  }, [activeSignals]);

  // 4. ⚡ TOP 1 & TOP 3 (Rank 2: 1x Top 1 + 1 ou mais Top 2/3)
  const top1Top3Signals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (s.isNoConfluence || s.category === "no_confluence") return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.TOP1_TOP3;
    });
  }, [activeSignals]);

  // 5. 🔥 EM ALTA (Rank 1: Sinais exclusivos de Tendência 3/3 gerados pelo módulo de tendências)
  const emAltaSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (s.isNoConfluence || s.category === "no_confluence") return false;
      if (s.isAlavancagem || s.isSupreme || s.isRare) return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.EM_ALTA || s.category === "em_alta" || s.isEmAlta === true;
    });
  }, [activeSignals]);

  // Sincroniza os sinais gerados no `signalsStore` garantindo ciclo de vida e não-desaparecimento
  useEffect(() => {
    if (!loading && rows.length > 0) {
      const existing = getPredictiveSignals();

      const candidateSignals: PredictiveSignal[] = (mode1 || [])
        .map((s) => {
          if (!s) return null;
          const canonicalKey = getCanonicalSignalKey(s.at);
          const atTime = s.at instanceof Date ? s.at.getTime() : new Date(s.at || 0).getTime();
          const top1Sources = (s.sources || []).filter((src: any) => !src.top3 && !src.top5);
          const top3Sources = (s.sources || []).filter((src: any) => src.top3 || src.top5);

          const evalLevel = evaluateSignalLevel(top1Sources, top3Sources, {
            isConsecutive: s.isConsecutive,
            levelOffset: s.levelOffset,
            forcedAlavancagem: s.isAlavancagem,
            forcedSupreme: s.isSupreme,
            forcedRare: s.isRare,
          });

          const isNoConf =
            !!s.isNoConfluence ||
            s.category === "no_confluence" ||
            evalLevel?.category === "no_confluence";

          const isEmAlta = !isNoConf && (s.isEmAlta || s.category === "em_alta");

          const category = isNoConf
            ? "no_confluence"
            : isEmAlta
              ? "em_alta"
              : s.isAlavancagem
                ? "alavancagem"
                : s.isSupreme
                  ? "supreme"
                  : s.isRare
                    ? "rare"
                    : evalLevel?.category || "top1_top3";

          const groupName = isNoConf
            ? "E1–E15 (Sem Confluência)"
            : isEmAlta
              ? "Em Alta"
              : s.isAlavancagem
                ? "Alavancagem"
                : s.isSupreme
                  ? "Supremo"
                  : s.isRare
                    ? "Raro"
                    : evalLevel?.groupName || "Top 1 & Top 3";

          const medal = isNoConf
            ? "⚪ SEM CONFLUÊNCIA"
            : isEmAlta
              ? s.medal || s.label || "🔥 EM ALTA (Tendência 3/3)"
              : evalLevel?.medal ||
                (s.isAlavancagem
                  ? "🚀 ALAVANCAGEM"
                  : s.isSupreme
                    ? "👑 SUPREMO"
                    : s.isRare
                      ? "💎 RARO"
                      : "⚡ TOP 1 & TOP 3");

          return {
            key: canonicalKey,
            time: fmtClock(s.at),
            pct: Number.isFinite(s.pct) ? s.pct : 0,
            label: s.label || groupName,
            confluence:
              s.confluence ||
              (s.sources && s.sources.length > 0
                ? s.sources.map((src) => `A${src.analysis}·${src.value}`).join(", ")
                : "Sem Confluência"),
            medal,
            entryDate: s.at,
            outcome: "pending" as const,
            isHighTendency: !!s.isHighTendency,
            isVerified: !!s.isVerified,
            category,
            groupName,
            isTop1: !isNoConf && !isEmAlta,
            isAlavancagem: !isNoConf && s.isAlavancagem,
            isRare: !isNoConf && s.isRare,
            isSupreme: !isNoConf && s.isSupreme,
            isEmAlta,
            isNoConfluence: isNoConf,
            strategyKey: s.strategyKey,
            sources: s.sources,
            isRecAlert: activeRecAlerts.some(
              (a) => !Number.isNaN(atTime) && atTime >= a.start && atTime <= a.end,
            ),
          };
        })
        .filter(Boolean) as PredictiveSignal[];

      // Mescla com ciclo de vida monotônico garantindo que NADA é perdido e promoções são respeitadas
      const mergedList = mergeSignalsLifecycle(existing, candidateSignals, rows, Date.now());

      setPredictiveSignals(mergedList);

      // Sincroniza também no formato StoredSignal para a grelha de roleta
      const storedSignalsList: StoredSignal[] = mergedList.map((s) => {
        const dt =
          s.entryDate instanceof Date
            ? s.entryDate
            : s.entryDate
              ? parseUtcDate(s.entryDate as any)
              : new Date();
        return {
          id: s.key,
          color: "white",
          entry: 1,
          targetIso: !Number.isNaN(dt.getTime()) ? dt.toISOString() : new Date().toISOString(),
          outcome: s.outcome || "pending",
          category: s.category,
          groupName: s.groupName,
          isSupreme: s.isSupreme,
          isRare: s.isRare,
          isAlavancagem: s.isAlavancagem,
          isEmAlta: s.isEmAlta,
          isNoConfluence: s.isNoConfluence,
          isTop1: s.isTop1,
          label: s.label,
          confluence: s.confluence,
          winningResultId: s.winningResultId,
          audit: s.audit,
          sources: s.sources,
          isVerified: s.isVerified,
          hasYellowSeal: s.hasYellowSeal,
          hasBlueSeal: s.hasBlueSeal,
          confirmedStrategies: s.confirmedStrategies,
        };
      });
      setSignals(storedSignalsList);
    }
  }, [rows, loading, mode1, activeRecAlerts]);

  return (
    <Card className="glass-card !p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.05] bg-white/[0.02] px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary font-outfit">
              Gerador preditivo
            </div>
            <h2 className="text-xl font-black text-white font-outfit uppercase tracking-tight">
              Próximos Sinais
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={!hasOpportunity || loading}
            className="btn-primary flex items-center gap-2 px-5 py-2.5 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all font-bold text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>Gerar Novos Sinais</span>
          </button>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        {err && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {err}
          </div>
        )}

        {!err && (
          <div className="space-y-8">
            {/* 1. 🚀 ALAVANCAGEM (4+ Análises Top 1) */}
            {alavancagemSignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-white">
                  <Zap className="h-4 w-4 text-white fill-white animate-pulse" /> 🚀 ALAVANCAGEM (4+
                  Sinais Top 1)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {alavancagemSignals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 2. 👑 SUPREMO (2-3x Top 1 + 2+ Top 2/3) */}
            {supremeSignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-400">
                  <Sparkles className="h-3.5 w-3.5" /> 👑 SUPREMO (2x-3x Top 1 + 2+ Top 2/3)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {supremeSignals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 3. 💎 RARO (2-3x Top 1 + 0-1 Top 2/3) */}
            {rareSignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  <Sparkles className="h-3.5 w-3.5" /> 💎 RARO (2x-3x Top 1)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rareSignals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 4. ⚡ TOP 1 & TOP 3 (1x Top 1 + 1+ Top 2/3) */}
            {top1Top3Signals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                  <Layers className="h-3.5 w-3.5" /> ⚡ TOP 1 & TOP 3 (1x Top 1 + 1+ Top 2/3)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {top1Top3Signals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 5. 🔥 EM ALTA (Tendência 3/3) - Fica abaixo de todos os outros grupos */}
            {emAltaSignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-400">
                  <Flame className="h-3.5 w-3.5 text-orange-400 animate-pulse" /> 🔥 EM ALTA
                  (Tendência 3/3)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {emAltaSignals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {activeSignals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">
                {loading
                  ? "Carregando resultados e calculando sinais..."
                  : "Sem sinais ativos no momento (aguardando confluências Top 1 & Top 3, Raro, Supremo, Alavancagem ou Em Alta)."}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
