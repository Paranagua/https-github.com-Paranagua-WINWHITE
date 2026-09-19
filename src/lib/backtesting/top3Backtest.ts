/**
 * Implementação experimental e isolada do MODELO B: TOP 3 CICLOS.
 *
 * REGRAS DO MODELO:
 * - Utiliza estritamente os 3 ciclos válidos mais recentes da mesma análise (pastCycles.slice(-3)).
 * - Utiliza a MESMA regra estatística do Top atual (frequência de linhas, janela de confluência e desempate por directHits).
 * - NÃO reutiliza a lógica específica de Tendência (não usa a estrutura ou filtros de computeAnalysisTendency).
 * - NÃO utiliza ±1 automaticamente (sem acréscimos arbitrários de tempo como os +1 min de A17/A18).
 * - NÃO cria classificações de "2/3" ou "3/3".
 * - NÃO cria grupo "Em Alta".
 * - NÃO gera sinais reais de produção.
 * - Produz dados estritamente para comparação científica no Laboratório.
 */

import type { CycleGapsRecord } from "./backtestTypes";

export interface Top3CandidateGroup {
  m: number;
  label: string;
  count: number;
  pct: number;
  directHits: number;
}

export interface Top3BacktestResult {
  eligible: boolean;
  cyclesUsed: number;
  top1: Top3CandidateGroup | null;
  candidates: Top3CandidateGroup[];
  reason?: string;
}

/**
 * Executa o cálculo estatístico experimental de Top 3 sobre exatamente 3 ciclos válidos.
 *
 * @param pastValidCycles Lista de ciclos passados válidos (ordenados cronologicamente)
 * @returns Top3BacktestResult contendo a projeção Top 1 e candidatos ordenados
 */
export function computeTop3Experimental(pastValidCycles: CycleGapsRecord[]): Top3BacktestResult {
  if (!pastValidCycles || pastValidCycles.length < 3) {
    return {
      eligible: false,
      cyclesUsed: pastValidCycles?.length || 0,
      top1: null,
      candidates: [],
      reason: `Necessita de no mínimo 3 ciclos anteriores válidos (atualmente ${pastValidCycles?.length || 0})`,
    };
  }

  // Utiliza estritamente os 3 ciclos válidos mais recentes
  const recent3 = pastValidCycles.slice(-3);
  const totalRows = recent3.length; // 3

  // Conjunto de gaps positivos (> 0) por ciclo
  const rowSets = recent3.map(
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
      cyclesUsed: totalRows,
      top1: null,
      candidates: [],
      reason: "Nenhum gap numérico positivo presente nos 3 ciclos",
    };
  }

  const candidates: Top3CandidateGroup[] = [];

  // Avalia cada tempo candidato m
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

  // Mesma ordenação estatística do Top atual:
  // 1. Maior número de ciclos (count DESC)
  // 2. Maior número de acertos diretos (directHits DESC)
  // 3. Menor tempo projetado (m ASC)
  candidates.sort((a, b) => b.count - a.count || b.directHits - a.directHits || a.m - b.m);

  // Mesma deduplicação espacial de janelas do Top atual:
  // Um candidato selecionado consome a vizinhança [m-1, m, m+1]
  const picked: Top3CandidateGroup[] = [];
  const used = new Set<number>();

  for (const cand of candidates) {
    const nums = [cand.m - 1, cand.m, cand.m + 1];
    if (nums.some((n) => used.has(n))) continue;
    picked.push(cand);
    nums.forEach((n) => used.add(n));
    if (picked.length >= 3) break;
  }

  const top1 = picked.length > 0 ? picked[0] : null;

  return {
    eligible: true,
    cyclesUsed: totalRows,
    top1,
    candidates: picked,
  };
}
