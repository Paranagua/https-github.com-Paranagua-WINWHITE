import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPredictiveSignals,
  setPredictiveSignals,
  setSignals,
  type StoredSignal,
} from "@/lib/signalsStore";
import { Loader2, Sparkles, Target, Layers } from "lucide-react";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { parseUtcDate } from "@/lib/utils";
import { Card } from "@/components/double/Card";
import {
  buildA1,
  buildA2,
  buildA3,
  buildA4,
  buildA5,
  buildA6,
  buildA7,
  buildA8,
  buildA9,
  buildSeloVerde,
  buildA8_11,
  buildA11_11,
  buildA4_11,
  buildA4_14,
  buildA7_11,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  buildA1Minuto5,
  buildA2Minuto5,
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
  sources: Array<{ analysis: number; value: number }>;
  isHighTendency: boolean;
  isVerified?: boolean;
  isRare?: boolean;
  isSupreme?: boolean;
  isGreenSeal?: boolean;
  greenSealAssertivity?: number;
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
  sources: Array<{ analysis: number; value: number; pct: number; top5: boolean }>;
  confluence: string;
  analysisCount: number;
  isHighTendency: boolean;
  isVerified?: boolean;
  isRare?: boolean;
  isSupreme?: boolean;
  strategyKey?: string;

  outcome?: "pending" | "green" | "red";
  resultTime?: string;
};

const MIN_ASSERTIVIDADE_TOP1 = 45;
const MIN_ASSERTIVIDADE_CONFLUENCIA = 40;
const MIN_GATILHOS = 2;

function addMinutes(d: Date, m: number) {
  const out = new Date(d.getTime() + m * 60_000);
  out.setSeconds(0, 0);
  return out;
}

/** Quantidade de projeções consideradas como candidatas por análise/pedra. */
const CANDIDATE_DEPTH = 10;
/** Somente as N primeiras contam como Top 5 validador. */
const TOP5_DEPTH = 5;

const getMedalStyles = (
  count: number,
  isConsecutive?: boolean,
  levelOffset: number = 0,
  isTop1: boolean = true,
  category?: string,
) => {
  // Para sinais do Modo 2 / Coincidência Top 5 (Análises Secundárias Top 2 ao Top 5)
  if (category === "top5_only" || !isTop1) {
    if (count >= 3) {
      return {
        label: `Coincidência Top 5 (${count}x)`,
        classes: "border-indigo-400/60 bg-indigo-950/40 text-indigo-200 shadow-indigo-500/10",
        badge: "bg-indigo-400/20 text-indigo-200 border-indigo-400/30",
      };
    }
    return {
      label: "Coincidência Top 5",
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
    label: "Top 1 Isolado",
    classes: "border-white/[0.05] bg-white/[0.02]",
    badge: "bg-white/10 text-white border-white/20",
  };
};

const SignalCard = ({ signal: s }: { signal: any }) => {
  if (!s) return null;
  const isTop1Signal = s.isTop1 ?? s.category !== "top5_only";
  const medal = getMedalStyles(
    s.analysisCount || 0,
    s.isConsecutive,
    s.levelOffset || 0,
    isTop1Signal,
    s.category,
  );

  const rawAssertivity = s.isGreenSeal ? (s.greenSealAssertivity ?? 0) : (s.pct ?? 0);
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
        medal ? medal.classes : "border-white/[0.05] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-muted-foreground opacity-80 flex items-center gap-1.5">
            {s.title || "Sinal"}
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40">
              {s.sources?.[0]?.analysis ? `A${s.sources[0].analysis}` : "AUTO"}
            </span>
          </div>
          {s.isVerified && (
            <span className="flex items-center gap-0.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[8px] font-black text-blue-400 border border-blue-500/30">
              ✓ SELO AZUL
            </span>
          )}
          {s.isSupreme && (
            <span className="flex items-center gap-0.5 rounded-full bg-purple-500/25 px-1.5 py-0.5 text-[8px] font-black text-purple-300 border border-purple-400/40 shadow-[0_0_12px_rgba(168,85,247,0.25)] animate-pulse">
              👑 SUPREMO
            </span>
          )}
          {s.isRare && !s.isSupreme && (
            <span className="flex items-center gap-0.5 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-black text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
              💎 RARO
            </span>
          )}
          {s.isRecAlert && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-black text-amber-400 border border-amber-500/30">
              🙌 possível rec
            </span>
          )}
        </div>
        {medal && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${medal.badge}`}
          >
            {medal.label}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between">
        <div className="text-3xl font-black tabular-nums text-white font-outfit">{displayTime}</div>
        {s.isHighTendency && (
          <span className="flex items-center gap-1 rounded-md bg-red-500/20 px-1.5 py-0.5 text-[9px] font-black text-red-400 animate-pulse border border-red-500/30">
            🔥 Alta Tendência
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] tabular-nums font-bold flex items-center gap-1.5">
        <span className={medal ? "text-inherit" : "text-primary"}>{safeAssertivity}%</span>
        {s.isGreenSeal && (
          <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-black text-emerald-400 border border-emerald-500/30">
            ✓ SELADO
          </span>
        )}
        <span className="opacity-50 text-[10px]">·</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.isArray(s.sources) &&
          s.sources.map((src: any, idx: number) => {
            if (!src) return null;
            return (
              <span
                key={idx}
                className="rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-black text-white/70"
              >
                A{src.analysis}·{src.value}
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
  const [mode1, setMode1] = useState<Mode1Signal[] | null>(null);
  const [mode2, setMode2] = useState<Mode2Signal[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  // 1. FILTRAGEM DOS ARRAYS NO ESTADO REACT
  const activeSignals = useMemo(() => {
    try {
      const m1Signals = (mode1 || [])
        .map((s) => {
          if (!s) return null;
          // Logic to assign category for M1 signals
          let category = "top1_isolated";
          if (s.isSupreme || (s.isConsecutive && s.levelOffset && s.levelOffset >= 4)) {
            category = "winn";
          } else if (s.isRare || (s.analysisCount && s.analysisCount >= 2)) {
            category = "rare";
          } else if (s.isVerified || (s.analysisCount && s.analysisCount >= 1 && s.isVerified)) {
            // Top 1 + Confluência / Selo Azul
            category = "top1_top5";
          }

          return {
            ...s,
            isTop1: true,
            top1Count: s.analysisCount || 0,
            hasTop5Confluence: !!s.isVerified,
            category,
            at: s.at,
          };
        })
        .filter(Boolean);

      const m2Signals = (mode2 || [])
        .map((s) => {
          if (!s) return null;
          const category = "top5_only";
          const firstTime = Array.isArray(s.times) && s.times.length > 0 ? s.times[0] : undefined;
          return {
            ...s,
            isTop1: false,
            top1Count: 0,
            hasTop5Confluence: true,
            category,
            at: firstTime,
          };
        })
        .filter(Boolean);

      return [...m1Signals, ...m2Signals] as any[];
    } catch (e) {
      console.error("[PredictiveSignals] activeSignals error:", e);
      return [];
    }
  }, [mode1, mode2]);

  const winnSignals = useMemo(
    () => activeSignals.filter((s) => s.category === "winn"),
    [activeSignals],
  );
  const rareSignals = useMemo(
    () => activeSignals.filter((s) => s.category === "rare"),
    [activeSignals],
  );
  const top1Top5Signals = useMemo(
    () => activeSignals.filter((s) => s.category === "top1_top5"),
    [activeSignals],
  );
  const top1IsolatedSignals = useMemo(
    () => activeSignals.filter((s) => s.category === "top1_isolated"),
    [activeSignals],
  );
  const top5OnlySignals = useMemo(
    () => activeSignals.filter((s) => s.category === "top5_only"),
    [activeSignals],
  );

  useEffect(() => {
    let alive = true;
    const fetchRows = async () => {
      try {
        const { data, error } = await supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("created_at", { ascending: false })
          .limit(5000);
        if (!alive) return;
        if (error) {
          setErr(error.message);
          console.error("[PredictiveSignals] Supabase error:", error);
          setLoading(false);
          return;
        }
        setErr(null);
        setRows(((data ?? []) as Row[]).slice().reverse());
      } catch (e) {
        if (alive) {
          setErr("Erro ao carregar resultados.");
          console.error("[PredictiveSignals] Fetch error:", e);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchRows();

    // Polling a cada 15 segundos para manter a base sempre viva
    const pollInterval = setInterval(() => {
      if (alive) void fetchRows();
    }, 15000);

    // Inscrição Realtime no Supabase
    const channel = supabase
      .channel("blaze_predictive_realtime")
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

    return () => {
      alive = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
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
        6: buildA6(rows),
        7: buildA7(rows),
        8: (buildA8 as any)(rows),
        9: (buildA9 as any)(rows),
        217: buildSeloVerde(rows).filter((c) => c.value === 17),
        218: buildSeloVerde(rows).filter((c) => c.value === 18),
        219: buildSeloVerde(rows).filter((c) => c.value === 19),
        221: buildSeloVerde(rows).filter((c) => c.value === 21),
        10: buildA8_11(rows),
        11: buildA11_11(rows),
        12: buildA4_11(rows),
        13: buildA4_14(rows),
        14: buildASoma17(rows),
        15: buildASoma19(rows),
        16: buildASoma21(rows),
        17: buildA1Minuto5(rows),
        18: buildA2Minuto5(rows),
        20711: buildA7_11(rows),
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
      const mainIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
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

  const secondaryActive = useMemo(() => {
    try {
      const out: Array<{ analysis: number; value: number; open: Cycle }> = [];
      for (let i = 1; i <= 9; i++) {
        const a = 100 + i;
        const cycles = engine[a] || [];
        const latest = latestByValue(cycles);
        latest.forEach((cycle, value) => {
          if (cycle.gaps.length < MAX_ZEROS) out.push({ analysis: a, value, open: cycle });
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
      // round to nearest minute for comparison
      now.setSeconds(0, 0);
      now.setMilliseconds(0);
      setGeneratedAt(now);

      // Alertas de Segurança ("possível rec")
      const recAlerts = buildRecAlerts(rows);
      const activeAlerts = recAlerts.filter((alert: RecAlert) => {
        const diff = (now.getTime() - alert.triggerAt.getTime()) / 60000;
        return diff >= 0 && diff <= alert.duration;
      });

      // Dispara evento global para o SinaisSection alternar para "Rodadas Atuais"
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("switch-audit-filter", { detail: "hoje" }));
      }

      const byTime = new Map<
        number,
        {
          values: number[];
          analyses: Set<number>;
          pct: number;
          label: string;
          sources: Array<{ analysis: number; value: number }>;
          isHighTendency: boolean;
          isPossibleRec: boolean;
          isGreenSeal?: boolean;
          strategyKey?: string;
        }
      >();

      const greenSealIds = [217, 218, 219, 221, 20711];

      // Mapeamento de Green Seal para aplicação em outros cards
      const activeGreenSeals = new Map<number, { id: number; at: number }>();
      greenSealIds.forEach((gsId) => {
        const gsCycles = engine[gsId] || [];
        if (!gsCycles || gsCycles.length === 0) return;
        const lastGs = gsCycles[gsCycles.length - 1];
        if (!lastGs || !lastGs.gaps || lastGs.gaps.length === 0) return;

        let gsMinutes = 0;
        if (gsId === 20711) {
          gsMinutes = lastGs.gaps[0];
        } else {
          gsMinutes = Math.ceil(lastGs.gaps[0] * 0.5) + 1;
        }

        const gsAt = addMinutes(lastGs.triggerAt, gsMinutes).getTime();
        activeGreenSeals.set(gsAt, { id: gsId, at: gsAt });
      });

      for (const item of active) {
        const isA8A9 = [8, 9, 10, 11, 12, 13].includes(item.analysis);
        const hist = (engine[item.analysis] || []).filter((c) => c.value === item.value).slice(-6);

        let targetMinutes = 0;
        let displayPct = 0;
        let displayLabel = "";
        const strategyKey = `A${item.analysis}`;

        if (isA8A9) {
          targetMinutes = item.open.gaps[0] || 0;
          displayPct = 100;
          displayLabel = targetMinutes.toString();
        } else {
          if (hist.length < 1) continue;
          const candidates = computeTop(hist, CANDIDATE_DEPTH);
          if (!candidates.length) continue;

          // Encontra o melhor candidato que projeta um horário no futuro (ou no minuto atual)
          const futureCand =
            candidates.find((g) => {
              let m = g.m;
              if ([17, 18, 19].includes(item.analysis)) m += 1;
              const at = addMinutes(item.open.triggerAt, m);
              return at.getTime() >= now.getTime();
            }) || candidates[0];

          if (!futureCand) continue;

          targetMinutes = futureCand.m;
          if ([17, 18, 19].includes(item.analysis)) {
            targetMinutes += 1;
          }

          displayPct = futureCand.pct;
          displayLabel = targetMinutes.toString();
        }

        const at = addMinutes(item.open.triggerAt, targetMinutes);
        const t = at.getTime();

        // Detection if a Green Seal applies to this card
        const hasGreenSeal = Array.from(activeGreenSeals.values()).some(
          (gs) => Math.abs(gs.at - t) <= 60000,
        );

        const isTendency = isA8A9
          ? true
          : checkHighTendency(engine[item.analysis] || [], item.value);
        const isPossibleRec = activeAlerts.some((alert: RecAlert) => {
          const signalTime = at.getTime();
          const alertStart = alert.triggerAt.getTime();
          const alertEnd = alertStart + alert.duration * 60000;
          return signalTime >= alertStart && signalTime <= alertEnd;
        });

        const cur = byTime.get(t);
        if (!cur) {
          byTime.set(t, {
            values: [item.value],
            analyses: new Set([item.analysis]),
            pct: displayPct,
            label: displayLabel,
            sources: [{ analysis: item.analysis, value: item.value }],
            isHighTendency: isTendency,
            isPossibleRec,
            isGreenSeal: hasGreenSeal,
            strategyKey,
          });
        } else {
          if (!cur.values.includes(item.value)) cur.values.push(item.value);
          cur.analyses.add(item.analysis);
          cur.sources.push({ analysis: item.analysis, value: item.value });
          if (isTendency) cur.isHighTendency = true;
          if (isPossibleRec) cur.isPossibleRec = true;
          if (hasGreenSeal) cur.isGreenSeal = true;
          if (displayPct > cur.pct) {
            cur.pct = displayPct;
            cur.label = displayLabel;
            cur.strategyKey = strategyKey;
          }
        }
      }
      const m1: Mode1Signal[] = Array.from(byTime.entries())
        .sort((a: [number, any], b: [number, any]) => a[0] - b[0])
        .map(([t, info]: [number, any]) => {
          const values = info.values.slice().sort((a: number, b: number) => a - b);
          return {
            key: `m1-${t}`,
            title: `Análise ${values.join(" + ")}`,
            at: new Date(t),
            pct: info.pct,
            label: info.label,
            analysisCount: info.analyses.size,
            sources: info.sources,
            isHighTendency: info.isHighTendency,
            isPossibleRec: info.isPossibleRec,
            isGreenSeal: info.isGreenSeal,
            strategyKey: info.strategyKey,
          };
        });
      setMode1(m1);

      const usedTimes = new Set<number>(m1.map((s) => s.at.getTime()));

      // ---- Modo 2: Estratégia de Coincidência ----
      type Proj = { analysis: number; value: number; pct: number; top5: boolean };
      const byMinute = new Map<number, Proj[]>();

      for (const item of active) {
        const hist = (engine[item.analysis] || []).filter((c) => c.value === item.value).slice(-6);
        if (hist.length < 1) continue;

        const list = computeTop(hist, CANDIDATE_DEPTH);
        list.forEach((g, idx) => {
          let m = g.m;
          if ([17, 18, 19].includes(item.analysis)) m += 1;
          const at = addMinutes(item.open.triggerAt, m).getTime();
          const arr = byMinute.get(at) ?? [];
          arr.push({
            analysis: item.analysis,
            value: item.value,
            pct: g.pct,
            top5: idx < TOP5_DEPTH,
          });
          byMinute.set(at, arr);
        });
      }

      const m2: Mode2Signal[] = [];
      for (const [at, projs] of byMinute) {
        const distinctAnalyses = new Set(projs.map((p) => p.analysis));
        if (distinctAnalyses.size < 2) continue;

        const validators = projs.filter((p) => p.top5);
        if (!validators.length) continue;

        const pct = projs.reduce((s, p) => s + p.pct, 0) / projs.length;

        // FILTRO DE ASSERTIVIDADE RÍGIDO (55% para confluências)
        if (pct < MIN_ASSERTIVIDADE_CONFLUENCIA) continue;

        if (usedTimes.has(at)) continue;
        usedTimes.add(at);

        const sources = projs.slice().sort((a, b) => b.pct - a.pct);
        const confluence = validators
          .slice()
          .sort((a, b) => b.pct - a.pct)
          .map((p) => `A${p.analysis}·${p.value}`)
          .join(", ");

        const isHighTendency = projs.some((p) =>
          checkHighTendency(engine[p.analysis] || [], p.value),
        );

        m2.push({
          key: `m2-${at}`,
          title: Array.from(distinctAnalyses)
            .sort()
            .map((a) => `Análise ${a}`)
            .join(" + "),
          times: [new Date(at)],
          pct,
          sources,
          confluence,
          analysisCount: distinctAnalyses.size,
          isHighTendency,
          strategyKey: sources[0] ? `A${sources[0].analysis}` : undefined,
        });
      }
      m2.sort((a, b) => a.times[0].getTime() - b.times[0].getTime());
      setMode2(m2);

      // ---- Level Elevation, Unification and Proximity Filtering ----
      const rawUnifiedM1: Mode1Signal[] = [];
      const sortedM1 = Array.from(byTime.entries()).sort(
        (a: [number, any], b: [number, any]) => a[0] - b[0],
      );

      for (let i = 0; i < sortedM1.length; i++) {
        const [t, info]: [number, any] = sortedM1[i];
        const next1 = sortedM1[i + 1];
        const next2 = sortedM1[i + 2];

        const isConsecutive3 =
          next1 &&
          next2 &&
          Math.abs(next1[0] - t) <= 60000 &&
          Math.abs(next2[0] - next1[0]) <= 60000;

        const isConsecutive2 = !isConsecutive3 && next1 && Math.abs(next1[0] - t) <= 60000;

        if (isConsecutive3) {
          const middleTime = next1[0];
          const combinedSources = [
            ...(info?.sources || []),
            ...(next1[1]?.sources || []),
            ...(next2[1]?.sources || []),
          ];
          const combinedAnalyses = new Set([
            ...(info?.analyses || []),
            ...(next1[1]?.analyses || []),
            ...(next2[1]?.analyses || []),
          ]);
          const maxPct = Math.max(info?.pct || 0, next1[1]?.pct || 0, next2[1]?.pct || 0);

          rawUnifiedM1.push({
            key: `m1-c3-${middleTime}`,
            title: `Supremo · ${(info?.values || []).join("+")}`,
            at: new Date(middleTime),
            pct: maxPct,
            label: info?.label || "",
            analysisCount: combinedAnalyses.size,
            isConsecutive: true,
            levelOffset: 4,
            sources: combinedSources,
            isHighTendency: !!(
              info?.isHighTendency ||
              next1[1]?.isHighTendency ||
              next2[1]?.isHighTendency
            ),
            isVerified: false,
            isGreenSeal: !!(info?.isGreenSeal || next1[1]?.isGreenSeal || next2[1]?.isGreenSeal),
            strategyKey: info?.strategyKey,
          });
          i += 2;
        } else if (isConsecutive2) {
          const best =
            (info?.pct || 0) >= (next1[1]?.pct || 0)
              ? { t, info }
              : { t: next1[0], info: next1[1] };
          const combinedSources = [...(info?.sources || []), ...(next1[1]?.sources || [])];
          const combinedAnalyses = new Set([
            ...(info?.analyses || []),
            ...(next1[1]?.analyses || []),
          ]);

          rawUnifiedM1.push({
            key: `m1-c2-${best.t}`,
            title: `Confluência · ${(best.info?.values || []).join("+")}`,
            at: new Date(best.t),
            pct: best.info?.pct || 0,
            label: best.info?.label || "",
            analysisCount: combinedAnalyses.size,
            isConsecutive: true,
            levelOffset: 1,
            sources: combinedSources,
            isHighTendency: !!(info?.isHighTendency || next1[1]?.isHighTendency),
            isVerified: false,
            isGreenSeal: !!(info?.isGreenSeal || next1[1]?.isGreenSeal),
            strategyKey: info?.strategyKey,
          });
          i += 1;
        } else {
          rawUnifiedM1.push({
            key: `m1-${t}`,
            title: `Análise ${(info?.values || []).join(" + ")}`,
            at: new Date(t),
            pct: info?.pct || 0,
            label: info?.label || "",
            analysisCount: info?.analyses?.size || 0,
            sources: info?.sources || [],
            isHighTendency: !!info?.isHighTendency,
            isVerified: false,
            isGreenSeal: !!info?.isGreenSeal,
            strategyKey: info?.strategyKey,
          });
        }
      }

      // TRAVA DE VIZINHANÇA PARA MINUTOS SEGUIDOS
      const unifiedM1: Mode1Signal[] = [];
      for (let i = 0; i < rawUnifiedM1.length; i++) {
        const current = rawUnifiedM1[i];
        const next = rawUnifiedM1[i + 1];

        const isCurrentTop1Confluence = (current.analysisCount || 0) >= 2;
        const isNextTop1Confluence = next && (next.analysisCount || 0) >= 2;

        if (
          isCurrentTop1Confluence &&
          isNextTop1Confluence &&
          Math.abs(next.at.getTime() - current.at.getTime()) <= 60000
        ) {
          if ((current.analysisCount || 0) > (next.analysisCount || 0)) {
            unifiedM1.push(current);
          } else if ((next.analysisCount || 0) > (current.analysisCount || 0)) {
            unifiedM1.push(next);
          } else {
            unifiedM1.push(next);
          }
          i++;
        } else {
          unifiedM1.push(current);
        }
      }

      // Secondary Verification Selo Azul Logic
      const secondaryProjections = new Map<number, Set<number>>();
      for (const item of (secondaryActive || []) as any) {
        if (!item || !item.open) continue;
        const hist = (engine[item.analysis] || [])
          .filter((c: any) => c.value === item.value)
          .slice(-6);
        if (hist.length < 6) continue;
        const top1 = computeTop(hist, 1)[0];
        if (!top1) continue;
        const at = addMinutes(item.open.triggerAt, top1.m).getTime();
        if (!secondaryProjections.has(at)) secondaryProjections.set(at, new Set());
        secondaryProjections.get(at)!.add(item.value);
      }

      const finalM1 = await Promise.all(
        unifiedM1.map(async (s) => {
          if (!s || !s.at) return s;
          const t = s.at.getTime();
          const secValues = secondaryProjections.get(t);
          const isVerified =
            secValues &&
            Array.isArray(s.sources) &&
            s.sources.some((src) => secValues.has(src.value));

          const top1Count = s.analysisCount || 0;
          const top5Projs = byMinute.get(t) ?? [];
          const top5Count = new Set(top5Projs.filter((p) => p.top5).map((p) => p.analysis)).size;

          const isSupreme = top1Count >= 2 && top5Count >= 2;
          const isRare = top1Count >= 2;
          const strategyKey = s.strategyKey;

          let isGreenSeal = false;
          let greenSealAssertivity = 0;

          const greenSource = Array.isArray(s.sources)
            ? s.sources.find(
                (src) => (src.analysis >= 217 && src.analysis <= 221) || src.analysis === 20711,
              )
            : undefined;
          if (greenSource) {
            const gsCycles = engine[greenSource.analysis] ?? [];
            const total = gsCycles.length;
            const completed = gsCycles.filter((c) => c.gaps && c.gaps.length > 0).length;
            const pct = total > 0 ? (completed / total) * 100 : 80;
            greenSealAssertivity = Math.max(70, Math.min(95, Math.round(pct)));
            isGreenSeal = true;
          }

          return {
            ...s,
            isVerified: !!isVerified,
            isRare,
            isSupreme,
            isGreenSeal,
            greenSealAssertivity,
            strategyKey,
          };
        }),
      );

      setMode1(finalM1);
    } catch (err) {
      console.error("[PredictiveSignals] generate error:", err);
    }
  }, [active, engine, rows, secondaryActive]);

  useEffect(() => {
    if (active.length > 0 && !loading) {
      void generate();
    }
  }, [active.length, loading, generate]);

  // Alertas de Recuperação "possível rec"
  const activeRecAlerts = useMemo(() => {
    const alerts: Array<{ type: string; start: number; end: number }> = [];
    const now = Date.now();

    if (!Array.isArray(rows) || rows.length < 2) return alerts;
    // Procurar gatilhos no histórico recente (últimas 20 pedras para garantir cobertura da janela)
    const recent = rows.slice(-20);
    for (let i = 1; i < recent.length; i++) {
      if (!recent[i - 1] || !recent[i]) continue;
      const p1 = Number(recent[i - 1].roll);
      const p2 = Number(recent[i].roll);
      const dt = parseUtcDate(recent[i].created_at).getTime();
      if (Number.isNaN(dt)) continue;

      // Gatilho 7-14: 14 min
      if (p1 === 7 && p2 === 14) alerts.push({ type: "7-14", start: dt, end: dt + 14 * 60000 });
      // Gatilho 4-7: 9 min
      if (p1 === 4 && p2 === 7) alerts.push({ type: "4-7", start: dt, end: dt + 9 * 60000 });
      // Gatilho 5-14: 14 min
      if (p1 === 5 && p2 === 14) alerts.push({ type: "5-14", start: dt, end: dt + 14 * 60000 });
    }
    return alerts.filter((a) => a.end > now);
  }, [rows]);

  useEffect(() => {
    if (rows.length > 0 && !loading && mode1 && mode2) {
      const existing = getPredictiveSignals();
      const existingMap = new Map(existing.map((s) => [s.key, s]));

      const syncSignals: any[] = [
        ...(mode1 || []).map((s) => {
          if (!s) return null;
          const prev = existingMap.get(s.key);
          const atTime = s.at instanceof Date ? s.at.getTime() : new Date(s.at).getTime();
          return {
            key: s.key,
            time: fmtClock(s.at),
            pct: Number.isFinite(s.pct) ? s.pct : 0,
            label: s.label || "",
            confluence: Array.isArray(s.sources)
              ? s.sources.map((src) => `A${src.analysis}·${src.value}`).join(", ")
              : "",
            medal: getMedalStyles(
              s.analysisCount || 0,
              s.isConsecutive,
              s.levelOffset || 0,
              true,
              "top1",
            )?.label,
            entryDate: s.at,
            outcome: prev?.outcome || "pending",
            resultTime: prev?.resultTime,
            completedAt: prev?.completedAt,
            isHighTendency: !!s.isHighTendency,
            isVerified: !!s.isVerified,
            isRare: !!s.isRare,
            isSupreme: !!s.isSupreme,
            isGreenSeal: !!s.isGreenSeal,
            greenSealAssertivity: s.greenSealAssertivity,
            strategyKey: s.strategyKey,
            isRecAlert: activeRecAlerts.some(
              (a) => !Number.isNaN(atTime) && atTime >= a.start && atTime <= a.end,
            ),
          };
        }),
        ...(mode2 || []).map((s) => {
          if (!s) return null;
          const prev = existingMap.get(s.key);
          const rawTime = Array.isArray(s.times) && s.times.length > 0 ? s.times[0] : undefined;
          const firstTime =
            rawTime instanceof Date
              ? rawTime.getTime()
              : rawTime
                ? new Date(rawTime).getTime()
                : NaN;
          return {
            key: s.key,
            time: Array.isArray(s.times) ? s.times.map((t) => fmtClock(t)).join(" / ") : "--:--",
            pct: Number.isFinite(s.pct) ? s.pct : 0,
            label: "Confluência",
            confluence: s.confluence || "",
            medal: getMedalStyles(s.analysisCount || 0, false, 0, false, "top5_only")?.label,
            entryDate: rawTime,
            outcome: prev?.outcome || "pending",
            resultTime: prev?.resultTime,
            completedAt: prev?.completedAt,
            isHighTendency: !!s.isHighTendency,
            strategyKey: s.strategyKey,
            isRecAlert: activeRecAlerts.some(
              (a) => !Number.isNaN(firstTime) && firstTime >= a.start && firstTime <= a.end,
            ),
          };
        }),
      ]
        .filter(Boolean)
        .sort((a, b) => {
          const tA =
            a.entryDate instanceof Date
              ? a.entryDate.getTime()
              : a.entryDate
                ? new Date(a.entryDate).getTime()
                : 0;
          const tB =
            b.entryDate instanceof Date
              ? b.entryDate.getTime()
              : b.entryDate
                ? new Date(b.entryDate).getTime()
                : 0;
          return (tA || 0) - (tB || 0);
        });

      setPredictiveSignals(syncSignals);

      // Sincroniza também no formato StoredSignal para a grelha de roleta
      const storedSignalsList: StoredSignal[] = syncSignals.map((s) => {
        const dt = s.entryDate instanceof Date ? s.entryDate : new Date(s.entryDate || 0);
        return {
          id: s.key,
          color: "white",
          entry: 1,
          targetIso: !Number.isNaN(dt.getTime()) ? dt.toISOString() : new Date().toISOString(),
          outcome: s.outcome || "pending",
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

            {/* 3. ⚡ TOP 1 & TOP 5 (Confluência Principal + Secundária) */}
            {top1Top5Signals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                  <Layers className="h-3.5 w-3.5" /> ⚡ TOP 1 & TOP 5 (Confluência Principal +
                  Secundária)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {top1Top5Signals.map((s) => (
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

            {/* 5. 📊 COINCIDÊNCIA TOP 5 (Análises Secundárias Top 2 ao Top 5) */}
            {top5OnlySignals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                  <Layers className="h-3.5 w-3.5" /> 📊 COINCIDÊNCIA TOP 5 (Análises Secundárias Top
                  2 ao Top 5)
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {top5OnlySignals
                    .filter((s) => s.category === "top5_only")
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
