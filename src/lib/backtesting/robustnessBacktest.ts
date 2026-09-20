/**
 * Módulo de Análise de Robustez Temporal, Estabilidade, Interseção e Confluência.
 *
 * Princípios:
 * - Divisão cronológica estrita em 5 blocos (0-20%, 20-40%, 40-60%, 60-80%, 80-100%).
 * - Métricas de estabilidade: Média, Mínimo, Máximo, Amplitude e Desvio Padrão.
 * - Teste de Interseção Top x Tendência: previsões compartilhadas, exclusivas e win rates.
 * - Teste de Confluência: coincidência exata, vizinhança +-1 min, assertividade com e sem confluência.
 * - Classificação de confiabilidade por tamanho amostral: Grande, Média ou Pequena.
 */

import type {
  BlockPerformance,
  ModelStabilityStats,
  IntersectionStats,
  ConfluenceStats,
  SampleSizeCategory,
  CyclePredictionEvaluation,
} from "./backtestTypes";

/**
 * Classifica a amostra estatística com base na quantidade total de ciclos concluídos disponíveis.
 */
export function categorizeSampleSize(cycleCount: number): SampleSizeCategory {
  if (cycleCount >= 1000) return "Grande";
  if (cycleCount >= 100) return "Média";
  return "Pequena";
}

/**
 * Calcula a estabilidade de um modelo dividindo suas avaliações cronológicas em 5 blocos.
 *
 * @param evaluations Lista de avaliações do modelo ordenadas cronologicamente por triggerAt
 */
export function computeModelStability(
  modelName: any,
  evaluations: CyclePredictionEvaluation[],
): ModelStabilityStats {
  const sorted = [...evaluations].sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
  const total = sorted.length;

  if (total === 0) {
    return {
      model: modelName,
      meanWinRate: 0,
      minWinRate: 0,
      maxWinRate: 0,
      amplitude: 0,
      stdDev: 0,
      blocks: [],
    };
  }

  const blockSize = Math.ceil(total / 5);
  const blocks: BlockPerformance[] = [];

  for (let b = 0; b < 5; b++) {
    const start = b * blockSize;
    const end = Math.min(start + blockSize, total);
    const slice = sorted.slice(start, end);

    let wins = 0;
    let losses = 0;
    let exactWins = 0;

    for (const ev of slice) {
      if (ev.outcome === "WIN") {
        wins++;
        if (ev.winType === "EXACT") exactWins++;
      } else if (ev.outcome === "LOSS") {
        losses++;
      }
    }

    const decided = wins + losses;
    const winRate = decided > 0 ? Number(((wins / decided) * 100).toFixed(2)) : 0;
    const exactWinRate = decided > 0 ? Number(((exactWins / decided) * 100).toFixed(2)) : 0;

    blocks.push({
      blockIndex: b + 1,
      blockLabel: `B${b + 1} (${b * 20}-${(b + 1) * 20}%)`,
      totalCycles: slice.length,
      predictionsCount: slice.length,
      winCount: wins,
      lossCount: losses,
      winRate,
      exactWinRate,
    });
  }

  // Métricas estatísticas de estabilidade entre blocos
  const rates = blocks.map((b) => b.winRate);
  const sumRates = rates.reduce((acc, r) => acc + r, 0);
  const meanWinRate = Number((sumRates / rates.length).toFixed(2));
  const minWinRate = Math.min(...rates);
  const maxWinRate = Math.max(...rates);
  const amplitude = Number((maxWinRate - minWinRate).toFixed(2));

  // Desvio padrão populacional dos 5 blocos
  const variance = rates.reduce((acc, r) => acc + Math.pow(r - meanWinRate, 2), 0) / rates.length;
  const stdDev = Number(Math.sqrt(variance).toFixed(2));

  return {
    model: modelName,
    meanWinRate,
    minWinRate,
    maxWinRate,
    amplitude,
    stdDev,
    blocks,
  };
}

/**
 * Calcula a interseção entre as previsões do Top (ex: TOP-3) e da Tendência.
 *
 * Determina:
 * - Previsões em comum (mesmo ciclo alvo com mesmo gap previsto)
 * - Previsões exclusivas do Top
 * - Previsões exclusivas da Tendência
 * - Taxa de acerto nos cenários compartilhados vs exclusivos
 */
export function computeTopTendencyIntersection(
  analysis: number,
  analysisCode: string,
  topEvaluations: CyclePredictionEvaluation[],
  tendencyEvaluations: CyclePredictionEvaluation[],
): IntersectionStats {
  const topByCycle = new Map<string, CyclePredictionEvaluation>();
  for (const ev of topEvaluations) {
    if (ev.predictedGap !== null) {
      topByCycle.set(ev.cycleKey, ev);
    }
  }

  const tendByCycle = new Map<string, CyclePredictionEvaluation>();
  for (const ev of tendencyEvaluations) {
    if (ev.predictedGap !== null) {
      tendByCycle.set(ev.cycleKey, ev);
    }
  }

  const allCycleKeys = new Set([...topByCycle.keys(), ...tendByCycle.keys()]);

  let commonCount = 0;
  let commonWinCount = 0;
  let commonLossCount = 0;

  let exclusiveTopCount = 0;
  let exclusiveTopWinCount = 0;
  let exclusiveTopLossCount = 0;

  let exclusiveTendenciaCount = 0;
  let exclusiveTendenciaWinCount = 0;
  let exclusiveTendenciaLossCount = 0;

  for (const key of allCycleKeys) {
    const topEv = topByCycle.get(key);
    const tendEv = tendByCycle.get(key);

    if (topEv && tendEv) {
      // Ambas emitiram previsão para o mesmo ciclo
      if (topEv.predictedGap === tendEv.predictedGap) {
        // Previsão idêntica em comum
        commonCount++;
        if (topEv.outcome === "WIN") commonWinCount++;
        else if (topEv.outcome === "LOSS") commonLossCount++;
      } else {
        // Gaps diferentes previstos
        exclusiveTopCount++;
        if (topEv.outcome === "WIN") exclusiveTopWinCount++;
        else if (topEv.outcome === "LOSS") exclusiveTopLossCount++;

        exclusiveTendenciaCount++;
        if (tendEv.outcome === "WIN") exclusiveTendenciaWinCount++;
        else if (tendEv.outcome === "LOSS") exclusiveTendenciaLossCount++;
      }
    } else if (topEv && !tendEv) {
      exclusiveTopCount++;
      if (topEv.outcome === "WIN") exclusiveTopWinCount++;
      else if (topEv.outcome === "LOSS") exclusiveTopLossCount++;
    } else if (!topEv && tendEv) {
      exclusiveTendenciaCount++;
      if (tendEv.outcome === "WIN") exclusiveTendenciaWinCount++;
      else if (tendEv.outcome === "LOSS") exclusiveTendenciaLossCount++;
    }
  }

  const commonDecided = commonWinCount + commonLossCount;
  const topDecided = exclusiveTopWinCount + exclusiveTopLossCount;
  const tendDecided = exclusiveTendenciaWinCount + exclusiveTendenciaLossCount;

  return {
    analysis,
    analysisCode,
    totalEvaluated: allCycleKeys.size,
    commonCount,
    exclusiveTopCount,
    exclusiveTendenciaCount,
    commonWinCount,
    commonLossCount,
    commonWinRate:
      commonDecided > 0 ? Number(((commonWinCount / commonDecided) * 100).toFixed(2)) : 0,
    exclusiveTopWinRate:
      topDecided > 0 ? Number(((exclusiveTopWinCount / topDecided) * 100).toFixed(2)) : 0,
    exclusiveTendenciaWinRate:
      tendDecided > 0 ? Number(((exclusiveTendenciaWinCount / tendDecided) * 100).toFixed(2)) : 0,
  };
}

/**
 * Avalia o efeito de Confluência temporal entre todas as previsões geradas.
 *
 * Agrupa previsões pelo momento exato (ou minuto de relógio) e verifica
 * se a assertividade aumenta quando múltiplas análises ou modelos confluem no mesmo minuto ou +-1 min.
 */
export function computeConfluenceAnalysis(
  allEvaluations: CyclePredictionEvaluation[],
): ConfluenceStats {
  // Mapeia previsões por data/minuto absoluto projetado: predictedDate em minutos
  const predictionsByTargetTime = new Map<number, CyclePredictionEvaluation[]>();

  for (const ev of allEvaluations) {
    if (!ev.predictedDate || ev.outcome === "NO_PREDICTION" || ev.outcome === "PENDING") continue;
    // Arredonda para minuto Unix
    const minuteTime = Math.floor(ev.predictedDate.getTime() / 60_000);
    if (!predictionsByTargetTime.has(minuteTime)) {
      predictionsByTargetTime.set(minuteTime, []);
    }
    predictionsByTargetTime.get(minuteTime)!.push(ev);
  }

  let exactConfluenceCount = 0;
  let exactConfluenceWins = 0;
  let exactConfluenceDecided = 0;

  let toleranceConfluenceCount = 0;
  let toleranceConfluenceWins = 0;
  let toleranceConfluenceDecided = 0;

  let noConfluenceCount = 0;
  let noConfluenceWins = 0;
  let noConfluenceDecided = 0;

  for (const ev of allEvaluations) {
    if (!ev.predictedDate || ev.outcome === "NO_PREDICTION" || ev.outcome === "PENDING") continue;
    const minuteTime = Math.floor(ev.predictedDate.getTime() / 60_000);

    const sameMinuteGroup = predictionsByTargetTime.get(minuteTime) || [];
    // Outras previsões no mesmo minuto exato de análises diferentes
    const distinctAnalysesExact = new Set(
      sameMinuteGroup.filter((other) => other.cycleKey !== ev.cycleKey).map((o) => o.analysis),
    );

    // Vizinhos +- 1 minuto
    const prevMinuteGroup = predictionsByTargetTime.get(minuteTime - 1) || [];
    const nextMinuteGroup = predictionsByTargetTime.get(minuteTime + 1) || [];
    const toleranceGroup = [...sameMinuteGroup, ...prevMinuteGroup, ...nextMinuteGroup];
    const distinctAnalysesTol = new Set(
      toleranceGroup.filter((other) => other.cycleKey !== ev.cycleKey).map((o) => o.analysis),
    );

    const isDecided = ev.outcome === "WIN" || ev.outcome === "LOSS";
    const isWin = ev.outcome === "WIN";

    if (distinctAnalysesExact.size >= 1) {
      exactConfluenceCount++;
      if (isDecided) {
        exactConfluenceDecided++;
        if (isWin) exactConfluenceWins++;
      }
    }

    if (distinctAnalysesTol.size >= 1) {
      toleranceConfluenceCount++;
      if (isDecided) {
        toleranceConfluenceDecided++;
        if (isWin) toleranceConfluenceWins++;
      }
    } else {
      noConfluenceCount++;
      if (isDecided) {
        noConfluenceDecided++;
        if (isWin) noConfluenceWins++;
      }
    }
  }

  return {
    totalEvaluated: allEvaluations.length,
    exactConfluenceCount,
    exactConfluenceWinRate:
      exactConfluenceDecided > 0
        ? Number(((exactConfluenceWins / exactConfluenceDecided) * 100).toFixed(2))
        : 0,
    toleranceConfluenceCount,
    toleranceConfluenceWinRate:
      toleranceConfluenceDecided > 0
        ? Number(((toleranceConfluenceWins / toleranceConfluenceDecided) * 100).toFixed(2))
        : 0,
    noConfluenceCount,
    noConfluenceWinRate:
      noConfluenceDecided > 0
        ? Number(((noConfluenceWins / noConfluenceDecided) * 100).toFixed(2))
        : 0,
  };
}
