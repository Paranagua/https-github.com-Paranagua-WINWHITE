/**
 * Motor Experimental dos Modelos de Janela TOP-2, TOP-3, TOP-4, TOP-5 e TOP-6.
 *
 * Princípios Matemáticos:
 * - A matemática é EXATAMENTE a mesma do Top de produção (computeTop).
 * - A única variável alterada é a profundidade de ciclos válidos utilizados (N = 2, 3, 4, 5, 6).
 * - Cálculo de frequência por presença única na linha [m-1, m, m+1].
 * - Desempates: count DESC -> directHits DESC -> m ASC.
 * - Deduplicação espacial por reserva da janela de 3 minutos.
 * - Filtro de qualificação idêntico: pct >= 80%.
 * - Regra de minutos A17/A18 (+1 min) preservada estritamente.
 * - Validação estrita sem dados futuros (No Future Data / Walk-forward).
 */

import type { CycleGapsRecord } from "./backtestTypes";

export type WindowSize = 2 | 3 | 4 | 5 | 6;

export interface WindowCandidateGroup {
  m: number;
  label: string;
  count: number;
  pct: number;
  directHits: number;
}

export interface WindowBacktestResult {
  eligible: boolean;
  windowSize: WindowSize;
  cyclesUsed: number;
  top1: WindowCandidateGroup | null;
  candidates: WindowCandidateGroup[];
  predictedGap: number | null;
  reason?: string;
}

/**
 * Computa a previsão TOP para uma janela arbitrária de N ciclos históricos válidos.
 *
 * @param pastValidCycles Lista cronológica de ciclos concluídos válidos da mesma pedra e análise
 * @param windowSize Número de ciclos da janela (2..6)
 * @param analysisId ID numérico da análise (para preservação de regras específicas como A17/A18)
 * @param minPct Limiar percentual de assertividade (default: 80% como em produção)
 */
export function computeTopWindow(
  pastValidCycles: CycleGapsRecord[],
  windowSize: WindowSize,
  analysisId: number,
  minPct: number = 80,
): WindowBacktestResult {
  if (!pastValidCycles || pastValidCycles.length < windowSize) {
    return {
      eligible: false,
      windowSize,
      cyclesUsed: pastValidCycles?.length || 0,
      top1: null,
      candidates: [],
      predictedGap: null,
      reason: `Necessita de no mínimo ${windowSize} ciclos anteriores válidos (disponíveis: ${pastValidCycles?.length || 0})`,
    };
  }

  // Pega estritamente os últimos N ciclos
  const recentCycles = pastValidCycles.slice(-windowSize);
  const totalRows = recentCycles.length; // N

  // Gaps positivos válidos por ciclo
  const rowSets = recentCycles.map(
    (c) =>
      new Set((c.gaps || []).filter((g) => typeof g === "number" && !Number.isNaN(g) && g > 0)),
  );

  let maxGap = 0;
  for (const rs of rowSets) {
    for (const v of rs) {
      if (v > maxGap) maxGap = v;
    }
  }

  if (maxGap === 0) {
    return {
      eligible: true,
      windowSize,
      cyclesUsed: totalRows,
      top1: null,
      candidates: [],
      predictedGap: null,
      reason: "Nenhum gap positivo encontrado nos ciclos da janela",
    };
  }

  const candidates: WindowCandidateGroup[] = [];

  for (let m = 1; m <= maxGap + 1; m++) {
    let hasM = false;
    let hasMinus = false;
    let hasPlus = false;
    let count = 0;
    let directHits = 0;

    for (const rs of rowSets) {
      const inM = rs.has(m);
      const inMinus = m > 1 && rs.has(m - 1);
      const inPlus = rs.has(m + 1);

      if (inM || inMinus || inPlus) {
        count++;
        if (inM) {
          hasM = true;
          directHits++;
        }
        if (inMinus) hasMinus = true;
        if (inPlus) hasPlus = true;
      }
    }

    if (!count) continue;

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
    });
  }

  // Ordenação idêntica ao Top de produção:
  // 1. Maior número de ciclos (count DESC)
  // 2. Maior número de acertos diretos (directHits DESC)
  // 3. Menor tempo m (m ASC)
  candidates.sort((a, b) => b.count - a.count || b.directHits - a.directHits || a.m - b.m);

  // Deduplicação espacial por janela [m-1, m, m+1]
  const picked: WindowCandidateGroup[] = [];
  const used = new Set<number>();

  for (const cand of candidates) {
    const nums = [cand.m - 1, cand.m, cand.m + 1];
    if (nums.some((n) => used.has(n))) continue;
    picked.push(cand);
    nums.forEach((n) => used.add(n));
    if (picked.length >= 3) break;
  }

  const top1Candidate = picked.length > 0 ? picked[0] : null;

  // Filtro de qualificação de produção: pct >= minPct
  if (!top1Candidate || top1Candidate.pct < minPct) {
    return {
      eligible: true,
      windowSize,
      cyclesUsed: totalRows,
      top1: top1Candidate,
      candidates: picked,
      predictedGap: null,
      reason: top1Candidate
        ? `Top 1 com pct ${top1Candidate.pct.toFixed(1)}% abaixo do mínimo (${minPct}%)`
        : "Nenhum candidato selecionado",
    };
  }

  let predictedGap = top1Candidate.m;
  // Regra específica existente de produção para A17 e A18 (+1 min)
  if ([17, 18].includes(analysisId)) {
    predictedGap += 1;
  }

  return {
    eligible: true,
    windowSize,
    cyclesUsed: totalRows,
    top1: top1Candidate,
    candidates: picked,
    predictedGap,
  };
}
