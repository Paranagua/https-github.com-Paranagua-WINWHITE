import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { colorOf, type Color } from "@/components/double/types";
import {
  buildA2,
  buildASandwichPontas,
  buildASandwichMeio,
  buildA8_11,
  buildA11_11,
  buildA4_11,
  buildA4_14,
  buildA7_11,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  computeTop,
  isValidCycle,
  type Cycle,
  type Row,
} from "@/lib/predictive";
import { detectColorPatternBreaksById, colorBreaksToCycles } from "@/lib/colorPatternBreaks";
import type { SignalHistoryEntry, AnalysisStat } from "@/lib/signalStatsStore";
import {
  ShieldCheck,
  AlertCircle,
  Clock,
  TrendingUp,
  Layers,
  CheckCircle2,
  XCircle,
  Activity,
  ChevronRight,
  Filter,
} from "lucide-react";

export interface PrimaryAnalysisInfo {
  key: string;
  analysisId: number;
  name: string;
  shortLabel: string;
  category: "pedras" | "sequencia" | "somas" | "cores";
  categoryLabel: string;
  badge: string;
  description: string;
  assertividade: number | null;
  wins: number;
  losses: number;
  total: number;
}

export interface StoneStatItem {
  stone: number;
  color: Color;
  // Auditoria dos Sinais Reais
  wins: number;
  losses: number;
  totalSignals: number;
  assertividadeSignals: number | null;
  // Motor Preditivo de Ciclos
  totalCycles: number;
  validCycles: number;
  isEligible: boolean;
  top1Pct: number | null;
  top1Minute: number | null;
  top2Pct: number | null;
  top3Pct: number | null;
  status: "elegivel" | "confluencia" | "baixa" | "bloqueada";
}

interface AnalysisStonesModalProps {
  analysis: PrimaryAnalysisInfo | null;
  isOpen: boolean;
  onClose: () => void;
  rows: Row[];
  recentSignals: SignalHistoryEntry[];
  stats: Record<string, AnalysisStat>;
}

function getCyclesForAnalysis(key: string, id: number, rows: Row[]): Cycle[] {
  if (!rows || rows.length === 0) return [];
  try {
    switch (key) {
      case "A2":
        return buildA2(rows);
      case "A19":
        return buildASandwichPontas(rows);
      case "A20":
        return buildASandwichMeio(rows);
      case "A10":
        return buildA8_11(rows);
      case "A11":
        return buildA11_11(rows);
      case "A12":
        return buildA4_11(rows);
      case "A13":
        return buildA4_14(rows);
      case "A21":
        return buildA7_11(rows);
      case "A14":
        return buildASoma17(rows);
      case "A15":
        return buildASoma19(rows);
      case "A16":
        return buildASoma21(rows);
      case "Q1":
        return colorBreaksToCycles(detectColorPatternBreaksById(rows, "alternados"), rows);
      case "Q2":
        return colorBreaksToCycles(detectColorPatternBreaksById(rows, "alt_continuos_2x2"), rows);
      case "Q3":
        return colorBreaksToCycles(detectColorPatternBreaksById(rows, "alt_continuos_1n"), rows);
      case "Q4":
        return colorBreaksToCycles(detectColorPatternBreaksById(rows, "alt_continuos_2n"), rows);
      case "Q5":
        return colorBreaksToCycles(detectColorPatternBreaksById(rows, "continuos_5x"), rows);
      case "Q6":
        return colorBreaksToCycles(detectColorPatternBreaksById(rows, "continuos_n1"), rows);
      case "Q7":
        return colorBreaksToCycles(detectColorPatternBreaksById(rows, "continuos_n2"), rows);
      default:
        if (id === 2) return buildA2(rows);
        if (id === 19) return buildASandwichPontas(rows);
        if (id === 20) return buildASandwichMeio(rows);
        if (id >= 50 && id <= 56) {
          const map: Record<number, string> = {
            50: "alternados",
            51: "alt_continuos_2x2",
            52: "alt_continuos_1n",
            53: "alt_continuos_2n",
            54: "continuos_5x",
            55: "continuos_n1",
            56: "continuos_n2",
          };
          return colorBreaksToCycles(
            detectColorPatternBreaksById(rows, map[id] || "alternados"),
            rows,
          );
        }
        return [];
    }
  } catch (err) {
    console.error("[AnalysisStonesModal] Erro ao calcular ciclos:", err);
    return [];
  }
}

export function AnalysisStonesModal({
  analysis,
  isOpen,
  onClose,
  rows,
  recentSignals,
  stats,
}: AnalysisStonesModalProps) {
  const [filterMode, setFilterMode] = useState<
    "todas" | "sinais" | "elegiveis" | "branco" | "vermelho" | "preto"
  >("todas");

  // Calcula os dados de cada uma das 15 pedras (0 a 14)
  const stoneStats: StoneStatItem[] = useMemo(() => {
    if (!analysis) return [];

    const { key, analysisId } = analysis;

    // 1. Constrói contagem de auditoria por pedra a partir dos sinais reais
    const countsByStone: Record<number, { wins: number; losses: number }> = {};
    for (let i = 0; i <= 14; i++) {
      countsByStone[i] = { wins: 0, losses: 0 };
    }

    recentSignals.forEach((sig) => {
      if (sig.outcome !== "green" && sig.outcome !== "red") return;
      if (
        (sig as any).isNoConfluence ||
        sig.category === "no_confluence" ||
        (sig.confluence && sig.confluence.includes("Sem Confluência"))
      ) {
        return;
      }
      const isWin = sig.outcome === "green";

      let matchedStone: number | null = null;

      // Busca na lista de fontes (sources)
      if (Array.isArray(sig.sources) && sig.sources.length > 0) {
        const src = sig.sources.find((s: any) => {
          if (!s) return false;
          if (s.analysis === analysisId) return true;
          if (key.startsWith("A") && s.analysis === parseInt(key.slice(1), 10)) return true;
          if (key.startsWith("Q") && s.analysis === parseInt(key.slice(1), 10) + 49) return true;
          return false;
        });
        if (src && typeof src.value === "number" && src.value >= 0 && src.value <= 14) {
          matchedStone = src.value;
        }
      }

      // Fallback via strategyKey
      if (
        matchedStone === null &&
        (sig.strategyKey === key || sig.strategyKey === `A${analysisId}`)
      ) {
        if (typeof (sig as any).primaryStone === "number") {
          matchedStone = (sig as any).primaryStone;
        }
      }

      if (matchedStone !== null && matchedStone >= 0 && matchedStone <= 14) {
        if (isWin) countsByStone[matchedStone].wins += 1;
        else countsByStone[matchedStone].losses += 1;
      }
    });

    // Mescla com estatísticas persistentes
    for (let val = 0; val <= 14; val++) {
      const s1 = stats[`${key}_${val}`];
      const s2 = stats[`A${analysisId}_${val}`];
      const storeWins = Math.max(s1?.green || 0, s2?.green || 0);
      const storeLosses = Math.max(s1?.red || 0, s2?.red || 0);
      countsByStone[val].wins = Math.max(countsByStone[val].wins, storeWins);
      countsByStone[val].losses = Math.max(countsByStone[val].losses, storeLosses);
    }

    // 2. Calcula ciclos preditivos em tempo real para esta estratégia
    const cycles = getCyclesForAnalysis(key, analysisId, rows);

    // Agrupa ciclos por valor da pedra
    const cyclesByVal = new Map<number, Cycle[]>();
    for (let val = 0; val <= 14; val++) {
      cyclesByVal.set(val, []);
    }
    cycles.forEach((c) => {
      if (c.value >= 0 && c.value <= 14) {
        cyclesByVal.get(c.value)?.push(c);
      }
    });

    // 3. Monta o item estatístico consolidado para cada pedra
    const items: StoneStatItem[] = [];
    for (let val = 0; val <= 14; val++) {
      const cList = cyclesByVal.get(val) || [];
      const totalCycles = cList.length;

      const openCycle =
        totalCycles > 0 && cList[totalCycles - 1].gaps.length < 14 ? cList[totalCycles - 1] : null;
      const pastValid = cList.filter((c) => c !== openCycle && isValidCycle(c));
      const validCycles = pastValid.length;
      const isEligible = validCycles >= 4;

      let top1Pct: number | null = null;
      let top1Minute: number | null = null;
      let top2Pct: number | null = null;
      let top3Pct: number | null = null;
      let status: StoneStatItem["status"] = "bloqueada";

      if (isEligible) {
        const calculationBase = pastValid.slice(-5);
        const topGroups = computeTop(calculationBase, 3);
        if (topGroups.length > 0) {
          const t1 = topGroups[0];
          top1Pct = t1.pct;
          let m = t1.m;
          if (["A17", "A18"].includes(key)) m += 1;
          top1Minute = m;

          if (topGroups[1]) top2Pct = topGroups[1].pct;
          if (topGroups[2]) top3Pct = topGroups[2].pct;

          if (t1.pct >= 80 && t1.pct <= 100) {
            status = "elegivel";
          } else if (t1.pct >= 75 && t1.pct <= 79.99) {
            status = "confluencia";
          } else {
            status = "baixa";
          }
        } else {
          status = "baixa";
        }
      } else {
        status = "bloqueada";
      }

      const wins = countsByStone[val].wins;
      const losses = countsByStone[val].losses;
      const totalSignals = wins + losses;
      const assertividadeSignals = totalSignals > 0 ? (wins / totalSignals) * 100 : null;

      items.push({
        stone: val,
        color: colorOf(val),
        wins,
        losses,
        totalSignals,
        assertividadeSignals,
        totalCycles,
        validCycles,
        isEligible,
        top1Pct,
        top1Minute,
        top2Pct,
        top3Pct,
        status,
      });
    }

    return items;
  }, [analysis, rows, recentSignals, stats]);

  // Filtragem das pedras exibidas
  const filteredStones = useMemo(() => {
    return stoneStats.filter((item) => {
      if (filterMode === "sinais") return item.totalSignals > 0;
      if (filterMode === "elegiveis") return item.status === "elegivel";
      if (filterMode === "branco") return item.stone === 0;
      if (filterMode === "vermelho") return item.color === "red";
      if (filterMode === "preto") return item.color === "black";
      return true;
    });
  }, [stoneStats, filterMode]);

  if (!analysis) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-[#0c0d12] border-white/10 text-white shadow-2xl">
        {/* Cabeçalho do Modal */}
        <DialogHeader className="p-6 pb-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${analysis.badge}`}
                >
                  {analysis.categoryLabel}
                </span>
                <span className="text-xs font-mono font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                  {analysis.shortLabel}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Assertividade das 14 Pedras & Branco (0 a 14)
                </span>
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-black font-outfit text-white tracking-tight">
                {analysis.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {analysis.description} • Auditoria de sinais enviados e percentual preditivo por
                pedra
              </DialogDescription>
            </div>

            {/* Resumo Global da Análise */}
            <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2">
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  Assertividade Geral
                </span>
                <span
                  className={`text-xl font-black font-outfit ${
                    analysis.assertividade !== null && analysis.assertividade >= 70
                      ? "text-emerald-400"
                      : analysis.assertividade !== null && analysis.assertividade >= 50
                        ? "text-amber-400"
                        : analysis.assertividade !== null
                          ? "text-red-400"
                          : "text-zinc-500"
                  }`}
                >
                  {analysis.assertividade !== null ? `${analysis.assertividade.toFixed(1)}%` : "--"}
                </span>
              </div>
              <div className="h-8 w-[1px] bg-white/10" />
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                  Sinais Enviados
                </span>
                <div className="flex items-center gap-1.5 text-xs font-bold font-mono">
                  <span className="text-white">{analysis.total}</span>
                  <span className="text-[10px] text-emerald-400 font-bold">({analysis.wins}W</span>
                  <span className="text-[10px] text-red-400 font-bold">{analysis.losses}L)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de Filtros das Pedras */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-2 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterMode("todas")}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  filterMode === "todas"
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                Todas as 15 Pedras (0-14)
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("sinais")}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  filterMode === "sinais"
                    ? "bg-primary text-white shadow-sm"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                Com Sinais Enviados ({stoneStats.filter((s) => s.totalSignals > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("elegiveis")}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  filterMode === "elegiveis"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-emerald-400/60 hover:text-emerald-300 hover:bg-emerald-500/10"
                }`}
              >
                Top 1 Elegíveis 80-100% ({stoneStats.filter((s) => s.status === "elegivel").length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("branco")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  filterMode === "branco"
                    ? "bg-white text-zinc-950 font-black shadow-sm"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-white border border-zinc-400" />
                Branco (0)
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("vermelho")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  filterMode === "vermelho"
                    ? "bg-red-500 text-white font-black shadow-sm"
                    : "text-red-400/70 hover:text-red-300 hover:bg-red-500/10"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Vermelhos (1-7)
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("preto")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  filterMode === "preto"
                    ? "bg-zinc-700 text-white font-black shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-zinc-800 border border-white/40" />
                Pretos (8-14)
              </button>
            </div>

            <span className="text-[10px] text-muted-foreground font-mono">
              Exibindo {filteredStones.length} de 15 pedras
            </span>
          </div>
        </DialogHeader>

        {/* Corpo do Modal: Grid de Pedras */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {filteredStones.map((item) => {
              const hasSignals = item.totalSignals > 0;
              const winRate = item.assertividadeSignals !== null ? item.assertividadeSignals : 0;

              return (
                <div
                  key={item.stone}
                  className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                    item.status === "elegivel"
                      ? "bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-500/50"
                      : item.status === "confluencia"
                        ? "bg-amber-950/15 border-amber-500/30 hover:border-amber-500/50"
                        : "bg-white/[0.02] border-white/5 hover:border-white/15"
                  }`}
                >
                  <div>
                    {/* Topo do Card da Pedra */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      {/* Emblema da Pedra da Roleta */}
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-black font-outfit text-sm select-none shadow-md ${
                            item.stone === 0
                              ? "bg-white text-zinc-950 shadow-[0_0_12px_rgba(255,255,255,0.4)] border border-white"
                              : item.color === "red"
                                ? "bg-red-600 text-white shadow-[0_0_10px_rgba(220,38,38,0.35)]"
                                : "bg-zinc-800 text-white border border-white/20 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                          }`}
                        >
                          {item.stone}
                        </div>
                        <div>
                          <span className="text-xs font-black text-white block leading-tight">
                            Pedra {item.stone}
                          </span>
                          <span className="text-[9px] uppercase font-bold text-muted-foreground block">
                            {item.stone === 0
                              ? "Branco (14x)"
                              : item.color === "red"
                                ? "Vermelho (2x)"
                                : "Preto (2x)"}
                          </span>
                        </div>
                      </div>

                      {/* Status de Elegibilidade */}
                      <span
                        className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          item.status === "elegivel"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : item.status === "confluencia"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : item.status === "baixa"
                                ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                                : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                      >
                        {item.status === "elegivel"
                          ? "Top 1 Primário"
                          : item.status === "confluencia"
                            ? "Confluência"
                            : item.status === "baixa"
                              ? "Abaixo 75%"
                              : "Bloqueada"}
                      </span>
                    </div>

                    {/* Bloco 1: Auditoria de Sinais Reais Enviados */}
                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 mb-3">
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                        <span>Sinais Enviados</span>
                        <span className="text-white font-mono font-bold">
                          {item.totalSignals} {item.totalSignals === 1 ? "sinal" : "sinais"}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between mb-1.5">
                        <span
                          className={`text-xl font-black font-outfit ${
                            hasSignals
                              ? winRate >= 70
                                ? "text-emerald-400"
                                : winRate >= 50
                                  ? "text-amber-400"
                                  : "text-red-400"
                              : "text-zinc-600 font-normal"
                          }`}
                        >
                          {item.assertividadeSignals !== null
                            ? `${item.assertividadeSignals.toFixed(1)}%`
                            : "--"}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono">
                          <span
                            className={
                              item.wins > 0 ? "text-emerald-400 font-black" : "text-zinc-600"
                            }
                          >
                            {item.wins}W
                          </span>
                          <span
                            className={
                              item.losses > 0 ? "text-red-400 font-black" : "text-zinc-600"
                            }
                          >
                            {item.losses}L
                          </span>
                        </div>
                      </div>

                      {/* Barra de assertividade dos sinais */}
                      {hasSignals ? (
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${winRate}%` }}
                            className="h-full bg-emerald-500 rounded-full"
                          />
                          <div
                            style={{ width: `${100 - winRate}%` }}
                            className="h-full bg-red-500/80 rounded-full"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-1 bg-white/5 rounded-full" />
                      )}
                    </div>

                    {/* Bloco 2: Motor Preditivo (Top 1 e Ciclos da Pedra) */}
                    <div className="space-y-1.5 text-[10px] pt-1">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Top 1 Preditivo:</span>
                        <span
                          className={`font-mono font-bold ${
                            item.top1Pct !== null && item.top1Pct >= 80
                              ? "text-emerald-400"
                              : item.top1Pct !== null && item.top1Pct >= 75
                                ? "text-amber-400"
                                : item.top1Pct !== null
                                  ? "text-white/60"
                                  : "text-zinc-600"
                          }`}
                        >
                          {item.top1Pct !== null ? `${item.top1Pct.toFixed(1)}%` : "--"}
                          {item.top1Minute !== null && (
                            <span className="text-[9px] text-muted-foreground ml-1">
                              (+{item.top1Minute}m)
                            </span>
                          )}
                        </span>
                      </div>

                      {item.top2Pct !== null && (
                        <div className="flex items-center justify-between text-muted-foreground/80 text-[9px]">
                          <span>Top 2 / Top 3:</span>
                          <span className="font-mono text-white/50">
                            {item.top2Pct.toFixed(1)}%
                            {item.top3Pct !== null && ` · ${item.top3Pct.toFixed(1)}%`}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-muted-foreground/80 text-[9px]">
                        <span>Ciclos Válidos:</span>
                        <span
                          className={`font-mono ${
                            item.isEligible ? "text-emerald-400/80 font-bold" : "text-amber-400/80"
                          }`}
                        >
                          {item.validCycles} ciclos {item.isEligible ? "(Apto)" : "(Mín. 4)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card da Pedra */}
                  <div className="pt-2 mt-2.5 border-t border-white/5 flex items-center justify-between text-[9px] text-muted-foreground">
                    <span>Total histórico:</span>
                    <span className="font-mono text-white/70 font-bold">
                      {item.totalCycles} ciclos
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredStones.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-xs">
              Nenhuma pedra corresponde ao filtro selecionado.
            </div>
          )}
        </div>

        {/* Rodapé explicativo */}
        <div className="p-4 border-t border-white/10 bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Top 1 Primário (80% a 100%): Envia sinais</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Confluência (75% a 79%): Validação Top 2/3</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-600" />
              <span>Mínimo de 4 ciclos válidos prévios</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg font-bold text-xs transition-colors"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
