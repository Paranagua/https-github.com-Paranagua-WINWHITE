/**
 * Motor de Execução do SEGUNDO LABORATÓRIO — OTIMIZAÇÃO E ROBUSTEZ DO MOTOR TOP.
 *
 * Princípios Científicos:
 * 1. Isolamento Absoluto de Produção: Execução restrita a este laboratório.
 * 2. Sem Look-Ahead Bias: Momento T utiliza estritamente o histórico de ciclos concluídos até T-1.
 * 3. Mesma Matemática Oficial: Vizinhança [m-1, m, m+1], desempates e regras existentes.
 * 4. Modelos Avaliados:
 *    - TOP-2 (janela de 2 ciclos)
 *    - TOP-3 (janela de 3 ciclos)
 *    - TOP-4 (janela de 4 ciclos)
 *    - TOP-5 (janela de 5 ciclos)
 *    - TOP-6 (janela de 6 ciclos)
 *    - TOP-3 Consistência 3/3 (presença obrigatória nos 3 ciclos)
 *    - TOP-3 Consistência 2/3 (presença em 2 dos 3 ciclos)
 *    - TOP-3 Preferência Exata (presença nos 3 ciclos com directHits >= 1)
 *    - Tendência Benchmark (3/3 da Tendência para fins de benchmark comparativo)
 */

import { computeAnalysisTendency } from "@/lib/tendencias";
import type { Cycle as EngineCycle } from "@/lib/predictive";
import type {
  BacktestModelName,
  CycleGapsRecord,
  CyclePredictionEvaluation,
  ModelPerformanceStats,
  GlobalModelSummary,
  ModelStabilityStats,
  IntersectionStats,
  ConfluenceStats,
  SampleSizeCategory,
} from "./backtestTypes";
import { computeTopWindow, type WindowSize } from "./windowBacktest";
import { computeTop3Consistency } from "./consistencyBacktest";
import {
  computeModelStability,
  computeTopTendencyIntersection,
  computeConfluenceAnalysis,
  categorizeSampleSize,
} from "./robustnessBacktest";

function toEngineCycle(record: CycleGapsRecord): EngineCycle {
  return {
    value: record.value,
    analysis: record.analysis,
    triggerAt: record.triggerAt,
    gaps: [...record.gaps],
    isSecondary: false,
  };
}

export function evaluatePredictionAgainstCycle(
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

  if (targetCycle.status === "concluido" || targetCycle.status === "timeout") {
    return {
      outcome: "LOSS",
      winType: "NONE",
    };
  }

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

export interface Lab2AnalysisResult {
  analysis: number;
  analysisCode: string;
  sampleSize: SampleSizeCategory;
  totalCyclesAvailable: number;
  modelStats: Record<BacktestModelName, ModelPerformanceStats>;
  stabilityStats: Record<BacktestModelName, ModelStabilityStats>;
  intersection: IntersectionStats;
  evaluations: CyclePredictionEvaluation[];
}

export function runLab2AnalysisBacktest(
  analysis: number,
  analysisCode: string,
  rawCycles: CycleGapsRecord[],
): Lab2AnalysisResult {
  const validCycles = rawCycles
    .filter(
      (c) =>
        c && c.analysis === analysis && c.triggerAt && Array.isArray(c.gaps) && c.gaps.length > 0,
    )
    .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());

  const sampleSize = categorizeSampleSize(validCycles.length);

  const models: BacktestModelName[] = [
    "TOP-2",
    "TOP-3",
    "TOP-4",
    "TOP-5",
    "TOP-6",
    "TOP-3 Consistência 3/3",
    "TOP-3 Consistência 2/3",
    "TOP-3 Preferência Exata",
    "Tendência Benchmark",
  ];

  const createInitialStats = (model: BacktestModelName): ModelPerformanceStats => ({
    analysis,
    analysisCode,
    model,
    totalCyclesAvailable: validCycles.length,
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

  const modelStatsMap: Record<string, ModelPerformanceStats> = {};
  for (const m of models) {
    modelStatsMap[m] = createInitialStats(m);
  }

  const evaluations: CyclePredictionEvaluation[] = [];

  // Agrupa ciclos estritamente por pedra (cada pedra forma sua série temporal cronológica)
  const cyclesByValue = new Map<number, CycleGapsRecord[]>();
  for (const c of validCycles) {
    if (!cyclesByValue.has(c.value)) cyclesByValue.set(c.value, []);
    cyclesByValue.get(c.value)!.push(c);
  }

  for (const [, stoneCycles] of cyclesByValue.entries()) {
    stoneCycles.sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());

    for (let i = 0; i < stoneCycles.length; i++) {
      const targetCycle = stoneCycles[i];
      const hour = targetCycle.triggerAt.getHours();

      // Histórico estritamente anterior (índices 0 até i - 1)
      const pastCycles = stoneCycles.slice(0, i);

      // ----------------------------------------------------
      // MODELOS DE JANELA: TOP-2, TOP-3, TOP-4, TOP-5, TOP-6
      // ----------------------------------------------------
      const windowSizes: WindowSize[] = [2, 3, 4, 5, 6];
      for (const w of windowSizes) {
        const modelName: BacktestModelName = `TOP-${w}` as BacktestModelName;
        const st = modelStatsMap[modelName];
        st.cyclesEvaluated++;

        if (pastCycles.length < w) {
          st.cyclesDiscardedLackHistory++;
          continue;
        }

        const winRes = computeTopWindow(pastCycles, w, analysis, 80);
        if (winRes.eligible && winRes.predictedGap !== null && winRes.top1) {
          const predictedGap = winRes.predictedGap;
          const evalResult = evaluatePredictionAgainstCycle(predictedGap, targetCycle);

          st.predictionsCount++;
          st.predictionsByGap[predictedGap] = (st.predictionsByGap[predictedGap] || 0) + 1;

          if (!st.hourlyStats[hour]) {
            st.hourlyStats[hour] = { predictions: 0, wins: 0, losses: 0, winRate: 0 };
          }
          st.hourlyStats[hour].predictions++;

          if (evalResult.outcome === "WIN") {
            st.winCount++;
            st.hourlyStats[hour].wins++;
            if (evalResult.winType === "EXACT") st.exactWinCount++;
            else st.toleranceWinCount++;
          } else if (evalResult.outcome === "LOSS") {
            st.lossCount++;
            st.hourlyStats[hour].losses++;
          } else {
            st.pendingCount++;
          }

          evaluations.push({
            cycleKey: targetCycle.cycleKey,
            analysis,
            analysisCode,
            value: targetCycle.value,
            triggerAt: targetCycle.triggerAt,
            model: modelName,
            cyclesUsedCount: w,
            pastCycleKeys: pastCycles.slice(-w).map((c) => c.cycleKey),
            predictedGap,
            predictedDate: new Date(targetCycle.triggerAt.getTime() + predictedGap * 60_000),
            pct: winRes.top1.pct,
            outcome: evalResult.outcome,
            winType: evalResult.winType,
            actualGaps: [...targetCycle.gaps],
            firstWhiteGap: targetCycle.firstWhiteGap,
            directHits: winRes.top1.directHits,
          });
        }
      }

      // ----------------------------------------------------
      // MODELOS DE CONSISTÊNCIA BASEADOS EM 3 CICLOS
      // ----------------------------------------------------
      const consistencyModels: Array<{
        name: BacktestModelName;
        gapKey: "predictedGapB" | "predictedGapC" | "predictedGapD";
        candKey: "modelB_Consistency33" | "modelC_Consistency23" | "modelD_ExactPreference";
      }> = [
        {
          name: "TOP-3 Consistência 3/3",
          gapKey: "predictedGapB",
          candKey: "modelB_Consistency33",
        },
        {
          name: "TOP-3 Consistência 2/3",
          gapKey: "predictedGapC",
          candKey: "modelC_Consistency23",
        },
        {
          name: "TOP-3 Preferência Exata",
          gapKey: "predictedGapD",
          candKey: "modelD_ExactPreference",
        },
      ];

      if (pastCycles.length >= 3) {
        const consistencyRes = computeTop3Consistency(pastCycles, analysis);

        for (const cm of consistencyModels) {
          const st = modelStatsMap[cm.name];
          st.cyclesEvaluated++;

          const predGap = consistencyRes[cm.gapKey];
          const cand = consistencyRes[cm.candKey];

          if (predGap !== null && cand) {
            const evalResult = evaluatePredictionAgainstCycle(predGap, targetCycle);

            st.predictionsCount++;
            st.predictionsByGap[predGap] = (st.predictionsByGap[predGap] || 0) + 1;

            if (!st.hourlyStats[hour]) {
              st.hourlyStats[hour] = { predictions: 0, wins: 0, losses: 0, winRate: 0 };
            }
            st.hourlyStats[hour].predictions++;

            if (evalResult.outcome === "WIN") {
              st.winCount++;
              st.hourlyStats[hour].wins++;
              if (evalResult.winType === "EXACT") st.exactWinCount++;
              else st.toleranceWinCount++;
            } else if (evalResult.outcome === "LOSS") {
              st.lossCount++;
              st.hourlyStats[hour].losses++;
            } else {
              st.pendingCount++;
            }

            evaluations.push({
              cycleKey: targetCycle.cycleKey,
              analysis,
              analysisCode,
              value: targetCycle.value,
              triggerAt: targetCycle.triggerAt,
              model: cm.name,
              cyclesUsedCount: 3,
              pastCycleKeys: pastCycles.slice(-3).map((c) => c.cycleKey),
              predictedGap: predGap,
              predictedDate: new Date(targetCycle.triggerAt.getTime() + predGap * 60_000),
              pct: cand.pct,
              outcome: evalResult.outcome,
              winType: evalResult.winType,
              actualGaps: [...targetCycle.gaps],
              firstWhiteGap: targetCycle.firstWhiteGap,
              directHits: cand.directHits,
              ratioLabel: cand.classification,
              details: {
                dispersion: cand.dispersion,
                cyclesHitCount: cand.cyclesHitCount,
                exactHitsCount: cand.exactHitsCount,
              },
            });
          }
        }
      } else {
        for (const cm of consistencyModels) {
          const st = modelStatsMap[cm.name];
          st.cyclesEvaluated++;
          st.cyclesDiscardedLackHistory++;
        }
      }

      // ----------------------------------------------------
      // MODELO BENCHMARK: TENDÊNCIA
      // ----------------------------------------------------
      const stTend = modelStatsMap["Tendência Benchmark"];
      stTend.cyclesEvaluated++;
      if (pastCycles.length < 3) {
        stTend.cyclesDiscardedLackHistory++;
      } else {
        const histC = pastCycles.slice(-3).map(toEngineCycle);
        const tendRes = computeAnalysisTendency(histC, targetCycle.triggerAt);

        if (tendRes.hasTendency && tendRes.tendency && tendRes.tendency.ratio === "3/3") {
          let predGap = tendRes.tendency.gap;
          if ([17, 18].includes(analysis)) predGap += 1;

          const evalResult = evaluatePredictionAgainstCycle(predGap, targetCycle);

          stTend.predictionsCount++;
          stTend.predictionsByGap[predGap] = (stTend.predictionsByGap[predGap] || 0) + 1;

          if (!stTend.hourlyStats[hour]) {
            stTend.hourlyStats[hour] = { predictions: 0, wins: 0, losses: 0, winRate: 0 };
          }
          stTend.hourlyStats[hour].predictions++;

          if (evalResult.outcome === "WIN") {
            stTend.winCount++;
            stTend.hourlyStats[hour].wins++;
            if (evalResult.winType === "EXACT") stTend.exactWinCount++;
            else stTend.toleranceWinCount++;
          } else if (evalResult.outcome === "LOSS") {
            stTend.lossCount++;
            stTend.hourlyStats[hour].losses++;
          } else {
            stTend.pendingCount++;
          }

          evaluations.push({
            cycleKey: targetCycle.cycleKey,
            analysis,
            analysisCode,
            value: targetCycle.value,
            triggerAt: targetCycle.triggerAt,
            model: "Tendência Benchmark",
            cyclesUsedCount: 3,
            pastCycleKeys: pastCycles.slice(-3).map((c) => c.cycleKey),
            predictedGap: predGap,
            predictedDate: new Date(targetCycle.triggerAt.getTime() + predGap * 60_000),
            pct: tendRes.tendency.pct,
            outcome: evalResult.outcome,
            winType: evalResult.winType,
            actualGaps: [...targetCycle.gaps],
            firstWhiteGap: targetCycle.firstWhiteGap,
            directHits: tendRes.tendency.directHits,
            ratioLabel: tendRes.tendency.ratio,
          });
        }
      }
    }
  }

  // Finaliza estatísticas (win rate, exact win rate)
  for (const m of models) {
    const st = modelStatsMap[m];
    const decided = st.winCount + st.lossCount;
    st.winRate = decided > 0 ? Number(((st.winCount / decided) * 100).toFixed(2)) : 0;
    st.exactWinRate = decided > 0 ? Number(((st.exactWinCount / decided) * 100).toFixed(2)) : 0;
  }

  // Computa estabilidade temporal e blocos para cada modelo nesta análise
  const stabilityStatsMap: Record<string, ModelStabilityStats> = {};
  for (const m of models) {
    const modelEvals = evaluations.filter((e) => e.model === m);
    stabilityStatsMap[m] = computeModelStability(m, modelEvals);
  }

  // Interseção entre TOP-3 e Tendência Benchmark para esta análise
  const top3Evals = evaluations.filter((e) => e.model === "TOP-3");
  const tendEvals = evaluations.filter((e) => e.model === "Tendência Benchmark");
  const intersection = computeTopTendencyIntersection(analysis, analysisCode, top3Evals, tendEvals);

  return {
    analysis,
    analysisCode,
    sampleSize,
    totalCyclesAvailable: validCycles.length,
    modelStats: modelStatsMap as Record<BacktestModelName, ModelPerformanceStats>,
    stabilityStats: stabilityStatsMap as Record<BacktestModelName, ModelStabilityStats>,
    intersection,
    evaluations,
  };
}

export function buildLab2GlobalSummary(
  allResults: Lab2AnalysisResult[],
  modelsToSummarize?: BacktestModelName[],
): {
  summary: GlobalModelSummary[];
  overallStability: Record<BacktestModelName, ModelStabilityStats>;
  confluence: ConfluenceStats;
} {
  const models: BacktestModelName[] = modelsToSummarize || [
    "TOP-2",
    "TOP-3",
    "TOP-4",
    "TOP-5",
    "TOP-6",
    "TOP-3 Consistência 3/3",
    "TOP-3 Consistência 2/3",
    "TOP-3 Preferência Exata",
    "Tendência Benchmark",
  ];

  const allEvaluations: CyclePredictionEvaluation[] = [];
  for (const res of allResults) {
    allEvaluations.push(...res.evaluations);
  }

  const summary = models.map((modelName) => {
    let totalPredictions = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalExactWins = 0;
    let totalEvaluated = 0;
    let totalCyclesAvailable = 0;

    for (const res of allResults) {
      const st = res.modelStats[modelName];
      if (st) {
        totalPredictions += st.predictionsCount;
        totalWins += st.winCount;
        totalLosses += st.lossCount;
        totalExactWins += st.exactWinCount;
        totalEvaluated += st.cyclesEvaluated;
        totalCyclesAvailable += st.totalCyclesAvailable;
      }
    }

    const decided = totalWins + totalLosses;
    const winRate = decided > 0 ? Number(((totalWins / decided) * 100).toFixed(2)) : 0;
    const exactWinRate = decided > 0 ? Number(((totalExactWins / decided) * 100).toFixed(2)) : 0;
    const coverageRate =
      totalEvaluated > 0 ? Number(((totalPredictions / totalEvaluated) * 100).toFixed(2)) : 0;

    return {
      model: modelName,
      totalAnalyses: allResults.length,
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

  const overallStability: Record<string, ModelStabilityStats> = {};
  for (const m of models) {
    const modelEvals = allEvaluations.filter((e) => e.model === m);
    overallStability[m] = computeModelStability(m, modelEvals);
  }

  const confluence = computeConfluenceAnalysis(allEvaluations);

  return {
    summary,
    overallStability: overallStability as Record<BacktestModelName, ModelStabilityStats>,
    confluence,
  };
}
