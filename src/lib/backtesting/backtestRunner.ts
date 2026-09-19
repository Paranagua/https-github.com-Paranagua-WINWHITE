/**
 * Motor de execução de Backtesting Temporal sem Look-Ahead Bias.
 *
 * Princípios inegociáveis:
 * 1. Cada análise é comparada separadamente.
 * 2. Ciclos de análises diferentes nunca são misturados.
 * 3. O histórico para prever o Ciclo k é estritamente anterior a k (índices 0..k-1).
 * 4. O próprio ciclo avaliado nunca entra em seu histórico.
 * 5. Nenhum ciclo futuro é consultado.
 * 6. Respeita a identidade unívoca e ordem cronológica estrita dos ciclos.
 * 7. Utiliza a regra oficial de validação do projeto (janela [M-1, M, M+1] para WIN).
 */

import { computeTop, type Cycle as EngineCycle } from "@/lib/predictive";
import { computeAnalysisTendency } from "@/lib/tendencias";
import {
  type BacktestModelName,
  type CycleGapsRecord,
  type CyclePredictionEvaluation,
  type ModelPerformanceStats,
  type GlobalModelSummary,
  type BacktestComparisonResult,
} from "./backtestTypes";
import { computeTop3Experimental } from "./top3Backtest";

export interface RunBacktestOptions {
  /**
   * Limite de ciclos a avaliar por análise (opcional, default: todos os disponíveis)
   */
  maxCyclesPerAnalysis?: number;
  /**
   * Limiar de assertividade para Modelo B Top 3 (default: 80, o que exige 3/3 com 3 ciclos)
   */
  top3MinPct?: number;
}

/**
 * Converte um registro de ciclo de volta para o formato esperado por computeTop e computeAnalysisTendency.
 */
function toEngineCycle(record: CycleGapsRecord): EngineCycle {
  return {
    value: record.value,
    analysis: record.analysis,
    triggerAt: record.triggerAt,
    gaps: [...record.gaps],
    isSecondary: false,
  };
}

/**
 * Avalia se um gap previsto acertou o ciclo real de acordo com a regra oficial de validação.
 *
 * Regra oficial: janela de 3 minutos [m-1, m, m+1] a partir do gatilho.
 */
function evaluatePredictionAgainstCycle(
  predictedGap: number,
  targetCycle: CycleGapsRecord,
): { outcome: "WIN" | "LOSS" | "PENDING"; winType: "EXACT" | "WINDOW_TOLERANCE" | "NONE" } {
  const actualGaps = (targetCycle.gaps || []).filter(
    (g) => typeof g === "number" && !Number.isNaN(g) && g > 0,
  );

  const windowGaps = [predictedGap - 1, predictedGap, predictedGap + 1].filter((g) => g > 0);

  const hasExactHit = actualGaps.includes(predictedGap);
  const hasWindowHit = actualGaps.some((g) => windowGaps.includes(g));

  if (hasWindowHit) {
    return {
      outcome: "WIN",
      winType: hasExactHit ? "EXACT" : "WINDOW_TOLERANCE",
    };
  }

  // Se o ciclo já concluiu ou teve timeout e nenhum branco caiu na janela, é LOSS
  if (targetCycle.status === "concluido" || targetCycle.status === "timeout") {
    return {
      outcome: "LOSS",
      winType: "NONE",
    };
  }

  // Se o ciclo tem algum gap maior que o final da janela (predictedGap + 1), sabemos que a janela passou sem branco
  const maxRecordedGap = actualGaps.length > 0 ? Math.max(...actualGaps) : 0;
  if (maxRecordedGap > predictedGap + 1) {
    return {
      outcome: "LOSS",
      winType: "NONE",
    };
  }

  return {
    outcome: "PENDING",
    winType: "NONE",
  };
}

/**
 * Executa a comparação entre os três modelos para uma única série temporal de ciclos de uma análise.
 */
export function runSingleAnalysisBacktest(
  analysis: number,
  analysisCode: string,
  rawCycles: CycleGapsRecord[],
  options: RunBacktestOptions = {},
): {
  statsTopAtual: ModelPerformanceStats;
  statsTop3: ModelPerformanceStats;
  statsTendencia: ModelPerformanceStats;
  evaluations: CyclePredictionEvaluation[];
} {
  const minPctTop3 = options.top3MinPct ?? 80;

  // 1. Filtrar e ordenar cronologicamente de forma estrita (sem look-ahead)
  const validCycles = rawCycles
    .filter(
      (c) =>
        c && c.analysis === analysis && c.triggerAt && Array.isArray(c.gaps) && c.gaps.length > 0,
    )
    .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());

  const cyclesToProcess = options.maxCyclesPerAnalysis
    ? validCycles.slice(0, options.maxCyclesPerAnalysis)
    : validCycles;

  const isColorBreak = analysis >= 50 && analysis <= 56;
  const isRecoveryBreak = analysis >= 60 && analysis <= 114;
  const minPastTopAtual = isColorBreak || isRecoveryBreak ? 3 : 4;
  const slicePastTopAtual = isColorBreak || isRecoveryBreak ? 3 : 5;

  const evaluations: CyclePredictionEvaluation[] = [];

  const createInitialStats = (model: BacktestModelName): ModelPerformanceStats => ({
    analysis,
    analysisCode,
    model,
    totalCyclesAvailable: cyclesToProcess.length,
    cyclesEvaluated: 0,
    cyclesDiscardedLackHistory: 0,
    predictionsCount: 0,
    winCount: 0,
    lossCount: 0,
    pendingCount: 0,
    exactWinCount: 0,
    toleranceWinCount: 0,
    winRate: 0,
    exactWinRate: 0,
    predictionsByGap: {},
    actualGapFrequency: {},
    hourlyStats: {},
  });

  const statsA = createInitialStats("Top Atual");
  const statsB = createInitialStats("Top 3 Experimental");
  const statsC = createInitialStats("Tendência Atual");

  // Agrupa ciclos por valor da pedra (já que os ciclos de cada pedra formam a série temporal independente)
  const cyclesByValue = new Map<number, CycleGapsRecord[]>();
  for (const c of cyclesToProcess) {
    if (!cyclesByValue.has(c.value)) cyclesByValue.set(c.value, []);
    cyclesByValue.get(c.value)!.push(c);
  }

  // Itera por cada valor de pedra da análise
  for (const [, stoneCycles] of cyclesByValue.entries()) {
    // Ordena rigorosamente por triggerAt ASC
    stoneCycles.sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());

    for (let i = 0; i < stoneCycles.length; i++) {
      const targetCycle = stoneCycles[i];
      const hour = targetCycle.triggerAt.getHours();

      // Computa frequência real de gaps para registro
      for (const g of targetCycle.gaps) {
        if (typeof g === "number" && g > 0) {
          statsA.actualGapFrequency[g] = (statsA.actualGapFrequency[g] || 0) + 1;
          statsB.actualGapFrequency[g] = (statsB.actualGapFrequency[g] || 0) + 1;
          statsC.actualGapFrequency[g] = (statsC.actualGapFrequency[g] || 0) + 1;
        }
      }

      // HISTÓRICO ESTRITAMENTE PASSADO (índices 0 até i - 1)
      const pastCycles = stoneCycles.slice(0, i);

      // ----------------------------------------------------
      // MODELO A: TOP ATUAL
      // ----------------------------------------------------
      statsA.cyclesEvaluated++;
      if (pastCycles.length < minPastTopAtual) {
        statsA.cyclesDiscardedLackHistory++;
      } else {
        const histA = pastCycles.slice(-slicePastTopAtual);
        const engineHistA = histA.map(toEngineCycle);
        const candidatesA = computeTop(engineHistA, 1);
        const top1A = candidatesA.length > 0 ? candidatesA[0] : null;

        if (top1A && top1A.pct >= 80 && top1A.pct <= 100) {
          let predictedGap = top1A.m;
          // Ajuste de +1 min específico de produção para A17 e A18
          if ([17, 18].includes(analysis)) predictedGap += 1;

          const evalResult = evaluatePredictionAgainstCycle(predictedGap, targetCycle);

          statsA.predictionsCount++;
          statsA.predictionsByGap[predictedGap] = (statsA.predictionsByGap[predictedGap] || 0) + 1;

          if (!statsA.hourlyStats[hour]) {
            statsA.hourlyStats[hour] = { predictions: 0, wins: 0, losses: 0, winRate: 0 };
          }
          statsA.hourlyStats[hour].predictions++;

          if (evalResult.outcome === "WIN") {
            statsA.winCount++;
            statsA.hourlyStats[hour].wins++;
            if (evalResult.winType === "EXACT") statsA.exactWinCount++;
            else statsA.toleranceWinCount++;
          } else if (evalResult.outcome === "LOSS") {
            statsA.lossCount++;
            statsA.hourlyStats[hour].losses++;
          } else {
            statsA.pendingCount++;
          }

          evaluations.push({
            cycleKey: targetCycle.cycleKey,
            analysis,
            analysisCode,
            value: targetCycle.value,
            triggerAt: targetCycle.triggerAt,
            model: "Top Atual",
            cyclesUsedCount: histA.length,
            pastCycleKeys: histA.map((c) => c.cycleKey),
            predictedGap,
            predictedDate: new Date(targetCycle.triggerAt.getTime() + predictedGap * 60_000),
            pct: top1A.pct,
            outcome: evalResult.outcome,
            winType: evalResult.winType,
            actualGaps: [...targetCycle.gaps],
            firstWhiteGap: targetCycle.firstWhiteGap,
            directHits: top1A.directHits,
          });
        }
      }

      // ----------------------------------------------------
      // MODELO B: TOP 3 EXPERIMENTAL
      // ----------------------------------------------------
      statsB.cyclesEvaluated++;
      if (pastCycles.length < 3) {
        statsB.cyclesDiscardedLackHistory++;
      } else {
        const histB = pastCycles.slice(-3);
        const top3Res = computeTop3Experimental(histB);
        const top1B = top3Res.top1;

        if (top1B && top1B.pct >= minPctTop3) {
          const predictedGap = top1B.m; // Sem acréscimo de +1 automático

          const evalResult = evaluatePredictionAgainstCycle(predictedGap, targetCycle);

          statsB.predictionsCount++;
          statsB.predictionsByGap[predictedGap] = (statsB.predictionsByGap[predictedGap] || 0) + 1;

          if (!statsB.hourlyStats[hour]) {
            statsB.hourlyStats[hour] = { predictions: 0, wins: 0, losses: 0, winRate: 0 };
          }
          statsB.hourlyStats[hour].predictions++;

          if (evalResult.outcome === "WIN") {
            statsB.winCount++;
            statsB.hourlyStats[hour].wins++;
            if (evalResult.winType === "EXACT") statsB.exactWinCount++;
            else statsB.toleranceWinCount++;
          } else if (evalResult.outcome === "LOSS") {
            statsB.lossCount++;
            statsB.hourlyStats[hour].losses++;
          } else {
            statsB.pendingCount++;
          }

          evaluations.push({
            cycleKey: targetCycle.cycleKey,
            analysis,
            analysisCode,
            value: targetCycle.value,
            triggerAt: targetCycle.triggerAt,
            model: "Top 3 Experimental",
            cyclesUsedCount: 3,
            pastCycleKeys: histB.map((c) => c.cycleKey),
            predictedGap,
            predictedDate: new Date(targetCycle.triggerAt.getTime() + predictedGap * 60_000),
            pct: top1B.pct,
            outcome: evalResult.outcome,
            winType: evalResult.winType,
            actualGaps: [...targetCycle.gaps],
            firstWhiteGap: targetCycle.firstWhiteGap,
            directHits: top1B.directHits,
          });
        }
      }

      // ----------------------------------------------------
      // MODELO C: TENDÊNCIA ATUAL
      // ----------------------------------------------------
      statsC.cyclesEvaluated++;
      if (pastCycles.length < 3) {
        statsC.cyclesDiscardedLackHistory++;
      } else {
        const histC = pastCycles.slice(-3);
        const engineHistC = histC.map(toEngineCycle);
        const tendencyResult = computeAnalysisTendency(engineHistC, targetCycle.triggerAt);

        // Regra de produção de Tendência: considera o sinal principal quando ratio === "3/3" (pct === 100)
        if (
          tendencyResult.hasTendency &&
          tendencyResult.tendency &&
          tendencyResult.tendency.ratio === "3/3"
        ) {
          const t = tendencyResult.tendency;
          let predictedGap = t.gap;
          if ([17, 18].includes(analysis)) predictedGap += 1;

          const evalResult = evaluatePredictionAgainstCycle(predictedGap, targetCycle);

          statsC.predictionsCount++;
          statsC.predictionsByGap[predictedGap] = (statsC.predictionsByGap[predictedGap] || 0) + 1;

          if (!statsC.hourlyStats[hour]) {
            statsC.hourlyStats[hour] = { predictions: 0, wins: 0, losses: 0, winRate: 0 };
          }
          statsC.hourlyStats[hour].predictions++;

          if (evalResult.outcome === "WIN") {
            statsC.winCount++;
            statsC.hourlyStats[hour].wins++;
            if (evalResult.winType === "EXACT") statsC.exactWinCount++;
            else statsC.toleranceWinCount++;
          } else if (evalResult.outcome === "LOSS") {
            statsC.lossCount++;
            statsC.hourlyStats[hour].losses++;
          } else {
            statsC.pendingCount++;
          }

          evaluations.push({
            cycleKey: targetCycle.cycleKey,
            analysis,
            analysisCode,
            value: targetCycle.value,
            triggerAt: targetCycle.triggerAt,
            model: "Tendência Atual",
            cyclesUsedCount: 3,
            pastCycleKeys: histC.map((c) => c.cycleKey),
            predictedGap,
            predictedDate: new Date(targetCycle.triggerAt.getTime() + predictedGap * 60_000),
            pct: t.pct,
            outcome: evalResult.outcome,
            winType: evalResult.winType,
            actualGaps: [...targetCycle.gaps],
            firstWhiteGap: targetCycle.firstWhiteGap,
            directHits: t.directHits,
            ratioLabel: t.ratio,
          });
        }
      }
    }
  }

  // Finaliza taxas
  const finalizeStats = (st: ModelPerformanceStats) => {
    const decided = st.winCount + st.lossCount;
    st.winRate = decided > 0 ? Number(((st.winCount / decided) * 100).toFixed(2)) : 0;
    st.exactWinRate = decided > 0 ? Number(((st.exactWinCount / decided) * 100).toFixed(2)) : 0;
    Object.keys(st.hourlyStats).forEach((hStr) => {
      const h = Number(hStr);
      const hDecided = st.hourlyStats[h].wins + st.hourlyStats[h].losses;
      st.hourlyStats[h].winRate =
        hDecided > 0 ? Number(((st.hourlyStats[h].wins / hDecided) * 100).toFixed(2)) : 0;
    });
  };

  finalizeStats(statsA);
  finalizeStats(statsB);
  finalizeStats(statsC);

  return {
    statsTopAtual: statsA,
    statsTop3: statsB,
    statsTendencia: statsC,
    evaluations,
  };
}

/**
 * Constrói o sumário comparativo global de todos os modelos avaliados.
 */
export function buildGlobalSummary(allStats: ModelPerformanceStats[]): GlobalModelSummary[] {
  const models: BacktestModelName[] = ["Top Atual", "Top 3 Experimental", "Tendência Atual"];

  return models.map((modelName) => {
    const statsForModel = allStats.filter((s) => s.model === modelName);
    const totalAnalyses = statsForModel.length;
    const totalCyclesAvailable = statsForModel.reduce((acc, s) => acc + s.totalCyclesAvailable, 0);
    const totalEvaluated = statsForModel.reduce((acc, s) => acc + s.cyclesEvaluated, 0);
    const totalPredictions = statsForModel.reduce((acc, s) => acc + s.predictionsCount, 0);
    const totalWins = statsForModel.reduce((acc, s) => acc + s.winCount, 0);
    const totalLosses = statsForModel.reduce((acc, s) => acc + s.lossCount, 0);
    const totalExactWins = statsForModel.reduce((acc, s) => acc + s.exactWinCount, 0);

    const decided = totalWins + totalLosses;
    const winRate = decided > 0 ? Number(((totalWins / decided) * 100).toFixed(2)) : 0;
    const exactWinRate = decided > 0 ? Number(((totalExactWins / decided) * 100).toFixed(2)) : 0;
    const coverageRate =
      totalEvaluated > 0 ? Number(((totalPredictions / totalEvaluated) * 100).toFixed(2)) : 0;

    return {
      model: modelName,
      totalAnalyses,
      totalCyclesAvailable,
      totalPredictions,
      totalWins,
      totalLosses,
      totalExactWins,
      winRate,
      exactWinRate,
      coverageRate,
    };
  });
}
