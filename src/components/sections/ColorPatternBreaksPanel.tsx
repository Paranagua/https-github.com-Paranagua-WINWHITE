import { useMemo, useState } from "react";
import {
  COLOR_PATTERNS,
  detectAllColorPatternBreaks,
  colorBreaksToCycles,
  type ColorPatternType,
  type ColorBreakResult,
  type PatternColor,
  getColorLabelPt,
} from "@/lib/colorPatternBreaks";
import { Card } from "@/components/double/Card";
import {
  Sparkles,
  ShieldCheck,
  Clock,
  Shuffle,
  Layers,
  ChevronRight,
  Info,
  Table as TableIcon,
  LayoutGrid,
  AlertCircle,
} from "lucide-react";
import { fmtTime } from "@/components/double/types";
import { computeTop, isValidCycle, MAX_ZEROS, type Row } from "@/lib/predictive";

interface ColorPatternBreaksPanelProps {
  rows: Row[];
  selectedPedra: number;
  now: Date;
}

export function ColorPatternBreaksPanel({
  rows,
  selectedPedra,
  now,
}: ColorPatternBreaksPanelProps) {
  const [activePattern, setActivePattern] = useState<ColorPatternType>("alternados");

  // Detecção completa dos 7 padrões
  const allBreaks = useMemo(() => {
    return detectAllColorPatternBreaks(rows);
  }, [rows]);

  const activeBreaks = useMemo(() => {
    return allBreaks[activePattern] || [];
  }, [allBreaks, activePattern]);

  const patternDef = useMemo(() => {
    return COLOR_PATTERNS.find((p) => p.id === activePattern) || COLOR_PATTERNS[0];
  }, [activePattern]);

  // Quebras do padrão ativo filtradas estritamente pela pedra selecionada que fez a quebra
  const breaksForSelectedStone = useMemo(() => {
    return activeBreaks.filter((b) => b.breakStone.roll === selectedPedra);
  }, [activeBreaks, selectedPedra]);

  // Estatísticas de quebras do padrão ativo
  const patternStats = useMemo(() => {
    let byWhite = 0;
    let byRed = 0;
    let byBlack = 0;
    activeBreaks.forEach((b) => {
      if (b.breakStone.color === "white" || b.breakStone.roll === 0) byWhite++;
      else if (b.breakStone.color === "red") byRed++;
      else if (b.breakStone.color === "black") byBlack++;
    });
    return {
      total: activeBreaks.length,
      stoneTotal: breaksForSelectedStone.length,
      byWhite,
      byRed,
      byBlack,
    };
  }, [activeBreaks, breaksForSelectedStone.length]);

  const [cycleViewMode, setCycleViewMode] = useState<"table" | "cards">("table");
  const [showAllCycles, setShowAllCycles] = useState(false);

  // Ciclos convertidos para a pedra selecionada
  const cyclesForStone = useMemo(() => {
    const allCycles = colorBreaksToCycles(activeBreaks, rows);
    return allCycles.filter((c) => c.value === selectedPedra);
  }, [activeBreaks, rows, selectedPedra]);

  const pastValidCycles = useMemo(() => {
    return cyclesForStone.filter((c) => isValidCycle(c));
  }, [cyclesForStone]);

  const validCyclesCount = pastValidCycles.length;
  const isEligible5Cycles = validCyclesCount >= 5;

  const calculationBase = useMemo(() => {
    if (validCyclesCount < 4) return [];
    return pastValidCycles.slice(-5);
  }, [validCyclesCount, pastValidCycles]);

  const topRows = useMemo(() => {
    if (calculationBase.length === 0) return [];
    return computeTop(calculationBase, 3);
  }, [calculationBase]);

  const displayedCycles = useMemo(() => {
    if (showAllCycles) return cyclesForStone;
    return cyclesForStone.slice(-6);
  }, [cyclesForStone, showAllCycles]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo */}
      <Card className="glass-card p-6 border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary font-outfit">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Nova Análise Independente</span>
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight text-white font-outfit mt-1">
              Quebra de Padrões de Cores
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identificação algorítmica de quebras com regra mínima de 6 casas e quebra automática
              pelo Branco (0).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Mínimo 6 Casas</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-muted-foreground">
              <span>⚪ 0 Quebra Tudo</span>
            </span>
          </div>
        </div>

        {/* Sub-abas dos 7 Padrões */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {COLOR_PATTERNS.map((pat) => {
            const list = allBreaks[pat.id] || [];
            const countForStone = list.filter((b) => b.breakStone.roll === selectedPedra).length;
            const isSel = activePattern === pat.id;
            return (
              <button
                key={pat.id}
                type="button"
                onClick={() => setActivePattern(pat.id)}
                className={`flex flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-all ${
                  isSel
                    ? "border-primary/60 bg-primary/20 text-white shadow-[0_0_15px_rgba(59,130,246,0.25)]"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  A{pat.analysisId}
                </span>
                <span className="text-xs font-bold text-white leading-tight mt-1 line-clamp-1">
                  {pat.shortName}
                </span>
                <span className="mt-2 text-[10px] font-black px-1.5 py-0.5 rounded bg-black/40 text-primary border border-primary/20">
                  {countForStone} {countForStone === 1 ? "quebra" : "quebras"} (P.{selectedPedra})
                </span>
              </button>
            );
          })}
        </div>

        {/* Detalhes do Padrão Ativo */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-white/5 bg-black/30 p-4">
          <div className="md:col-span-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{patternDef.name}</span>
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                {patternDef.categoryName}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{patternDef.description}</p>
          </div>

          <div className="flex items-center justify-end gap-2 text-xs flex-wrap">
            <div className="text-center px-3 py-1 rounded-lg bg-primary/10 border border-primary/20">
              <div className="text-[10px] text-primary font-bold">Pedra {selectedPedra}</div>
              <div className="text-sm font-black text-white">{patternStats.stoneTotal}</div>
            </div>
            <div className="text-center px-3 py-1 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="text-[10px] text-muted-foreground">Total Geral</div>
              <div className="text-sm font-black text-white">{patternStats.total}</div>
            </div>
            <div className="text-center px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-[10px] text-red-400">🔴 V</div>
              <div className="text-sm font-black text-red-300">{patternStats.byRed}</div>
            </div>
            <div className="text-center px-3 py-1 rounded-lg bg-zinc-500/10 border border-zinc-500/20">
              <div className="text-[10px] text-zinc-400">⚫ P</div>
              <div className="text-sm font-black text-zinc-300">{patternStats.byBlack}</div>
            </div>
            <div className="text-center px-3 py-1 rounded-lg bg-white/10 border border-white/20">
              <div className="text-[10px] text-white">⚪ 0</div>
              <div className="text-sm font-black text-white">{patternStats.byWhite}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabela de Quebras Recentes Registradas — Filtradas pela Pedra Selecionada */}
      <Card className="glass-card p-6 border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-black uppercase tracking-wider text-white font-outfit">
              Registro de Quebras — Pedra {selectedPedra} ({breaksForSelectedStone.length})
            </h4>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Exibindo apenas ocorrências em que a pedra {selectedPedra} foi a responsável pela quebra
          </span>
        </div>

        {breaksForSelectedStone.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            Nenhuma quebra feita pela pedra {selectedPedra} registrada para o padrão{" "}
            {patternDef.name}.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="pb-2 pl-2">Horário</th>
                  <th className="pb-2">Casas</th>
                  <th className="pb-2">Sequência Analisada</th>
                  <th className="pb-2">Cor Esperada</th>
                  <th className="pb-2 text-center">Pedra da Quebra</th>
                  <th className="pb-2 pr-2 text-right">Ação / Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {breaksForSelectedStone
                  .slice(-20)
                  .reverse()
                  .map((b, idx) => {
                    const isWhite = b.breakStone.color === "white" || b.breakStone.roll === 0;
                    const isRed = b.breakStone.color === "red";
                    const isBlack = b.breakStone.color === "black";

                    return (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 pl-2 font-mono text-muted-foreground whitespace-nowrap">
                          {fmtTime(b.breakStone.date)}
                        </td>
                        <td className="py-2.5 font-bold text-white/70">{b.sequenceLength} casas</td>
                        <td className="py-2.5 font-mono text-xs">
                          <div className="flex items-center gap-1 flex-wrap">
                            {b.sequence.map((item, sIdx) => {
                              const itemColor = item.color;
                              const isBreak = item.isBreakStone;
                              let badgeBg = "bg-white/5 text-white/70";
                              if (itemColor === "red")
                                badgeBg = isBreak
                                  ? "bg-red-500 text-white font-black shadow-sm ring-1 ring-white/50"
                                  : "bg-red-500/20 text-red-300";
                              else if (itemColor === "black")
                                badgeBg = isBreak
                                  ? "bg-zinc-800 text-white font-black shadow-sm ring-1 ring-white/50"
                                  : "bg-zinc-800/40 text-zinc-300";
                              else if (itemColor === "white")
                                badgeBg = "bg-white text-black font-black ring-2 ring-white/80";

                              return (
                                <span
                                  key={sIdx}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeBg}`}
                                  title={`Pedra: ${item.roll}`}
                                >
                                  {isBreak
                                    ? item.roll === 0
                                      ? "0"
                                      : `${itemColor === "red" ? "V" : "P"}(${item.roll})`
                                    : itemColor === "red"
                                      ? "V"
                                      : itemColor === "black"
                                        ? "P"
                                        : "0"}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              b.expectedColor === "red"
                                ? "bg-red-500/20 text-red-300"
                                : b.expectedColor === "black"
                                  ? "bg-zinc-500/20 text-zinc-300"
                                  : "bg-white/20 text-white"
                            }`}
                          >
                            {getColorLabelPt(b.expectedColor)}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-full font-black text-xs ${
                              isWhite
                                ? "bg-white text-black ring-2 ring-white"
                                : isRed
                                  ? "bg-red-500 text-white"
                                  : "bg-zinc-800 text-white border border-white/20"
                            }`}
                          >
                            {b.breakStone.roll}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-right">
                          {isWhite ? (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                              Quebra por Branco (0)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                              Quebra Normal
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
      </Card>

      {/* Card de Integração: Ciclos de Latência para a Pedra Selecionada */}
      <Card className="glass-card p-6 border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-primary font-outfit">
              Integração de Metodologia de Ciclos
            </div>
            <h4 className="text-base font-black uppercase tracking-tight text-white font-outfit mt-0.5">
              Latência até o Branco — Pedra {selectedPedra} ({patternDef.name})
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exibição integral de até 14 resultados de latência de brancos alcançados por quebra
              efetuada pela pedra {selectedPedra}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[11px] font-bold ${
                isEligible5Cycles
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>
                {isEligible5Cycles
                  ? `Apto (${validCyclesCount}/5 Ciclos)`
                  : `Em Maturação (${validCyclesCount}/5 Ciclos)`}
              </span>
            </span>

            {/* Alternância Tabela / Cards */}
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setCycleViewMode("table")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                  cycleViewMode === "table"
                    ? "bg-primary text-black shadow-sm"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                <TableIcon className="h-3 w-3" />
                <span>Tabela</span>
              </button>
              <button
                type="button"
                onClick={() => setCycleViewMode("cards")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                  cycleViewMode === "cards"
                    ? "bg-primary text-black shadow-sm"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                <span>Cards</span>
              </button>
            </div>

            {cyclesForStone.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllCycles((prev) => !prev)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-white/10 hover:text-white"
              >
                {showAllCycles ? "Mostrar Últimos 10" : `Ver Todos (${cyclesForStone.length})`}
              </button>
            )}
          </div>
        </div>

        {cyclesForStone.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Nenhuma quebra registrada onde a pedra responsável tenha sido o número {selectedPedra}.
            Selecione outro número no catálogo acima.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Lista ou Tabela de Ciclos */}
            <div
              className={`overflow-x-auto ${topRows.length > 0 ? "lg:col-span-8" : "lg:col-span-12"}`}
            >
              {cycleViewMode === "table" ? (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 font-bold w-12">Ciclo</th>
                      <th className="pb-2 font-bold w-20">Gatilho</th>
                      <th className="pb-2 font-bold">Latência até Brancos (Todos os Resultados)</th>
                      <th className="pb-2 text-right font-bold w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {displayedCycles.map((c, cIdx) => {
                      const isComplete = c.gaps.length >= 14;
                      return (
                        <tr key={cIdx} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 font-mono text-muted-foreground font-bold">
                            #{cIdx + 1}
                          </td>
                          <td className="py-2.5 font-mono font-bold text-white">
                            {fmtTime(c.triggerAt)}
                          </td>
                          <td className="py-2.5">
                            {c.gaps.length === 0 ? (
                              <span className="text-[10px] text-amber-300 font-medium animate-pulse">
                                Aguardando 1º branco (T0)...
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {c.gaps.map((g, gIdx) => (
                                  <span
                                    key={gIdx}
                                    title={`${gIdx + 1}º Branco alcançado (+${g} min)`}
                                    className="inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white border border-white/10"
                                  >
                                    <span className="text-[8px] text-muted-foreground mr-1 font-sans font-normal">
                                      {gIdx + 1}º
                                    </span>
                                    +{g}m
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-mono text-[10px]">
                            {isComplete ? (
                              <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                                Completo (14/14)
                              </span>
                            ) : (
                              <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                                {c.gaps.length}/14 Brancos
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {displayedCycles.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-3.5 rounded-xl border border-white/10 bg-black/40 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">Ciclo #{cIdx + 1}</span>
                        <span className="font-mono text-muted-foreground text-[11px]">
                          {fmtTime(c.triggerAt)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>Brancos alcançados:</span>
                        <span
                          className={`font-bold ${
                            c.gaps.length >= 14 ? "text-emerald-400" : "text-white"
                          }`}
                        >
                          {c.gaps.length} de 14
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap pt-1">
                        {c.gaps.length === 0 ? (
                          <span className="text-[10px] text-amber-300 font-medium animate-pulse">
                            Aguardando 1º branco...
                          </span>
                        ) : (
                          c.gaps.map((g, gIdx) => (
                            <span
                              key={gIdx}
                              title={`${gIdx + 1}º Branco alcançado (+${g} min)`}
                              className="inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/90 border border-white/10"
                            >
                              <span className="text-[8px] text-muted-foreground mr-1 font-sans">
                                {gIdx + 1}º
                              </span>
                              +{g}min
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top 3 Tempos Recorrentes (se houver base estatística) */}
            {topRows.length > 0 && (
              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4 lg:col-span-4">
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                      Top Tempos Recorrentes
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground font-mono">
                      {calculationBase.length} ciclos base
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {topRows.map((r, i) => {
                      const rankBadgeColors = [
                        "text-amber-300 border-amber-500/30 bg-amber-500/15",
                        "text-slate-200 border-slate-400/30 bg-slate-400/15",
                        "text-amber-600 border-amber-700/30 bg-amber-700/15",
                      ];
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
                                  rankBadgeColors[i] ||
                                  "text-primary border-primary/30 bg-primary/10"
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
                            <span className="font-mono text-xs font-black text-white">
                              {r.pct.toFixed(0)}%
                            </span>
                          </div>

                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, r.pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-muted-foreground border-t border-white/5 pt-2">
                  Calculado sobre as latências até o branco após a quebra efetuada pela pedra{" "}
                  {selectedPedra}.
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
