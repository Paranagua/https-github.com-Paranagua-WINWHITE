import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPredictiveSignals,
  setPredictiveSignals,
  subscribePredictive,
  setSignals,
  type StoredSignal,
  type PredictiveSignal,
} from "@/lib/signalsStore";
import { Loader2, Sparkles, Target, Layers, Zap } from "lucide-react";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { parseUtcDate } from "@/lib/utils";
import { Card } from "@/components/double/Card";
import {
  getCanonicalSignalKey,
  getSignalRank,
  evaluateSignalLevel,
  hasWhiteInPreviousMinute,
  mergeSignalsLifecycle,
  SignalRank,
} from "@/lib/signalHierarchy";
import {
  buildA1,
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
  buildASandwichPontas,
  buildASandwichMeio,
  buildA7_11,
  buildSecondary,
  buildRecAlerts,
  checkHighTendency,
  computeTop,
  fmtClock,
  latestByValue,
  MAX_ZEROS,
  TIMEOUT_MINUTES,
  type Cycle,
  type Row,
} from "@/lib/predictive";

type Mode1Signal = {
  key: string;
  title: string;
  at: Date;
  pct: number;
  label: string;
  analysisCount: number;
  sources: Array<{ analysis: number; value: number; pct?: number; top3?: boolean; rank?: number }>;
  isHighTendency: boolean;
  isVerified?: boolean;
  isRare?: boolean;
  isSupreme?: boolean;
  isAlavancagem?: boolean;
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
  isRare?: boolean;
  isSupreme?: boolean;
  isAlavancagem?: boolean;
  strategyKey?: string;

  outcome?: "pending" | "green" | "red";
  resultTime?: string;
};

const MIN_ASSERTIVIDADE_TOP1 = 65;
const MIN_ASSERTIVIDADE_TOP3 = 55;
const MIN_GATILHOS = 6;

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
) => {
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
      label: "🏆 WINN Supremo",
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

  if (category === "top1_top3" || category === "top1_top5") {
    return {
      label: "⚡ Top 1 & Top 3",
      classes: "border-primary/60 bg-primary/20 text-blue-200 shadow-blue-500/15",
      badge: "bg-primary/20 text-primary border-primary/30",
    };
  }

  if (category === "top1_isolated") {
    return {
      label: isConsecutive ? "⚡ Consecutivo" : "🎯 Top 1",
      classes: "border-white/10 bg-white/[0.03] text-white/90",
      badge: "bg-white/10 text-white border-white/10",
    };
  }

  if (category === "top3_only" || category === "top5_only" || !isTop1) {
    if (count >= 3) {
      return {
        label: `Coincidência Top 3 (${count}x)`,
        classes: "border-indigo-400/60 bg-indigo-950/40 text-indigo-200 shadow-indigo-500/10",
        badge: "bg-indigo-400/20 text-indigo-200 border-indigo-400/30",
      };
    }
    return {
      label: "Coincidência Top 3",
      classes: "border-indigo-500/30 bg-indigo-950/20 text-indigo-300",
      badge: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    };
  }

  const totalLevel = count + levelOffset;

  if (totalLevel >= 7)
    return {
      label: "👑 Supremo",
      classes:
        "border-purple-400 bg-purple-950/50 text-purple-300 shadow-purple-500/20 animate-pulse",
      badge: "bg-purple-400/20 text-purple-300 border-purple-400/30",
    };
  if (totalLevel === 6)
    return {
      label: "💎 Diamante",
      classes: "border-blue-400 bg-blue-950/40 text-blue-200 shadow-blue-500/10",
      badge: "bg-blue-400/20 text-blue-200 border-blue-400/30",
    };
  if (totalLevel === 5)
    return {
      label: "🥇 Ouro",
      classes: "border-yellow-400 bg-yellow-950/50 text-yellow-300 shadow-yellow-500/20",
      badge: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
    };
  if (totalLevel === 4)
    return {
      label: "🥈 Prata",
      classes: "border-slate-300 bg-slate-800/40 text-slate-100",
      badge: "bg-slate-300/20 text-slate-100 border-slate-300/30",
    };
  if (totalLevel === 3)
    return {
      label: "🥉 Bronze",
      classes: "border-amber-700 bg-amber-950/30 text-amber-300",
      badge: "bg-amber-700/20 text-amber-300 border-amber-700/30",
    };
  if (totalLevel === 2)
    return {
      label: "Top 1 + Confluência",
      classes: "border-cyan-400 bg-cyan-950/30 text-cyan-300 shadow-cyan-500/10",
      badge: "bg-cyan-400/20 text-cyan-300 border-cyan-400/30",
    };

  return {
    label: isConsecutive ? "⚡ Consecutivo" : "🎯 Top 1",
    classes: "border-white/10 bg-white/[0.03] text-white/90",
    badge: "bg-white/10 text-white border-white/10",
  };
};

const SignalCard = ({ signal: s }: { signal: any }) => {
  const isTop1Signal = s.isTop1 ?? s.category !== "top5_only";
  const top1Sources = (s.sources || []).filter((src: any) => !src.top5);
  const distinctTop1 = new Set(top1Sources.map((src: any) => src.analysis));
  const isAlavancagem = s.category === "alavancagem" || s.isAlavancagem || distinctTop1.size >= 4;

  const medal = getMedalStyles(
    distinctTop1.size || s.analysisCount || 0,
    s.isConsecutive,
    s.levelOffset || 0,
    isTop1Signal,
    isAlavancagem ? "alavancagem" : s.category,
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

  return (
    <div
      key={s.key}
      className={`rounded-2xl border px-5 py-4 backdrop-blur-sm transition-all duration-300 ${
        isAlavancagem
          ? "border-white bg-white text-slate-950 shadow-[0_0_30px_rgba(255,255,255,0.4)] ring-2 ring-white"
          : medal
            ? medal.classes
            : "border-white/[0.05] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`text-xs font-semibold flex items-center gap-1.5 ${
              isAlavancagem ? "text-slate-600" : "text-muted-foreground opacity-80"
            }`}
          >
            {s.title || "Sinal"}
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded border ${
                isAlavancagem
                  ? "bg-slate-100 border-slate-300 text-slate-800 font-bold"
                  : "bg-white/5 border-white/10 text-white/40"
              }`}
            >
              {s.sources?.[0]?.analysis ? `A${s.sources[0].analysis}` : "AUTO"}
            </span>
          </div>
          {s.isVerified && (
            <span className="flex items-center gap-0.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[8px] font-black text-blue-400 border border-blue-500/30">
              ✓ SELO AZUL
            </span>
          )}
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
          isAlavancagem ? "text-slate-900" : "text-primary"
        }`}
      >
        <span>{safeAssertivity}%</span>
        <span className="opacity-50 text-[10px]">·</span>
        <span className={isAlavancagem ? "text-slate-600 font-semibold" : "text-white/60"}>
          {isAlavancagem ? "Confluência Máxima (4+ Top 1)" : s.label || "Entrada"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.isArray(s.sources) &&
          s.sources.map((src: any, idx: number) => {
            if (!src) return null;
            const pctStr = src.pct ? `${Math.round(src.pct)}%` : "";
            const isTop3Secondary = !!src.top3;
            return (
              <span
                key={idx}
                className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black ${
                  isAlavancagem
                    ? "border-slate-300 bg-slate-100 text-slate-900 font-bold"
                    : isTop3Secondary
                      ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                      : "border-white/10 bg-white/[0.05] text-white/80"
                }`}
                title={`Análise ${src.analysis} (Pedra ${src.value}) - ${pctStr} ${isTop3Secondary ? "Top 3" : "Top 1"}`}
              >
                A{src.analysis}
                {"·"}
                {src.value} {pctStr && <span className="opacity-75 font-normal">({pctStr})</span>}
              </span>
            );
          })}
      </div>
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
        1: buildA1(rows),
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
      };
      const secondary: Record<number, Cycle[]> = {};
      for (let i = 1; i <= 9; i++) {
        secondary[100 + i] = buildSecondary(rows, i);
      }
      return { ...main, ...secondary } as Record<number, Cycle[]>;
    } catch (err) {
      console.error("[PredictiveSignals] Engine build error:", err);
      return {} as Record<number, Cycle[]>;
    }
  }, [rows]);

  /** Ciclos em aberto (status < MAX_ZEROS) por análise + valor. */
  const active = useMemo(() => {
    try {
      const out: Array<{ analysis: number; value: number; open: Cycle }> = [];
      const mainIds = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
      mainIds.forEach((a) => {
        const cycles = engine[a] || [];
        const latest = latestByValue(cycles);
        latest.forEach((cycle, value) => {
          if (cycle.gaps.length < MAX_ZEROS) {
            out.push({ analysis: a, value, open: cycle });
          }
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
        const latest = latestByValue(cycles);
        latest.forEach((cycle, value) => {
          if (cycle.gaps.length < MAX_ZEROS) {
            out.push({ analysis: a, value, open: cycle });
          }
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

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("switch-audit-filter", { detail: "hoje" }));
      }

      // Estratégia Unificada: Mapeamento de Projeções Top 1 e Top 3 por Minuto
      type MinuteProj = {
        top1: Array<{ analysis: number; value: number; pct: number; top3: false }>;
        top3: Array<{ analysis: number; value: number; pct: number; top3: true; rank: number }>;
        isHighTendency: boolean;
        isPossibleRec: boolean;
        strategyKey?: string;
      };

      const minuteProjections = new Map<number, MinuteProj>();

      for (const item of active) {
        const hist = (engine[item.analysis] || []).filter((c) => c.value === item.value).slice(-6);
        // Regra: Mínimo de 6 ocorrências/gatilhos para uma análise ser elegível
        if (hist.length < MIN_GATILHOS) continue;

        const candidates = computeTop(hist, CANDIDATE_DEPTH);
        if (!candidates.length) continue;

        // 1. Projeção Top 1 Principal (Regra: Top 1 >= 65%)
        const top1Candidate = candidates[0];
        if (top1Candidate && top1Candidate.pct >= MIN_ASSERTIVIDADE_TOP1) {
          let targetMinutes = top1Candidate.m;
          if ([17, 18].includes(item.analysis)) targetMinutes += 1;
          const at = addMinutes(item.open.triggerAt, targetMinutes);
          const t = at.getTime();

          if (t >= now.getTime()) {
            const isTendency = checkHighTendency(engine[item.analysis] || [], item.value);
            const isPossibleRec = activeAlerts.some((alert) => {
              const signalTime = at.getTime();
              const alertStart = alert.triggerAt.getTime();
              const alertEnd = alertStart + alert.duration * 60000;
              return signalTime >= alertStart && signalTime <= alertEnd;
            });

            let cur = minuteProjections.get(t);
            if (!cur) {
              cur = {
                top1: [],
                top3: [],
                isHighTendency: isTendency,
                isPossibleRec,
                strategyKey: `A${item.analysis}`,
              };
              minuteProjections.set(t, cur);
            }
            cur.top1.push({
              analysis: item.analysis,
              value: item.value,
              pct: top1Candidate.pct,
              top3: false,
            });
            if (isTendency) cur.isHighTendency = true;
            if (isPossibleRec) cur.isPossibleRec = true;
          }
        }

        // 2. Projeções Secundárias Top 2 ao Top 3 (Validadores: Regra Top 3 >= 55%)
        candidates.slice(1, TOP3_DEPTH).forEach((cand, idx) => {
          if (cand.pct < MIN_ASSERTIVIDADE_TOP3) return;

          let m = cand.m;
          if ([17, 18].includes(item.analysis)) m += 1;
          const at = addMinutes(item.open.triggerAt, m);
          const t = at.getTime();

          if (t >= now.getTime()) {
            const isTendency = checkHighTendency(engine[item.analysis] || [], item.value);
            const isPossibleRec = activeAlerts.some((alert) => {
              const signalTime = at.getTime();
              const alertStart = alert.triggerAt.getTime();
              const alertEnd = alertStart + alert.duration * 60000;
              return signalTime >= alertStart && signalTime <= alertEnd;
            });

            let cur = minuteProjections.get(t);
            if (!cur) {
              cur = {
                top1: [],
                top3: [],
                isHighTendency: isTendency,
                isPossibleRec,
                strategyKey: `A${item.analysis}`,
              };
              minuteProjections.set(t, cur);
            }
            cur.top3.push({
              analysis: item.analysis,
              value: item.value,
              pct: cand.pct,
              top3: true,
              rank: idx + 2,
            });
            if (isTendency) cur.isHighTendency = true;
            if (isPossibleRec) cur.isPossibleRec = true;
          }
        });
      }

      // Constrói listas m1 e m2
      const m1: Mode1Signal[] = [];
      const m2: Mode2Signal[] = [];

      for (const [t, info] of Array.from(minuteProjections.entries()).sort((a, b) => a[0] - b[0])) {
        const canonicalKey = getCanonicalSignalKey(t);
        if (info.top1.length > 0) {
          const values = Array.from(new Set(info.top1.map((p) => p.value))).sort((a, b) => a - b);
          const distinctTop1 = new Set(info.top1.map((p) => p.analysis));
          // Top 3 de análises complementares
          const secondaryTop3 = info.top3.filter((p) => !distinctTop1.has(p.analysis));
          const allSources = [...info.top1, ...secondaryTop3];
          const maxPct = Math.max(...info.top1.map((p) => p.pct));

          // Classificações
          const isAlavancagem = distinctTop1.size >= 4;
          const isSupreme = distinctTop1.size >= 2 && secondaryTop3.length >= 1;
          const isRare = distinctTop1.size >= 2;

          m1.push({
            key: canonicalKey,
            title: `Análise ${values.join(" + ")}`,
            at: new Date(t),
            pct: maxPct,
            label: info.top1[0].value.toString(),
            analysisCount: new Set(allSources.map((s) => s.analysis)).size,
            sources: allSources,
            isHighTendency: info.isHighTendency,
            strategyKey: info.strategyKey,
            isAlavancagem,
            isSupreme,
            isRare,
          });
        } else if (info.top3.length >= 2) {
          const distinctAnalyses = new Set(info.top3.map((p) => p.analysis));
          if (distinctAnalyses.size >= 2) {
            const avgPct = info.top3.reduce((s, p) => s + p.pct, 0) / info.top3.length;
            if (avgPct >= MIN_ASSERTIVIDADE_TOP3) {
              const sortedSources = info.top3.slice().sort((a, b) => b.pct - a.pct);
              const confluence = sortedSources.map((p) => `A${p.analysis}·${p.value}`).join(", ");

              m2.push({
                key: canonicalKey,
                title: Array.from(distinctAnalyses)
                  .sort()
                  .map((a) => `Análise ${a}`)
                  .join(" + "),
                times: [new Date(t)],
                pct: avgPct,
                sources: sortedSources,
                confluence,
                analysisCount: distinctAnalyses.size,
                isHighTendency: info.isHighTendency,
                strategyKey: sortedSources[0] ? `A${sortedSources[0].analysis}` : undefined,
              });
            }
          }
        }
      }

      setMode2(m2);

      // ---- Level Elevation, Unification and Proximity Filtering ----
      const rawUnifiedM1: Mode1Signal[] = [];

      for (let i = 0; i < m1.length; i++) {
        const sig = m1[i];
        const next1 = m1[i + 1];
        const next2 = m1[i + 2];

        const isConsecutive3 =
          next1 &&
          next2 &&
          next1.at.getTime() - sig.at.getTime() === 60000 &&
          next2.at.getTime() - next1.at.getTime() === 60000;

        if (isConsecutive3) {
          // Fusão de 3 minutos consecutivos no minuto central (T+1)
          const allSources = [...sig.sources, ...next1.sources, ...next2.sources];
          const top1Sources = allSources.filter((s) => !s.top3);
          const top3Sources = allSources.filter((s) => s.top3);
          const distinctTop1 = new Set(top1Sources.map((s) => s.analysis));
          const allAnalyses = new Set(allSources.map((s) => s.analysis));
          const maxPct = Math.max(sig.pct, next1.pct, next2.pct);
          const allValues = Array.from(new Set(top1Sources.map((s) => s.value))).sort(
            (a: number, b: number) => a - b,
          );

          const isAlavancagem = distinctTop1.size >= 4;
          const isSupreme = distinctTop1.size >= 2 && top3Sources.length >= 1;
          const isRare = distinctTop1.size >= 2;

          rawUnifiedM1.push({
            key: getCanonicalSignalKey(next1.at),
            title: `Análise ${allValues.join(" + ")}`,
            at: next1.at,
            pct: maxPct,
            label: "3 Consecutivos",
            analysisCount: allAnalyses.size,
            sources: allSources,
            isHighTendency: sig.isHighTendency || next1.isHighTendency || next2.isHighTendency,
            isConsecutive: true,
            levelOffset: 4,
            isAlavancagem,
            isSupreme,
            isRare,
            strategyKey: next1.strategyKey || sig.strategyKey,
          });

          i += 2;
          continue;
        }

        rawUnifiedM1.push(sig);
      }

      // Regra de Proximidade (Mínimo 2 minutos de distância)
      const filteredM1: Mode1Signal[] = [];
      let lastAcceptedTime = -Infinity;

      for (const sig of rawUnifiedM1) {
        const sigTime = sig.at.getTime();
        if (sigTime - lastAcceptedTime < 2 * 60000) {
          const prevSig = filteredM1[filteredM1.length - 1];
          if (prevSig && (sig.pct > prevSig.pct || sig.isConsecutive)) {
            filteredM1[filteredM1.length - 1] = sig;
            lastAcceptedTime = sigTime;
          }
          continue;
        }
        filteredM1.push(sig);
        lastAcceptedTime = sigTime;
      }

      setMode1(filteredM1);

      const alertWindow = activeAlerts.map((a) => ({
        type: a.type,
        start: a.triggerAt.getTime(),
        end: a.triggerAt.getTime() + a.duration * 60000,
      }));
      setActiveRecAlerts(alertWindow);
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
    if (storedList.length === 0) {
      // Fallback para os candidatos recém-gerados caso o store esteja vazio
      return [
        ...mode1.map((s) => {
          let category = "top1_isolated";
          if (s.isAlavancagem) category = "alavancagem";
          else if (s.isSupreme) category = "supreme";
          else if (s.isRare) category = "rare";
          return {
            ...s,
            category,
            isTop1: true,
            times: [s.at],
            outcome: "pending" as const,
          };
        }),
        ...mode2.map((s) => ({
          ...s,
          category: "top3_only",
          isTop1: false,
          isAlavancagem: false,
          isSupreme: false,
          isRare: false,
          at: s.times[0],
          outcome: "pending" as const,
        })),
      ];
    }

    return storedList
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

        return {
          ...s,
          at: dt,
          times: [dt],
          category: s.category || evalLevel.category,
          groupName: s.groupName || evalLevel.groupName,
          isAlavancagem: rank === SignalRank.ALAVANCAGEM || s.isAlavancagem,
          isSupreme: rank === SignalRank.SUPREME || s.isSupreme,
          isRare: rank === SignalRank.RARE || s.isRare,
          isTop1: rank >= SignalRank.TOP1,
        };
      })
      .sort((a, b) => {
        const tA = a.at instanceof Date ? a.at.getTime() : 0;
        const tB = b.at instanceof Date ? b.at.getTime() : 0;
        return tA - tB;
      });
  }, [liveStoredMap, mode1, mode2]);

  // 0. 🚀 ALAVANCAGEM (Rank 6: 4+ Top 1)
  const alavancagemSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      const rank = getSignalRank(s);
      return rank === SignalRank.ALAVANCAGEM || s.category === "alavancagem" || s.isAlavancagem;
    });
  }, [activeSignals]);

  // 1. 🏆 WINN / SUPREMO (Rank 5: >= 2 Top 1 E >= 1 Top 3)
  const winnSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (alavancagemSignals.some((a) => a.key === s.key)) return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.SUPREME || s.category === "supreme" || s.isSupreme;
    });
  }, [activeSignals, alavancagemSignals]);

  // 2. 💎 RARO (Rank 4: >= 2 Top 1)
  const rareSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (
        alavancagemSignals.some((a) => a.key === s.key) ||
        winnSignals.some((w) => w.key === s.key)
      )
        return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.RARE || s.category === "rare" || s.isRare;
    });
  }, [activeSignals, alavancagemSignals, winnSignals]);

  // 3. ⚡ TOP 1 & TOP 3 (Rank 3: 1 Top 1 E >= 1 Top 3)
  const top1Top3Signals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (
        alavancagemSignals.some((a) => a.key === s.key) ||
        winnSignals.some((w) => w.key === s.key) ||
        rareSignals.some((r) => r.key === s.key)
      )
        return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.TOP1_TOP3 || s.category === "top1_top3";
    });
  }, [activeSignals, alavancagemSignals, winnSignals, rareSignals]);

  // 4. 🎯 TOP 1 ISOLADO (Rank 2: 1 Top 1 apenas)
  const top1IsolatedSignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (
        alavancagemSignals.some((a) => a.key === s.key) ||
        winnSignals.some((w) => w.key === s.key) ||
        rareSignals.some((r) => r.key === s.key) ||
        top1Top3Signals.some((t) => t.key === s.key)
      )
        return false;
      const rank = getSignalRank(s);
      return rank === SignalRank.TOP1 || s.category === "top1_isolated" || s.isTop1;
    });
  }, [activeSignals, alavancagemSignals, winnSignals, rareSignals, top1Top3Signals]);

  // 5. 📊 COINCIDÊNCIA TOP 3 (Rank 1: apenas Top 3, 0 Top 1)
  const top3OnlySignals = useMemo(() => {
    return activeSignals.filter((s) => {
      if (
        alavancagemSignals.some((a) => a.key === s.key) ||
        winnSignals.some((w) => w.key === s.key) ||
        rareSignals.some((r) => r.key === s.key) ||
        top1Top3Signals.some((t) => t.key === s.key) ||
        top1IsolatedSignals.some((i) => i.key === s.key)
      )
        return false;
      return s.category === "top3_only" || s.category === "top5_only" || !s.isTop1;
    });
  }, [
    activeSignals,
    alavancagemSignals,
    winnSignals,
    rareSignals,
    top1Top3Signals,
    top1IsolatedSignals,
  ]);

  // Sincroniza os sinais gerados no `signalsStore` garantindo ciclo de vida e não-desaparecimento
  useEffect(() => {
    if (!loading && rows.length > 0) {
      const existing = getPredictiveSignals();

      const candidateSignals: PredictiveSignal[] = [
        ...(mode1 || []).map((s) => {
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

          return {
            key: canonicalKey,
            time: fmtClock(s.at),
            pct: Number.isFinite(s.pct) ? s.pct : 0,
            label: s.label || evalLevel.label,
            confluence: s.sources
              ? s.sources.map((src) => `A${src.analysis}·${src.value}`).join(", ")
              : "",
            medal: evalLevel.medal,
            entryDate: s.at,
            outcome: "pending" as const,
            isHighTendency: !!s.isHighTendency,
            isVerified: !!s.isVerified,
            category: evalLevel.category,
            groupName: evalLevel.groupName,
            isTop1: evalLevel.isTop1,
            isAlavancagem: evalLevel.isAlavancagem,
            isRare: evalLevel.isRare,
            isSupreme: evalLevel.isSupreme,
            strategyKey: s.strategyKey,
            sources: s.sources,
            isRecAlert: activeRecAlerts.some(
              (a) => !Number.isNaN(atTime) && atTime >= a.start && atTime <= a.end,
            ),
          };
        }),
        ...(mode2 || []).map((s) => {
          if (!s) return null;
          const rawTime = Array.isArray(s.times) && s.times.length > 0 ? s.times[0] : undefined;
          const canonicalKey = getCanonicalSignalKey(rawTime || Date.now());
          const firstTime =
            rawTime instanceof Date
              ? rawTime.getTime()
              : rawTime
                ? new Date(rawTime).getTime()
                : NaN;
          return {
            key: canonicalKey,
            time: Array.isArray(s.times) ? s.times.map((t) => fmtClock(t)).join(" / ") : "--:--",
            pct: Number.isFinite(s.pct) ? s.pct : 0,
            label: "Confluência Top 3",
            confluence: s.confluence || "",
            medal: getMedalStyles(s.analysisCount || 0, false, 0, false, "top3_only")?.label,
            entryDate: rawTime,
            outcome: "pending" as const,
            isHighTendency: !!s.isHighTendency,
            category: "top3_only",
            groupName: "Top 3",
            isTop1: false,
            isAlavancagem: false,
            isSupreme: false,
            isRare: false,
            strategyKey: s.strategyKey,
            sources: s.sources,
            isRecAlert: activeRecAlerts.some(
              (a) => !Number.isNaN(firstTime) && firstTime >= a.start && firstTime <= a.end,
            ),
          };
        }),
      ].filter(Boolean) as PredictiveSignal[];

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
          isTop1: s.isTop1,
          label: s.label,
          confluence: s.confluence,
          winningResultId: s.winningResultId,
          audit: s.audit,
          sources: s.sources,
        };
      });
      setSignals(storedSignalsList);
    }
  }, [rows, loading, mode1, mode2, activeRecAlerts]);

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
            {/* 0. 🚀 ALAVANCAGEM (4+ Análises Top 1) */}
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

            {/* 1. 🏆 WINN (Super Confluência Suprema) */}
            {winnSignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-400">
                  <Sparkles className="h-3.5 w-3.5" /> 🏆 WINN (Super Confluência Suprema)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {winnSignals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 2. 💎 RARO (Múltiplas análises Top 1) */}
            {rareSignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  <Sparkles className="h-3.5 w-3.5" /> 💎 RARO (Múltiplas análises Top 1)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rareSignals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 3. ⚡ TOP 1 & TOP 3 (Confluência Principal + Secundária) */}
            {top1Top3Signals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                  <Layers className="h-3.5 w-3.5" /> ⚡ TOP 1 & TOP 3 (Confluência Principal +
                  Secundária)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {top1Top3Signals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 4. 🎯 TOP 1 ISOLADO (Análise Principal Única) */}
            {top1IsolatedSignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <Target className="h-3.5 w-3.5" /> 🎯 TOP 1 ISOLADO (Análise Principal Única)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {top1IsolatedSignals.map((s) => (
                    <SignalCard key={s.key} signal={s} />
                  ))}
                </div>
              </section>
            )}

            {/* 5. 📊 COINCIDÊNCIA TOP 3 (Análises Secundárias Top 2 ao Top 3) */}
            {top3OnlySignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                  <Layers className="h-3.5 w-3.5" /> 📊 COINCIDÊNCIA TOP 3 (Análises Secundárias Top
                  2 ao Top 3)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {top3OnlySignals
                    .filter((s) => s.category === "top3_only" || s.category === "top5_only")
                    .map((signal) => (
                      <SignalCard key={signal.key} signal={signal} />
                    ))}
                </div>
              </section>
            )}

            {activeSignals.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">
                {loading
                  ? "Carregando resultados e calculando sinais..."
                  : "Sem horários futuros projetados no momento."}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
