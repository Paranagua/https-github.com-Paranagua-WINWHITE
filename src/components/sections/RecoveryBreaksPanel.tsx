import { useMemo, useState } from "react";
import {
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Flame,
  LayoutGrid,
  RotateCcw,
  Search,
  ShieldCheck,
  Table as TableIcon,
} from "lucide-react";
import { Card } from "@/components/double/Card";
import { computeTop, isValidCycle, type Cycle as EngineCycle } from "@/lib/predictive";
import { sanitizeMonotonicGaps } from "@/lib/cyclePersistence";
import { parseUtcDate } from "@/lib/utils";

const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const MAX_ZEROS = 14;
const MAX_DETAIL_ROWS = 6;
const TOP_N = 3;

function diffMinutes(a: Date, b: Date) {
  const minA = Math.floor(a.getTime() / 60000);
  const minB = Math.floor(b.getTime() / 60000);
  return Math.max(0, minB - minA);
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

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "--:--";
  const date = d instanceof Date ? d : parseUtcDate(d);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface RecoveryBreaksPanelProps {
  cyclesMap: Record<number, EngineCycle[]>;
  selectedPedra: number;
  now: Date;
  loading: boolean;
  err: string | null;
}

// 55 Análises: Giros 26 ao 80 (A60 ao A114)
const RECOVERY_SPINS = Array.from({ length: 55 }, (_, i) => {
  const spin = 26 + i;
  const analysisId = 60 + i;
  return {
    spin,
    analysisId,
    code: `A${analysisId}`,
    name: `Quebra de Recuperação (Giro ${spin})`,
  };
});

const SPIN_RANGES = [
  { label: "Todos (26 a 80)", min: 26, max: 80 },
  { label: "26 a 35", min: 26, max: 35 },
  { label: "36 a 45", min: 36, max: 45 },
  { label: "46 a 55", min: 46, max: 55 },
  { label: "56 a 65", min: 56, max: 65 },
  { label: "66 a 80", min: 66, max: 80 },
];

export function RecoveryBreaksPanel({
  cyclesMap,
  selectedPedra,
  now,
  loading,
  err,
}: RecoveryBreaksPanelProps) {
  const [selectedSpin, setSelectedSpin] = useState<number>(26);
  const [activeRange, setActiveRange] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [viewMode, setViewMode] = useState<"detail" | "overview">("detail");
  const [showAllCycles, setShowAllCycles] = useState<boolean>(false);

  const selectedAnalysisId = 60 + (selectedSpin - 26);
  const selectedMeta = useMemo(() => {
    return (
      RECOVERY_SPINS.find((s) => s.spin === selectedSpin) || {
        spin: selectedSpin,
        analysisId: selectedAnalysisId,
        code: `A${selectedAnalysisId}`,
        name: `Quebra de Recuperação (Giro ${selectedSpin})`,
      }
    );
  }, [selectedSpin, selectedAnalysisId]);

  // Ciclos da análise selecionada para a pedra selecionada (ou ciclos com valor 0 do Branco)
  const allStoneCycles = useMemo(() => {
    const rawList = cyclesMap[selectedAnalysisId] || [];
    return rawList
      .filter((c) => c.value === selectedPedra || (selectedPedra !== 0 && c.value === 0))
      .map((c) => ({
        ...c,
        gaps: sanitizeMonotonicGaps(c.gaps),
      }));
  }, [cyclesMap, selectedAnalysisId, selectedPedra]);

  // Gatilho aberto ativo (o mais recente se tiver menos de 14 brancos)
  const openCycle = useMemo(() => {
    if (!allStoneCycles.length) return null;
    const latest = allStoneCycles[allStoneCycles.length - 1];
    return latest.gaps.length < MAX_ZEROS ? latest : null;
  }, [allStoneCycles]);

  // Ciclos anteriores válidos (não são o aberto atual e já possuem gaps)
  const pastValidCycles = useMemo(() => {
    return allStoneCycles.filter((c) => c !== openCycle && isValidCycle(c));
  }, [allStoneCycles, openCycle]);

  // Regra de elegibilidade para Quebra de Recuperação: mínimo 3 ciclos anteriores válidos
  const isEligible = pastValidCycles.length >= 3;

  // Base estatística: 3 ciclos passados válidos mais recentes (slice(-3))
  const calculationBase = useMemo(() => {
    if (!isEligible) return [];
    return pastValidCycles.slice(-3);
  }, [isEligible, pastValidCycles]);

  const baseSet = useMemo(() => new Set(calculationBase), [calculationBase]);

  // Top 3 Tempos Recorrentes
  const topRows = useMemo(() => {
    if (!isEligible || calculationBase.length === 0) return [];
    return computeTop(calculationBase, TOP_N);
  }, [isEligible, calculationBase]);

  // Ciclos exibidos na tabela detalhada
  const displayedCycles = useMemo(() => {
    if (showAllCycles) return allStoneCycles;
    return allStoneCycles.slice(-MAX_DETAIL_ROWS);
  }, [allStoneCycles, showAllCycles]);

  // Filtragem de giros pelo range e busca
  const filteredSpins = useMemo(() => {
    const range = SPIN_RANGES[activeRange];
    let list = RECOVERY_SPINS.filter((s) => s.spin >= range.min && s.spin <= range.max);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.spin.toString().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeRange, searchTerm]);

  // Estatísticas resumidas de cada giro para a pedra atual (ou ciclos de quebra com valor 0)
  const overviewStats = useMemo(() => {
    return RECOVERY_SPINS.map((item) => {
      const list = (cyclesMap[item.analysisId] || []).filter(
        (c) => c.value === selectedPedra || (selectedPedra !== 0 && c.value === 0),
      );
      const open = list.length > 0 && list[list.length - 1].gaps.length < MAX_ZEROS;
      const valid = list.filter((c) => isValidCycle(c) && (!open || c !== list[list.length - 1]));
      const top = valid.length >= 3 ? computeTop(valid.slice(-3), 1) : [];
      return {
        ...item,
        totalCycles: list.length,
        validCycles: valid.length,
        hasOpenTrigger: open,
        isEligible: valid.length >= 3,
        top1Time: top[0]?.label || (top[0]?.m !== undefined ? `${top[0].m}` : null),
        top1Percent: top[0]?.pct !== undefined ? Number(top[0].pct.toFixed(1)) : null,
      };
    });
  }, [cyclesMap, selectedPedra]);

  const handlePrevSpin = () => {
    if (selectedSpin > 26) {
      setSelectedSpin(selectedSpin - 1);
    }
  };

  const handleNextSpin = () => {
    if (selectedSpin < 80) {
      setSelectedSpin(selectedSpin + 1);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Cabeçalho Principal do Módulo de Quebra de Recuperação */}
      <Card className="glass-card p-6 border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-rose-400 font-outfit">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Análises Preditivas Q · A60 a A114</span>
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight text-white font-outfit mt-1">
              Quebra de Recuperação (Giros 26 ao 80)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ativação no Branco (0) quando ocorrem entre 26 e 80 giros sem Branco entre dois
              brancos. Cada quantidade (26 a 80) corresponde a uma análise exclusiva (A60 a A114).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-300">
              <Flame className="h-3.5 w-3.5" />
              <span>55 Análises Independentes</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Regra Mínima: 3 Ciclos Válidos</span>
            </span>
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("detail")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  viewMode === "detail"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span>Painel do Giro</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("overview")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  viewMode === "overview"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Visão Geral (55 Giros)</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Barra de Navegação e Filtros de Giro */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Abas de Faixas de Giros */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
                Faixa:
              </span>
              {SPIN_RANGES.map((rg, idx) => (
                <button
                  key={rg.label}
                  type="button"
                  onClick={() => setActiveRange(idx)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    activeRange === idx
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08] hover:text-white border border-white/5"
                  }`}
                >
                  {rg.label}
                </button>
              ))}
            </div>

            {/* Busca Rápida de Giro/Análise + Navegação Anterior/Próximo */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Giro (ex: 30) ou A..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-36 sm:w-44 rounded-lg border border-white/10 bg-black/40 pl-8 pr-2.5 py-1 text-xs text-white placeholder:text-muted-foreground/60 focus:border-rose-500/60 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handlePrevSpin}
                disabled={selectedSpin <= 26}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                title="Giro Anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Ant.</span>
              </button>
              <button
                type="button"
                onClick={handleNextSpin}
                disabled={selectedSpin >= 80}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                title="Próximo Giro"
              >
                <span className="hidden sm:inline">Próx.</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Grid Interativo de Seleção dos Giros */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-11 gap-1.5 max-h-48 overflow-y-auto p-1 rounded-xl border border-white/5 bg-black/20">
            {filteredSpins.map((item) => {
              const cyclesForStone = (cyclesMap[item.analysisId] || []).filter(
                (c) => c.value === selectedPedra || (selectedPedra !== 0 && c.value === 0),
              );
              const isOpen =
                cyclesForStone.length > 0 &&
                cyclesForStone[cyclesForStone.length - 1].gaps.length < MAX_ZEROS;
              const isSel = selectedSpin === item.spin;

              return (
                <button
                  key={item.spin}
                  type="button"
                  onClick={() => setSelectedSpin(item.spin)}
                  className={`flex flex-col items-center justify-between rounded-lg p-2 text-center transition-all relative ${
                    isSel
                      ? "border-rose-500/70 bg-rose-500/20 text-white shadow-[0_0_15px_rgba(244,63,94,0.25)] border"
                      : "border border-white/5 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[9px] font-black uppercase text-rose-400 font-mono">
                      {item.code}
                    </span>
                    {isOpen && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse"
                        title="Gatilho aberto ativo"
                      />
                    )}
                  </div>
                  <span className="text-xs font-black text-white mt-0.5 font-outfit">
                    Giro {item.spin}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground mt-0.5">
                    {cyclesForStone.length} c.
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 3. VISÃO DETALHADA DA ANÁLISE SELECIONADA */}
      {viewMode === "detail" && (
        <Card className="glass-card p-6 border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-400 font-outfit">
                  Análise {selectedAnalysisId} · {selectedMeta.code}
                </span>
                {isEligible ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Ativa ({calculationBase.length} ciclos base)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-400">
                    <AlertCircle className="h-2.5 w-2.5" />
                    Bloqueada ({pastValidCycles.length}/3 ciclos válidos)
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black text-white sm:text-2xl font-outfit uppercase tracking-tighter mt-0.5">
                QUEBRA DE RECUPERAÇÃO · GIRO {selectedSpin} (A{selectedAnalysisId})
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Gatilho ativado no Branco ⚪ após {selectedSpin} giros sem Branco entre dois
                brancos. Analisa até 14 tempos de Branco subsequentes.
              </p>
            </div>

            <div className="flex flex-col items-end gap-1 text-xs font-bold text-muted-foreground">
              <span className="text-white font-mono">
                {displayedCycles.length} de {allStoneCycles.length} ciclos totais
              </span>
              <span className="text-[10px] text-muted-foreground/80 font-mono">
                {pastValidCycles.length} ciclos anteriores válidos registrados
              </span>
              {openCycle && (
                <span className="rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black text-rose-300 animate-pulse">
                  Gatilho Aberto Ativo ({openCycle.gaps.length}/14 Brancos)
                </span>
              )}
            </div>
          </div>

          {/* Top 3 Tempos Recorrentes */}
          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-rose-400" />
                <span className="text-xs font-black uppercase tracking-wider text-white font-outfit">
                  Top 3 Tempos Recorrentes (Base: 3 Ciclos Mais Recentes)
                </span>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground font-mono">
                {isEligible
                  ? `Calculado sobre ${calculationBase.length} ciclos válidos`
                  : "Mínimo de 3 ciclos anteriores necessários"}
              </span>
            </div>

            {topRows.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Aguardando 3 ciclos anteriores válidos para cálculo estatístico dos Top Tempos.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {topRows.map((t, idx) => {
                  const isTop1 = idx === 0;
                  const qualifiesTop1 = isTop1 && t.pct >= 80;
                  const qualifiesTop23 = !isTop1 && t.pct >= 75;

                  return (
                    <div
                      key={`top-group-${idx}-${t.m}`}
                      className={`rounded-xl border p-3 flex items-center justify-between transition-all ${
                        qualifiesTop1
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : qualifiesTop23
                            ? "border-primary/40 bg-primary/10"
                            : "border-white/10 bg-white/[0.02]"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          Top {idx + 1}
                        </div>
                        <div className="text-xl font-black text-white font-outfit">
                          {t.label || t.m}{" "}
                          <span className="text-xs font-normal text-muted-foreground">min</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black font-mono text-white">
                          {t.pct.toFixed(1)}%
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {t.count} de {calculationBase.length} ciclos
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tabela de Ciclos Registrados */}
          <div className="mt-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-white font-outfit">
                Registro de Ciclos Recentes — Pedra {selectedPedra} ({allStoneCycles.length})
              </h4>
              {allStoneCycles.length > MAX_DETAIL_ROWS && (
                <button
                  type="button"
                  onClick={() => setShowAllCycles(!showAllCycles)}
                  className="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
                >
                  {showAllCycles
                    ? `Mostrar apenas últimos ${MAX_DETAIL_ROWS}`
                    : `Ver todos os ${allStoneCycles.length} ciclos`}
                </button>
              )}
            </div>

            {loading && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Carregando ciclos da análise...
              </div>
            )}

            {err && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
                {err}
              </div>
            )}

            {!loading && !err && displayedCycles.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Nenhum ciclo da Análise {selectedAnalysisId} (Giro {selectedSpin}) registrado para a
                pedra {selectedPedra} até o momento.
              </div>
            )}

            {!loading && !err && displayedCycles.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 font-bold">Data / Gatilho</th>
                      <th className="pb-2 font-bold">Detalhe</th>
                      <th className="pb-2 font-bold">Latência até Brancos (min)</th>
                      <th className="pb-2 text-right font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {displayedCycles.map((c, i) => {
                      const dt = c.triggerAt;
                      const isOpen = c === openCycle;
                      const inBase = baseSet.has(c);
                      const elapsed = diffMinutes(dt, now);
                      const pending = Math.max(0, MAX_ZEROS - c.gaps.length);
                      const dtMs = dt instanceof Date ? dt.getTime() : new Date(dt).getTime();
                      const rowKey = `cycle-${c.value}-${dtMs}-${i}`;

                      return (
                        <tr
                          key={rowKey}
                          className={`transition-colors ${
                            isOpen
                              ? "bg-rose-500/[0.08] border-l-2 border-rose-500"
                              : inBase
                                ? "hover:bg-white/[0.04] bg-white/[0.01]"
                                : "hover:bg-white/[0.02] opacity-75"
                          }`}
                        >
                          <td className="py-2.5 font-mono font-bold text-white flex items-center gap-1.5 whitespace-nowrap">
                            {fmtDateTime(dt)}
                            {isOpen && (
                              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black text-rose-300 animate-pulse">
                                GATILHO ABERTO
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-muted-foreground whitespace-nowrap">
                            {`Giro ${selectedSpin} (ant. ${c.value}) às ${fmtTime(dt)}`}
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap items-center gap-1">
                              {c.gaps.map((g, gIdx) => (
                                <span
                                  key={`gap-${rowKey}-${gIdx}-${g}`}
                                  className="inline-flex items-center justify-center min-w-[24px] px-1 py-0.5 rounded bg-white/10 text-[10px] font-mono font-bold text-white"
                                  title={`Branco #${gIdx + 1}: ${g} min após gatilho`}
                                >
                                  {g}
                                </span>
                              ))}
                              {pending > 0 && (
                                <span className="text-[10px] text-muted-foreground/60 font-mono italic">
                                  +{pending} pendentes
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-mono">
                            {isOpen ? (
                              <span className="text-[10px] font-bold text-rose-400">
                                {elapsed} min atrás
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-bold ${
                                  inBase ? "text-emerald-400" : "text-muted-foreground"
                                }`}
                              >
                                {inBase ? "Na Base (3)" : "Histórico"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 4. VISÃO GERAL DE TODAS AS 55 ANÁLISES */}
      {viewMode === "overview" && (
        <Card className="glass-card p-6 border-white/10">
          <div className="border-b border-white/10 pb-4 mb-4">
            <h4 className="text-sm font-black uppercase tracking-wider text-white font-outfit">
              Tabela Comparativa das 55 Análises — Pedra {selectedPedra}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique em qualquer linha para inspecionar os detalhes e ciclos completos daquele giro.
            </p>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0B0F17] border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground z-10">
                <tr>
                  <th className="pb-2 font-bold">Código</th>
                  <th className="pb-2 font-bold">Giro Gatilho</th>
                  <th className="pb-2 font-bold">Ciclos Totais (P.{selectedPedra})</th>
                  <th className="pb-2 font-bold">Ciclos Válidos</th>
                  <th className="pb-2 font-bold">Top 1 Tempo</th>
                  <th className="pb-2 font-bold">Status</th>
                  <th className="pb-2 text-right font-bold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {overviewStats.map((st) => {
                  const isSelected = selectedSpin === st.spin;

                  return (
                    <tr
                      key={`overview-spin-${st.spin}-${st.analysisId}`}
                      onClick={() => {
                        setSelectedSpin(st.spin);
                        setViewMode("detail");
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-rose-500/15 text-white"
                          : "hover:bg-white/[0.03] text-muted-foreground"
                      }`}
                    >
                      <td className="py-2 font-mono font-bold text-rose-400">{st.code}</td>
                      <td className="py-2 font-bold text-white">Giro {st.spin}</td>
                      <td className="py-2 font-mono text-white">{st.totalCycles}</td>
                      <td className="py-2 font-mono">{st.validCycles}</td>
                      <td className="py-2 font-mono">
                        {st.top1Time !== null ? (
                          <span className="text-emerald-400 font-bold">
                            {st.top1Time} min ({st.top1Percent}%)
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2">
                        {st.hasOpenTrigger ? (
                          <span className="rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 text-[9px] font-black uppercase animate-pulse">
                            Gatilho Aberto
                          </span>
                        ) : st.isEligible ? (
                          <span className="rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-black uppercase">
                            Ativa
                          </span>
                        ) : (
                          <span className="rounded bg-white/5 text-muted-foreground border border-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                            Bloqueada
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <span className="text-[11px] font-bold text-rose-400 hover:text-rose-300">
                          Consultar →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
