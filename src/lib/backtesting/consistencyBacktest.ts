/**
 * Motor Experimental do MODELO TOP-3-CONSISTÊNCIA.
 *
 * Princípios do Modelo:
 * - Utiliza estritamente os 3 últimos ciclos válidos.
 * - Adiciona uma camada de consistência estatística inspirada no rigor de Tendência,
 *   sem copiar ou importar funções de produção da Tendência.
 * - Mede para cada candidato m em Ciclo 1, Ciclo 2, Ciclo 3:
 *   - presença por vizinhança [m-1, m, m+1]
 *   - presença exata m
 *   - quantidade de ciclos atingidos (3/3, 2/3, 1/3)
 *   - quantidade de acertos exatos (0..3)
 *   - dispersão entre os gaps reais
 * - Compara os 4 perfis experimentais:
 *   A) Frequência Simples Top 3 (3/3 padrão)
 *   B) Consistência 3/3
 *   C) Consistência 2/3
 *   D) Top 3 + Preferência por Acerto Exato (directHits >= 1)
 * - Registra a origem de cada resultado:
 *   - coincidência exata (EXACT)
 *   - vizinhança (WINDOW_TOLERANCE)
 *   - repetição em 2 ciclos (2/3)
 *   - repetição em 3 ciclos (3/3)
 */

import type { CandidateConsistencyDetail, CycleGapsRecord } from "./backtestTypes";

export interface ConsistencyEvaluationResult {
  eligible: boolean;
  cyclesUsed: number;
  allCandidates: CandidateConsistencyDetail[];
  // Variantes para comparação
  modelA_Top3Simple: CandidateConsistencyDetail | null;
  modelB_Consistency33: CandidateConsistencyDetail | null;
  modelC_Consistency23: CandidateConsistencyDetail | null;
  modelD_ExactPreference: CandidateConsistencyDetail | null;
  predictedGapA: number | null;
  predictedGapB: number | null;
  predictedGapC: number | null;
  predictedGapD: number | null;
  reason?: string;
}

/**
 * Computa o modelo experimental TOP-3-CONSISTÊNCIA sobre os últimos 3 ciclos passados.
 */
export function computeTop3Consistency(
  pastValidCycles: CycleGapsRecord[],
  analysisId: number,
): ConsistencyEvaluationResult {
  if (!pastValidCycles || pastValidCycles.length < 3) {
    return {
      eligible: false,
      cyclesUsed: pastValidCycles?.length || 0,
      allCandidates: [],
      modelA_Top3Simple: null,
      modelB_Consistency33: null,
      modelC_Consistency23: null,
      modelD_ExactPreference: null,
      predictedGapA: null,
      predictedGapB: null,
      predictedGapC: null,
      predictedGapD: null,
      reason: `Necessita de no mínimo 3 ciclos anteriores válidos (disponíveis: ${pastValidCycles?.length || 0})`,
    };
  }

  const recent3 = pastValidCycles.slice(-3); // [Ciclo 1, Ciclo 2, Ciclo 3]
  const totalRows = recent3.length; // 3

  const rowGaps = recent3.map((c) =>
    (c.gaps || []).filter((g) => typeof g === "number" && !Number.isNaN(g) && g > 0),
  );

  let maxGap = 0;
  for (const gaps of rowGaps) {
    for (const g of gaps) {
      if (g > maxGap) maxGap = g;
    }
  }

  if (maxGap === 0) {
    return {
      eligible: true,
      cyclesUsed: totalRows,
      allCandidates: [],
      modelA_Top3Simple: null,
      modelB_Consistency33: null,
      modelC_Consistency23: null,
      modelD_ExactPreference: null,
      predictedGapA: null,
      predictedGapB: null,
      predictedGapC: null,
      predictedGapD: null,
      reason: "Nenhum gap numérico positivo nos 3 ciclos",
    };
  }

  const candidates: CandidateConsistencyDetail[] = [];

  for (let m = 1; m <= maxGap + 1; m++) {
    const cycleHits = [false, false, false];
    const cycleExactHits = [false, false, false];
    const matchingGapsPerCycle: number[] = [];

    let hasMinus = false;
    let hasM = false;
    let hasPlus = false;
    let directHits = 0;
    let count = 0;

    for (let i = 0; i < 3; i++) {
      const gaps = rowGaps[i];
      const inExact = gaps.includes(m);
      const inMinus = m > 1 && gaps.includes(m - 1);
      const inPlus = gaps.includes(m + 1);

      if (inExact) {
        cycleExactHits[i] = true;
        directHits++;
        hasM = true;
      }
      if (inMinus) hasMinus = true;
      if (inPlus) hasPlus = true;

      if (inExact || inMinus || inPlus) {
        cycleHits[i] = true;
        count++;
        // Coleta o gap representativo deste ciclo mais próximo de m
        if (inExact) matchingGapsPerCycle.push(m);
        else if (inMinus) matchingGapsPerCycle.push(m - 1);
        else matchingGapsPerCycle.push(m + 1);
      }
    }

    if (count === 0) continue;

    // Dispersão entre os gaps atingidos nos ciclos
    let dispersion = 0;
    if (matchingGapsPerCycle.length >= 2) {
      const minG = Math.min(...matchingGapsPerCycle);
      const maxG = Math.max(...matchingGapsPerCycle);
      dispersion = maxG - minG;
    }

    const classification: "3/3" | "2/3" | "1/3" = count === 3 ? "3/3" : count === 2 ? "2/3" : "1/3";

    const parts: string[] = [];
    if (hasMinus) parts.push(`${m - 1}`);
    if (hasM) parts.push(`${m}`);
    if (hasPlus) parts.push(`${m + 1}`);

    candidates.push({
      m,
      label: parts.join(" - "),
      count,
      pct: (count / totalRows) * 100,
      directHits,
      cycleHits,
      cycleExactHits,
      cycleGaps: rowGaps,
      cyclesHitCount: count,
      exactHitsCount: directHits,
      dispersion,
      classification,
    });
  }

  // Deduplicação espacial padrão
  const deduplicateCandidates = (
    list: CandidateConsistencyDetail[],
  ): CandidateConsistencyDetail[] => {
    const picked: CandidateConsistencyDetail[] = [];
    const used = new Set<number>();
    for (const cand of list) {
      const nums = [cand.m - 1, cand.m, cand.m + 1];
      if (nums.some((n) => used.has(n))) continue;
      picked.push(cand);
      nums.forEach((n) => used.add(n));
      if (picked.length >= 3) break;
    }
    return picked;
  };

  // -------------------------------------------------------------------------
  // PERFIL A: Frequência Simples Top 3 (Padrão: count DESC, directHits DESC, m ASC, pct >= 80%)
  // -------------------------------------------------------------------------
  const sortedA = [...candidates].sort(
    (a, b) => b.count - a.count || b.directHits - a.directHits || a.m - b.m,
  );
  const pickedA = deduplicateCandidates(sortedA);
  const modelA_Top3Simple = pickedA.length > 0 && pickedA[0].pct >= 80 ? pickedA[0] : null;

  // -------------------------------------------------------------------------
  // PERFIL B: Consistência 3/3 (Estritamente 3/3, count === 3)
  // -------------------------------------------------------------------------
  const cand33 = candidates.filter((c) => c.classification === "3/3");
  cand33.sort((a, b) => b.directHits - a.directHits || a.dispersion - b.dispersion || a.m - b.m);
  const pickedB = deduplicateCandidates(cand33);
  const modelB_Consistency33 = pickedB.length > 0 ? pickedB[0] : null;

  // -------------------------------------------------------------------------
  // PERFIL C: Consistência 2/3 (Exatamente 2 de 3 ciclos, count === 2)
  // -------------------------------------------------------------------------
  const cand23 = candidates.filter((c) => c.classification === "2/3");
  cand23.sort((a, b) => b.directHits - a.directHits || a.dispersion - b.dispersion || a.m - b.m);
  const pickedC = deduplicateCandidates(cand23);
  const modelC_Consistency23 = pickedC.length > 0 ? pickedC[0] : null;

  // -------------------------------------------------------------------------
  // PERFIL D: Top 3 + Preferência por Acerto Exato
  // Requer presença nos 3 ciclos (3/3) E prioriza estritamente candidatos com directHits >= 1
  // -------------------------------------------------------------------------
  const candExactPref = candidates.filter((c) => c.classification === "3/3" && c.directHits >= 1);
  candExactPref.sort(
    (a, b) => b.directHits - a.directHits || a.dispersion - b.dispersion || a.m - b.m,
  );
  const pickedD = deduplicateCandidates(candExactPref);
  const modelD_ExactPreference = pickedD.length > 0 ? pickedD[0] : null;

  // Aplica regra de minutos A17/A18 se aplicável
  const adjustMinuteGap = (mVal: number | null): number | null => {
    if (mVal === null) return null;
    return [17, 18].includes(analysisId) ? mVal + 1 : mVal;
  };

  return {
    eligible: true,
    cyclesUsed: totalRows,
    allCandidates: candidates,
    modelA_Top3Simple,
    modelB_Consistency33,
    modelC_Consistency23,
    modelD_ExactPreference,
    predictedGapA: adjustMinuteGap(modelA_Top3Simple ? modelA_Top3Simple.m : null),
    predictedGapB: adjustMinuteGap(modelB_Consistency33 ? modelB_Consistency33.m : null),
    predictedGapC: adjustMinuteGap(modelC_Consistency23 ? modelC_Consistency23.m : null),
    predictedGapD: adjustMinuteGap(modelD_ExactPreference ? modelD_ExactPreference.m : null),
  };
}
