import { parseUtcDate } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  Clock,
  Layers,
  Shuffle,
  Plus,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { Card } from "@/components/double/Card";
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
  computeTop,
  isValidCycle,
  type Cycle as EngineCycle,
  type Row,
} from "@/lib/predictive";

type UiCycle = {
  index: number;
  triggerAt: Date;
  triggerLabel: string;
  triggerDetail: string;
  gaps: number[];
  pending: number;
  elapsed: number;
  isInCalculationBase: boolean;
  isOpenTrigger: boolean;
};

const ALL_NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const TOP_N = 3;
const MAX_ZEROS = 14;
const MAX_DETAIL_ROWS = 6;
const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

function diffMinutes(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "--:--";
  const date = d instanceof Date ? d : parseUtcDate(d);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function AnalysisPanel({
  eyebrow,
  title,
  subtitle,
  loading,
  err,
  emptyLabel,
  cycles,
  pedra,
  now,
  maxZeros = MAX_ZEROS,
  detailFormatter,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  loading: boolean;
  err: string | null;
  emptyLabel: string;
  cycles: EngineCycle[];
  pedra: number;
  now: Date;
  maxZeros?: number;
  detailFormatter?: (c: EngineCycle) => string;
}) {
  // Todos os ciclos desta pedra
  const allStoneCycles = useMemo(() => {
    return cycles.filter((c) => c.value === pedra);
  }, [cycles, pedra]);

  // Ciclos abertos ativos (se houver, com gaps < MAX_ZEROS)
  const openCycles = useMemo(() => {
    return allStoneCycles.filter((c) => c.gaps.length < maxZeros);
  }, [allStoneCycles, maxZeros]);

  const openCycleSet = useMemo(() => new Set(openCycles), [openCycles]);

  // Ciclos anteriores que já são válidos (gaps.length >= 1 e não são gatilhos abertos)
  const pastValidCycles = useMemo(() => {
    return allStoneCycles.filter((c) => !openCycleSet.has(c) && isValidCycle(c));
  }, [allStoneCycles, openCycleSet]);

  // Regra Estrita dos 5 Ciclos:
  // - Requer no mínimo 4 ciclos anteriores válidos (+ gatilho(s) ativo(s) = 5 ciclos no total)
  const isEligible = pastValidCycles.length >= 4;

  // Janela estatística usada para o cálculo: 4 ciclos passados (se total for 5) ou 5 ciclos passados mais recentes (se total for 6+)
  const calculationBase = useMemo(() => {
    if (!isEligible) return [];
    return pastValidCycles.slice(-5);
  }, [isEligible, pastValidCycles]);

  const baseSet = useMemo(() => new Set(calculationBase), [calculationBase]);

  // Top 3 calculado estritamente sobre a base válida
  const topRows = useMemo(() => {
    if (!isEligible || calculationBase.length === 0) return [];
    return computeTop(calculationBase, TOP_N);
  }, [isEligible, calculationBase]);

  // Ciclos recentes a exibir na tabela (até 6)
  const uiCycles: UiCycle[] = useMemo(() => {
    const displayed = allStoneCycles.slice(-MAX_DETAIL_ROWS);
    return displayed.map((c, i) => {
      const dt = c.triggerAt;
      const elapsed = diffMinutes(dt, now);
      const pending = Math.max(0, maxZeros - c.gaps.length);
      const isOpen = openCycleSet.has(c);
      const inBase = baseSet.has(c);
      return {
        index: i + 1,
        triggerAt: dt,
        triggerLabel: fmtTime(dt),
        triggerDetail: detailFormatter
          ? detailFormatter(c)
          : `minuto ${String(dt.getMinutes()).padStart(2, "0")}`,
        gaps: c.gaps,
        pending,
        elapsed,
        isInCalculationBase: inBase,
        isOpenTrigger: isOpen,
      };
    });
  }, [allStoneCycles, openCycleSet, baseSet, now, maxZeros, detailFormatter]);

  return (
    <Card className="glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary font-outfit">
              {eyebrow}
            </span>
            {isEligible ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                <ShieldCheck className="h-2.5 w-2.5" />
                Ativa ({calculationBase.length} ciclos base)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-400">
                <AlertCircle className="h-2.5 w-2.5" />
                Bloqueada ({pastValidCycles.length}/4 ciclos válidos)
              </span>
            )}
          </div>
          <h3 className="text-xl font-black text-white sm:text-2xl font-outfit uppercase tracking-tighter mt-0.5">
            {title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs font-bold text-muted-foreground">
          <span>
            {uiCycles.length} de {allStoneCycles.length} ciclos totais
          </span>
          <span className="text-[10px] text-muted-foreground/80 font-mono">
            {pastValidCycles.length} ciclos válidos registrados
          </span>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          {err}
        </div>
      )}

      {!loading && !err && uiCycles.length === 0 && (
        <div className="mt-4 py-8 text-center text-xs text-muted-foreground">{emptyLabel}</div>
      )}

      {!loading && !err && uiCycles.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Tabela de ciclos */}
          <div className="overflow-x-auto lg:col-span-7">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 font-bold">Gatilho</th>
                  <th className="pb-2 font-bold">Detalhe</th>
                  <th className="pb-2 font-bold">Latência até Brancos (min)</th>
                  <th className="pb-2 text-right font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {uiCycles.map((c) => (
                  <tr
                    key={c.index}
                    className={`transition-colors ${
                      c.isOpenTrigger
                        ? "bg-primary/[0.08] border-l-2 border-primary"
                        : c.isInCalculationBase
                          ? "hover:bg-white/[0.04] bg-white/[0.01]"
                          : "hover:bg-white/[0.02] opacity-75"
                    }`}
                  >
                    <td className="py-2.5 font-mono font-bold text-white flex items-center gap-1.5">
                      {c.triggerLabel}
                      {c.isOpenTrigger && (
                        <span className="rounded bg-primary/20 px-1 py-0.2 text-[8px] font-black text-primary animate-pulse">
                          GATILHO
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{c.triggerDetail}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.gaps.map((g, gi) => (
                          <span
                            key={gi}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                              c.isInCalculationBase
                                ? "bg-white/15 text-white shadow-sm"
                                : "bg-white/5 text-white/70"
                            }`}
                          >
                            {g}m
                          </span>
                        ))}
                        {c.gaps.length === 0 && (
                          <span className="text-[10px] text-primary/80 font-bold animate-pulse">
                            Aguardando brancos (T0)...
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-[10px]">
                      {c.isOpenTrigger ? (
                        <span className="text-primary font-bold">Gatilho Aberto</span>
                      ) : c.pending === 0 ? (
                        <span className="text-emerald-400 font-bold">Completo (14)</span>
                      ) : (
                        <span className="text-amber-400 font-bold">{c.gaps.length}/14</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Tempos Mais Recorrentes */}
          <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                  Top Tempos Recorrentes
                </span>
                <span className="text-[10px] font-bold text-muted-foreground font-mono">
                  {isEligible ? `${calculationBase.length} ciclos base` : "Bloqueada (< 5 ciclos)"}
                </span>
              </div>

              {isEligible && topRows.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {topRows.map((r, i) => {
                    const rankBadgeColors = [
                      "text-amber-300 border-amber-500/30 bg-amber-500/15",
                      "text-slate-200 border-slate-400/30 bg-slate-400/15",
                      "text-amber-600 border-amber-700/30 bg-amber-700/15",
                    ];
                    const barFillColors = ["bg-amber-400", "bg-slate-300", "bg-amber-600"];
                    const isTop1Valid = i === 0 && r.pct >= 65;
                    const isTop3Valid = i > 0 && r.pct >= 55;

                    return (
                      <div
                        key={r.m}
                        className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-black border ${
                                rankBadgeColors[i] || "text-primary border-primary/30 bg-primary/10"
                              }`}
                            >
                              #{i + 1}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">
                              {r.label} min
                            </span>
                            {isTop1Valid && (
                              <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">
                                Top 1 (≥65%)
                              </span>
                            )}
                            {isTop3Valid && (
                              <span className="rounded bg-blue-500/20 px-1.5 py-0.2 text-[9px] font-bold text-blue-400">
                                Top 3 (≥55%)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-sm font-black text-white">
                              {r.pct.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-muted-foreground">({r.count}x)</span>
                          </div>
                        </div>

                        {/* Barra de porcentagem visual e limpa */}
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              barFillColors[i] || "bg-primary"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(4, r.pct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-44 rounded-lg border border-dashed border-white/10 p-4 text-center">
                  <AlertCircle className="h-6 w-6 text-amber-400/80 mb-2" />
                  <span className="text-xs font-bold text-white font-outfit uppercase tracking-tight">
                    Análise Bloqueada para Sinais
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground max-w-[240px]">
                    Requer no mínimo 5 ciclos no total (4 passados válidos + 1 gatilho ativo).
                    Atualmente possui apenas {pastValidCycles.length} ciclo(s) válido(s).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AnaliseSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(1);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadData() {
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
        setErr(e?.message || "Erro ao carregar dados");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();

    const poll = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("id", { ascending: false })
          .limit(10);
        if (data && data.length > 0 && alive) {
          setRows((prev) => {
            const ids = new Set(prev.map((r) => r.id));
            const fresh = data.filter((r) => !ids.has(r.id)).reverse();
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh];
          });
        }
      } catch {
        // silencioso
      }
    }, 4000);

    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  // Análises calculadas em memória com base em blaze_results
  // 1. Minutos (0 a 9 em ordem cronológica)
  const a4Cycles = useMemo(() => buildA4(rows), [rows]);
  const a5Cycles = useMemo(() => buildA5(rows), [rows]);
  const a1Min1Cycles = useMemo(() => buildA1Minuto1(rows), [rows]);
  const a2Min1Cycles = useMemo(() => buildA2Minuto1(rows), [rows]);
  const a1Min2Cycles = useMemo(() => buildA1Minuto2(rows), [rows]);
  const a2Min2Cycles = useMemo(() => buildA2Minuto2(rows), [rows]);
  const a1Min3Cycles = useMemo(() => buildA1Minuto3(rows), [rows]);
  const a2Min3Cycles = useMemo(() => buildA2Minuto3(rows), [rows]);
  const a1Min4Cycles = useMemo(() => buildA1Minuto4(rows), [rows]);
  const a2Min4Cycles = useMemo(() => buildA2Minuto4(rows), [rows]);
  const a1Min5Cycles = useMemo(() => buildA1Minuto5(rows), [rows]);
  const a2Min5Cycles = useMemo(() => buildA2Minuto5(rows), [rows]);
  const a1Min6Cycles = useMemo(() => buildA1Minuto6(rows), [rows]);
  const a2Min6Cycles = useMemo(() => buildA2Minuto6(rows), [rows]);
  const a1Min7Cycles = useMemo(() => buildA1Minuto7(rows), [rows]);
  const a2Min7Cycles = useMemo(() => buildA2Minuto7(rows), [rows]);
  const a1Min8Cycles = useMemo(() => buildA1Minuto8(rows), [rows]);
  const a2Min8Cycles = useMemo(() => buildA2Minuto8(rows), [rows]);
  const a1Min9Cycles = useMemo(() => buildA1Minuto9(rows), [rows]);
  const a3Cycles = useMemo(() => buildA3(rows), [rows]);

  // 2. Padrões de Pedra
  const a2Cycles = useMemo(() => buildA2(rows), [rows]);
  const aSandwichPontasCycles = useMemo(() => buildASandwichPontas(rows), [rows]);
  const aSandwichMeioCycles = useMemo(() => buildASandwichMeio(rows), [rows]);

  // 3. Gatilhos & Sequências
  const a8_11Cycles = useMemo(() => buildA8_11(rows), [rows]);
  const a11_11Cycles = useMemo(() => buildA11_11(rows), [rows]);
  const a4_11Cycles = useMemo(() => buildA4_11(rows), [rows]);
  const a4_14Cycles = useMemo(() => buildA4_14(rows), [rows]);
  const a7_11Cycles = useMemo(() => buildA7_11(rows), [rows]);

  // 4. Somas Consecutivas
  const aSoma17Cycles = useMemo(() => buildASoma17(rows), [rows]);
  const aSoma19Cycles = useMemo(() => buildASoma19(rows), [rows]);
  const aSoma21Cycles = useMemo(() => buildASoma21(rows), [rows]);

  // Estatísticas agregadas para o seletor superior de pedras 0..14
  const stats = useMemo(() => {
    const s: Record<
      number,
      { total: number; fullyCompleted: number; totalGaps: number; sumGaps: number }
    > = {};
    ALL_NUMBERS.forEach((n) => (s[n] = { total: 0, fullyCompleted: 0, totalGaps: 0, sumGaps: 0 }));

    const allStoneLists = [
      a4Cycles,
      a5Cycles,
      a1Min1Cycles,
      a2Min1Cycles,
      a1Min2Cycles,
      a2Min2Cycles,
      a1Min3Cycles,
      a2Min3Cycles,
      a1Min4Cycles,
      a2Min4Cycles,
      a1Min5Cycles,
      a2Min5Cycles,
      a1Min6Cycles,
      a2Min6Cycles,
      a1Min7Cycles,
      a2Min7Cycles,
      a1Min8Cycles,
      a2Min8Cycles,
      a1Min9Cycles,
      a3Cycles,
      a2Cycles,
      aSandwichPontasCycles,
      aSandwichMeioCycles,
    ];

    allStoneLists.forEach((list) => {
      list.forEach((c) => {
        const n = c.value;
        if (s[n]) {
          s[n].total++;
          if (c.gaps.length >= MAX_ZEROS) s[n].fullyCompleted++;
          s[n].totalGaps += c.gaps.length;
          s[n].sumGaps += c.gaps.reduce((a, b) => a + b, 0);
        }
      });
    });

    const finalStats: Record<
      number,
      { total: number; fullyCompleted: number; avg: number | null }
    > = {};
    ALL_NUMBERS.forEach((n) => {
      finalStats[n] = {
        total: s[n].total,
        fullyCompleted: s[n].fullyCompleted,
        avg: s[n].totalGaps ? Math.round(s[n].sumGaps / s[n].totalGaps) : null,
      };
    });
    return finalStats;
  }, [
    a4Cycles,
    a5Cycles,
    a1Min1Cycles,
    a2Min1Cycles,
    a1Min2Cycles,
    a2Min2Cycles,
    a1Min3Cycles,
    a2Min3Cycles,
    a1Min4Cycles,
    a2Min4Cycles,
    a1Min5Cycles,
    a2Min5Cycles,
    a1Min6Cycles,
    a2Min6Cycles,
    a1Min7Cycles,
    a2Min7Cycles,
    a1Min8Cycles,
    a2Min8Cycles,
    a1Min9Cycles,
    a3Cycles,
    a2Cycles,
    aSandwichPontasCycles,
    aSandwichMeioCycles,
  ]);

  const categories = [
    { id: "all", label: "Todas as Análises", icon: Sparkles },
    { id: "minutes", label: "Minutos (0 a 9)", icon: Clock },
    { id: "patterns", label: "Padrões de Pedra", icon: Layers },
    { id: "sequences", label: "Gatilhos de Sequência", icon: Shuffle },
    { id: "sums", label: "Somas Consecutivas", icon: Plus },
  ];

  const showMinutes = activeCategory === "all" || activeCategory === "minutes";
  const showPatterns = activeCategory === "all" || activeCategory === "patterns";
  const showSequences = activeCategory === "all" || activeCategory === "sequences";
  const showSums = activeCategory === "all" || activeCategory === "sums";

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-8 sm:gap-6 sm:px-6 sm:py-10">
      <Card className="glass-card p-6">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.4em] text-primary font-outfit">
          Catalogador de latência
        </div>
        <h2 className="text-2xl font-black text-white sm:text-3xl font-outfit uppercase tracking-tighter">
          Ciclos de espera até o branco (0)
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Selecione a pedra (0 a 14) para inspecionar os ciclos e porcentagens de latência até o
          branco em cada análise.
        </p>

        {/* Seletor de Pedra 0 a 14 */}
        <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-[repeat(15,minmax(0,1fr))]">
          {ALL_NUMBERS.map((n) => {
            const st = stats[n] ?? { total: 0, fullyCompleted: 0, avg: null };
            const isSel = selected === n;
            return (
              <button
                key={n}
                onClick={() => setSelected(n)}
                className={`flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-center transition-all duration-300 font-outfit ${
                  isSel
                    ? "border-primary/60 bg-primary/20 text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] scale-105"
                    : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] hover:border-white/20"
                }`}
              >
                <span className="text-lg font-bold tabular-nums">{n}</span>
                <span className="mt-0.5 text-[10px] tabular-nums">
                  {`${st.fullyCompleted}/${st.total}`}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {st.avg !== null ? `${st.avg} min` : "—"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filtro de Categorias de Análise */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Filtrar:
          </span>
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                  isActive
                    ? "border-primary/60 bg-primary/20 text-white shadow-[0_0_15px_rgba(59,130,246,0.25)]"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 1. SEÇÃO DE MINUTOS (0 A 9 EM ORDEM CRONOLÓGICA) */}
      {showMinutes && (
        <>
          {/* Minuto 0 */}
          <AnalysisPanel
            key={`${selected}-a4`}
            eyebrow="Análise 4 · Minuto 0 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 0 (00, 10, 20, 30, 40, 50). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de minuto #0 registrado recentemente."
            cycles={a4Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a5`}
            eyebrow="Análise 5 · Minuto 0 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 0 (00, 10, 20, 30, 40, 50). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #0 registrado recentemente."
            cycles={a5Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 1 */}
          <AnalysisPanel
            key={`${selected}-a22`}
            eyebrow="Análise 22 · Minuto 1 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 1 (01, 11, 21, 31, 41, 51). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #1 registrado recentemente."
            cycles={a1Min1Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a23`}
            eyebrow="Análise 23 · Minuto 1 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 1 (01, 11, 21, 31, 41, 51). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #1 registrado recentemente."
            cycles={a2Min1Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 2 */}
          <AnalysisPanel
            key={`${selected}-a24`}
            eyebrow="Análise 24 · Minuto 2 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 2 (02, 12, 22, 32, 42, 52). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #2 registrado recentemente."
            cycles={a1Min2Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a25`}
            eyebrow="Análise 25 · Minuto 2 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 2 (02, 12, 22, 32, 42, 52). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #2 registrado recentemente."
            cycles={a2Min2Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 3 */}
          <AnalysisPanel
            key={`${selected}-a26`}
            eyebrow="Análise 26 · Minuto 3 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 3 (03, 13, 23, 33, 43, 53). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #3 registrado recentemente."
            cycles={a1Min3Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a27`}
            eyebrow="Análise 27 · Minuto 3 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 3 (03, 13, 23, 33, 43, 53). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #3 registrado recentemente."
            cycles={a2Min3Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 4 */}
          <AnalysisPanel
            key={`${selected}-a28`}
            eyebrow="Análise 28 · Minuto 4 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 4 (04, 14, 24, 34, 44, 54). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #4 registrado recentemente."
            cycles={a1Min4Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a29`}
            eyebrow="Análise 29 · Minuto 4 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 4 (04, 14, 24, 34, 44, 54). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #4 registrado recentemente."
            cycles={a2Min4Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 5 */}
          <AnalysisPanel
            key={`${selected}-a17`}
            eyebrow="Análise 17 · Minuto 5 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 5 (05, 15, 25, 35, 45, 55). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto 5 registrado recentemente."
            cycles={a1Min5Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª min 5 (${String(c.triggerAt.getMinutes()).padStart(2, "0")})`
            }
          />
          <AnalysisPanel
            key={`${selected}-a18`}
            eyebrow="Análise 18 · Minuto 5 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 5 (05, 15, 25, 35, 45, 55). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto 5 registrado recentemente."
            cycles={a2Min5Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª min 5 (${String(c.triggerAt.getMinutes()).padStart(2, "0")})`
            }
          />

          {/* Minuto 6 */}
          <AnalysisPanel
            key={`${selected}-a30`}
            eyebrow="Análise 30 · Minuto 6 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 6 (06, 16, 26, 36, 46, 56). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #6 registrado recentemente."
            cycles={a1Min6Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a31`}
            eyebrow="Análise 31 · Minuto 6 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 6 (06, 16, 26, 36, 46, 56). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #6 registrado recentemente."
            cycles={a2Min6Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 7 */}
          <AnalysisPanel
            key={`${selected}-a32`}
            eyebrow="Análise 32 · Minuto 7 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 7 (07, 17, 27, 37, 47, 57). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #7 registrado recentemente."
            cycles={a1Min7Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a33`}
            eyebrow="Análise 33 · Minuto 7 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 7 (07, 17, 27, 37, 47, 57). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #7 registrado recentemente."
            cycles={a2Min7Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 8 */}
          <AnalysisPanel
            key={`${selected}-a34`}
            eyebrow="Análise 34 · Minuto 8 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 8 (08, 18, 28, 38, 48, 58). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #8 registrado recentemente."
            cycles={a1Min8Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a35`}
            eyebrow="Análise 35 · Minuto 8 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 8 (08, 18, 28, 38, 48, 58). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #8 registrado recentemente."
            cycles={a2Min8Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />

          {/* Minuto 9 */}
          <AnalysisPanel
            key={`${selected}-a36`}
            eyebrow="Análise 36 · Minuto 9 (1ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Primeira pedra registrada nos minutos de final 9 (09, 19, 29, 39, 49, 59). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de primeira pedra do minuto #9 registrado recentemente."
            cycles={a1Min9Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `1ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
          <AnalysisPanel
            key={`${selected}-a3`}
            eyebrow="Análise 3 · Minuto 9 (2ª Pedra)"
            title={`PEDRA ${selected}`}
            subtitle="Segunda pedra registrada nos minutos de final 9 (09, 19, 29, 39, 49, 59). Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de segunda pedra do minuto #9 registrado recentemente."
            cycles={a3Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) =>
              `2ª pedra min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
            }
          />
        </>
      )}

      {/* 2. SEÇÃO DE PADRÕES DE PEDRA */}
      {showPatterns && (
        <>
          <AnalysisPanel
            key={`${selected}-a2`}
            eyebrow="Análise 2 · Repetição Simples (X → X)"
            title={`PEDRA ${selected}`}
            subtitle="Gatilho: a mesma pedra sai duas vezes seguidas na roleta. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de repetição dupla registrado recentemente."
            cycles={a2Cycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) => `Repetição ${c.value}→${c.value}`}
          />
          <AnalysisPanel
            key={`${selected}-a19`}
            eyebrow="Análise 19 · Sanduíche (Pontas Iguais)"
            title={`PEDRA ${selected}`}
            subtitle="Gatilho: P1 - P2 - P1 com P2 != P1. Tempo até o branco indexado pela numeração das pontas (P1)."
            loading={loading}
            err={err}
            emptyLabel={`Nenhum gatilho de sanduíche com pontas na pedra ${selected} registrado.`}
            cycles={aSandwichPontasCycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) => `Sanduíche Ponta (${c.value})`}
          />
          <AnalysisPanel
            key={`${selected}-a20`}
            eyebrow="Análise 20 · Sanduíche (Pedra Central)"
            title={`PEDRA ${selected}`}
            subtitle="Gatilho: P1 - P2 - P1 com P2 != P1. Tempo até o branco indexado pela numeração da pedra central (P2)."
            loading={loading}
            err={err}
            emptyLabel={`Nenhum gatilho de sanduíche com meio na pedra ${selected} registrado.`}
            cycles={aSandwichMeioCycles}
            pedra={selected}
            now={now}
            detailFormatter={(c) => `Sanduíche Meio (${c.value})`}
          />
        </>
      )}

      {/* 3. SEÇÃO DE GATILHOS DE SEQUÊNCIA */}
      {showSequences && (
        <>
          <AnalysisPanel
            key="gatilho-8-11"
            eyebrow="Análise 10 · Gatilho 8 → 11"
            title="GATILHO 8 → 11"
            subtitle="Gatilho: sequência exata [8 -> 11]. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho 8→11 registrado recentemente."
            cycles={a8_11Cycles}
            pedra={811}
            now={now}
            detailFormatter={(c) => `8→11 às ${fmtTime(c.triggerAt)}`}
          />
          <AnalysisPanel
            key="gatilho-11-11"
            eyebrow="Análise 11 · Gatilho 11 → 11"
            title="GATILHO 11 → 11"
            subtitle="Gatilho: sequência exata [11 -> 11]. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho 11→11 registrado recentemente."
            cycles={a11_11Cycles}
            pedra={1111}
            now={now}
            detailFormatter={(c) => `11→11 às ${fmtTime(c.triggerAt)}`}
          />
          <AnalysisPanel
            key="gatilho-4-11"
            eyebrow="Análise 12 · Gatilho 4 → 11"
            title="GATILHO 4 → 11"
            subtitle="Gatilho: sequência exata [4 -> 11]. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho 4→11 registrado recentemente."
            cycles={a4_11Cycles}
            pedra={411}
            now={now}
            detailFormatter={(c) => `4→11 às ${fmtTime(c.triggerAt)}`}
          />
          <AnalysisPanel
            key="gatilho-4-14"
            eyebrow="Análise 13 · Gatilho 4 ↔ 14"
            title="GATILHO 4 ↔ 14"
            subtitle="Gatilho: sequências [4 -> 14] ou [14 -> 4]. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho 4↔14 registrado recentemente."
            cycles={a4_14Cycles}
            pedra={414}
            now={now}
            detailFormatter={(c) => `4↔14 às ${fmtTime(c.triggerAt)}`}
          />
          <AnalysisPanel
            key="gatilho-7-11"
            eyebrow="Análise 21 · Gatilho 7 ↔ 11"
            title="GATILHO 7 ↔ 11"
            subtitle="Gatilho: sequências [7 -> 11] ou [11 -> 7]. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho 7↔11 registrado recentemente."
            cycles={a7_11Cycles}
            pedra={711}
            now={now}
            detailFormatter={(c) => `7↔11 às ${fmtTime(c.triggerAt)}`}
          />
        </>
      )}

      {/* 4. SEÇÃO DE SOMAS CONSECUTIVAS */}
      {showSums && (
        <>
          <AnalysisPanel
            key="soma-17"
            eyebrow="Análise 14 · Soma 17 Consecutiva"
            title="SOMA 17"
            subtitle="Gatilho: duas pedras consecutivas somando 17. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de soma 17 registrado recentemente."
            cycles={aSoma17Cycles}
            pedra={17}
            now={now}
            detailFormatter={(c) => `Soma 17 às ${fmtTime(c.triggerAt)}`}
          />
          <AnalysisPanel
            key="soma-19"
            eyebrow="Análise 15 · Soma 19 Consecutiva"
            title="SOMA 19"
            subtitle="Gatilho: duas pedras consecutivas somando 19. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de soma 19 registrado recentemente."
            cycles={aSoma19Cycles}
            pedra={19}
            now={now}
            detailFormatter={(c) => `Soma 19 às ${fmtTime(c.triggerAt)}`}
          />
          <AnalysisPanel
            key="soma-21"
            eyebrow="Análise 16 · Soma 21 Consecutiva"
            title="SOMA 21"
            subtitle="Gatilho: duas pedras consecutivas somando 21. Analisa até 14 tempos de Branco."
            loading={loading}
            err={err}
            emptyLabel="Nenhum gatilho de soma 21 registrado recentemente."
            cycles={aSoma21Cycles}
            pedra={21}
            now={now}
            detailFormatter={(c) => `Soma 21 às ${fmtTime(c.triggerAt)}`}
          />
        </>
      )}
    </main>
  );
}

export { AnaliseSection };
