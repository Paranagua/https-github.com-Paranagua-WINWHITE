/**
 * LABORATÓRIO FIRST GAP — BACKTEST COMPARATIVO (ISOLADO)
 * 
 * Versão otimizada em streaming:
 * - Complexidade de memória O(1) usando histograma de erro para mediana exata.
 * - Candidatos a m avaliados estritamente a partir do suporte da janela (sem loops vazios).
 * - 100% fiel à lógica matemática do Top de produção.
 */

import { blazeSupabase } from "../src/integrations/supabase/blaze-client";

export interface CleanCycle {
  id: string;
  cycleKey: string;
  analysis: number;
  analysisCode: string;
  value: number;
  triggerAt: Date;
  firstWhiteGap: number;
  gaps: number[];
  secondaryGaps: number[];
  secondaryGapsSet: Set<number>;
}

export interface PredictionCandidate {
  m: number;
  score: number;
  directHits: number;
}

// -------------------------------------------------------------
// MODELO A: CURRENT_GAPS (Reprodução fiel do computeTop de produção)
// -------------------------------------------------------------
export function computeTopCurrentGaps(cyclesWindow: CleanCycle[], topN = 5): PredictionCandidate[] {
  const rowSets = cyclesWindow.map(
    (c) => new Set((c.gaps || []).filter((g) => typeof g === "number" && !Number.isNaN(g) && g > 0))
  );
  const totalRows = cyclesWindow.length;
  if (!totalRows) return [];

  // Gera apenas candidatos m que têm suporte em pelo menos um ciclo (m, m-1 ou m+1)
  const candidateMCandidates = new Set<number>();
  for (const rs of rowSets) {
    for (const v of rs) {
      if (v > 1) candidateMCandidates.add(v - 1);
      candidateMCandidates.add(v);
      candidateMCandidates.add(v + 1);
    }
  }

  const candidates: Array<PredictionCandidate & { count: number }> = [];
  for (const m of candidateMCandidates) {
    let count = 0;
    let directHits = 0;
    for (const rs of rowSets) {
      const inM = rs.has(m);
      const inMinus = m > 1 && rs.has(m - 1);
      const inPlus = rs.has(m + 1);
      if (inM || inMinus || inPlus) {
        count++;
        if (inM) directHits++;
      }
    }
    if (!count) continue;
    candidates.push({
      m,
      score: count,
      count,
      directHits,
    });
  }

  candidates.sort((a, b) => b.count - a.count || b.directHits - a.directHits || a.m - b.m);

  const picked: PredictionCandidate[] = [];
  const used = new Set<number>();
  for (const cand of candidates) {
    const nums = [cand.m - 1, cand.m, cand.m + 1];
    if (nums.some((n) => used.has(n))) continue;
    picked.push(cand);
    nums.forEach((n) => used.add(n));
    if (picked.length >= topN) break;
  }
  return picked;
}

// -------------------------------------------------------------
// MODELO B: FIRST_GAP_ONLY (Apenas cycle.firstWhiteGap)
// -------------------------------------------------------------
export function computeTopFirstGapOnly(cyclesWindow: CleanCycle[], topN = 5): PredictionCandidate[] {
  const totalRows = cyclesWindow.length;
  if (!totalRows) return [];

  const candidateMCandidates = new Set<number>();
  for (const c of cyclesWindow) {
    const fg = c.firstWhiteGap;
    if (fg > 1) candidateMCandidates.add(fg - 1);
    candidateMCandidates.add(fg);
    candidateMCandidates.add(fg + 1);
  }

  const candidates: Array<PredictionCandidate & { count: number }> = [];
  for (const m of candidateMCandidates) {
    let count = 0;
    let directHits = 0;
    for (const c of cyclesWindow) {
      const fg = c.firstWhiteGap;
      const inM = fg === m;
      const inMinus = m > 1 && fg === m - 1;
      const inPlus = fg === m + 1;
      if (inM || inMinus || inPlus) {
        count++;
        if (inM) directHits++;
      }
    }
    if (!count) continue;
    candidates.push({
      m,
      score: count,
      count,
      directHits,
    });
  }

  candidates.sort((a, b) => b.count - a.count || b.directHits - a.directHits || a.m - b.m);

  const picked: PredictionCandidate[] = [];
  const used = new Set<number>();
  for (const cand of candidates) {
    const nums = [cand.m - 1, cand.m, cand.m + 1];
    if (nums.some((n) => used.has(n))) continue;
    picked.push(cand);
    nums.forEach((n) => used.add(n));
    if (picked.length >= topN) break;
  }
  return picked;
}

// -------------------------------------------------------------
// MODELO C: HYBRID (firstWhiteGap primário + gaps posteriores secundários)
// -------------------------------------------------------------
export function computeTopHybrid(
  cyclesWindow: CleanCycle[],
  wPrimary: number,
  wSecondary: number,
  topN = 5
): PredictionCandidate[] {
  const totalRows = cyclesWindow.length;
  if (!totalRows) return [];

  const candidateMCandidates = new Set<number>();
  for (const c of cyclesWindow) {
    const fg = c.firstWhiteGap;
    if (fg > 1) candidateMCandidates.add(fg - 1);
    candidateMCandidates.add(fg);
    candidateMCandidates.add(fg + 1);
    for (const g of c.secondaryGaps) {
      if (g > 1) candidateMCandidates.add(g - 1);
      candidateMCandidates.add(g);
      candidateMCandidates.add(g + 1);
    }
  }

  const candidates: Array<PredictionCandidate & { count: number }> = [];
  for (const m of candidateMCandidates) {
    let scoreTotal = 0;
    let count = 0;
    let directHitsScore = 0;

    for (const c of cyclesWindow) {
      const fg = c.firstWhiteGap;
      const inMPrimary = fg === m;
      const inMinusPrimary = m > 1 && fg === m - 1;
      const inPlusPrimary = fg === m + 1;
      const hasPrimary = inMPrimary || inMinusPrimary || inPlusPrimary;

      const secSet = c.secondaryGapsSet;
      const inMSec = secSet.has(m);
      const inMinusSec = m > 1 && secSet.has(m - 1);
      const inPlusSec = secSet.has(m + 1);
      const hasSec = inMSec || inMinusSec || inPlusSec;

      if (hasPrimary || hasSec) {
        count++;
        let cycleScore = 0;
        if (hasPrimary) cycleScore += wPrimary;
        if (hasSec) cycleScore += wSecondary;
        scoreTotal += cycleScore;

        let dh = 0;
        if (inMPrimary) dh += wPrimary;
        if (inMSec) dh += wSecondary;
        directHitsScore += dh;
      }
    }

    if (!count) continue;
    candidates.push({
      m,
      score: scoreTotal,
      count,
      directHits: directHitsScore,
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.directHits - a.directHits || a.m - b.m);

  const picked: PredictionCandidate[] = [];
  const used = new Set<number>();
  for (const cand of candidates) {
    const nums = [cand.m - 1, cand.m, cand.m + 1];
    if (nums.some((n) => used.has(n))) continue;
    picked.push(cand);
    nums.forEach((n) => used.add(n));
    if (picked.length >= topN) break;
  }
  return picked;
}

// -------------------------------------------------------------
// ONLINE STREAMING METRICS TRACKER (O(1) MEMÓRIA)
// -------------------------------------------------------------
export class OnlineTracker {
  totalEvaluated = 0;
  totalPredictions = 0;
  exactHits = 0;
  vic1Hits = 0;
  vic2Hits = 0;
  sumAe = 0;
  // Histograma de erros para cálculo exato de mediana em O(1) de memória
  // Índices 0 a 150 (erros acima de 150 entram em 150)
  errorHist = new Uint32Array(151);

  add(pred: number, target: number) {
    this.totalPredictions++;
    const diff = Math.abs(pred - target);
    this.sumAe += diff;
    if (diff === 0) this.exactHits++;
    if (diff <= 1) this.vic1Hits++;
    if (diff <= 2) this.vic2Hits++;
    const bucket = Math.min(diff, 150);
    this.errorHist[bucket]++;
  }

  getMetrics() {
    const n = this.totalPredictions;
    if (n === 0) {
      return {
        totalPredictions: 0,
        exactHits: 0,
        exactRate: 0,
        vicinity1Hits: 0,
        vicinity1Rate: 0,
        vicinity2Hits: 0,
        vicinity2Rate: 0,
        mae: 0,
        medianAe: 0,
        coverage: 0,
      };
    }

    // Calcula mediana a partir do histograma
    let cumulative = 0;
    const targetMid = n / 2;
    let medianAe = 0;
    for (let i = 0; i <= 150; i++) {
      cumulative += this.errorHist[i];
      if (cumulative >= targetMid) {
        medianAe = i;
        break;
      }
    }

    return {
      totalPredictions: n,
      exactHits: this.exactHits,
      exactRate: (this.exactHits / n) * 100,
      vicinity1Hits: this.vic1Hits,
      vicinity1Rate: (this.vic1Hits / n) * 100,
      vicinity2Hits: this.vic2Hits,
      vicinity2Rate: (this.vic2Hits / n) * 100,
      mae: this.sumAe / n,
      medianAe,
      coverage: this.totalEvaluated > 0 ? (n / this.totalEvaluated) * 100 : 0,
    };
  }
}

export function getMinuteBucket(m: number): string {
  if (m >= 1 && m <= 5) return "1-5";
  if (m >= 6 && m <= 10) return "6-10";
  if (m >= 11 && m <= 15) return "11-15";
  if (m >= 16 && m <= 20) return "16-20";
  if (m >= 21 && m <= 30) return "21-30";
  if (m >= 31 && m <= 60) return "31-60";
  return "61-120";
}

// -------------------------------------------------------------
// FETCH CYCLES POR ANÁLISE
// -------------------------------------------------------------
export async function fetchAnalysisCycles(analysisId: number, maxRecords = 10000): Promise<CleanCycle[]> {
  const records: CleanCycle[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (records.length < maxRecords) {
    const { data, error } = await blazeSupabase
      .from("predictive_cycles")
      .select("id, cycle_key, analysis, analysis_code, value, trigger_at, gaps, status, total_whites, first_white_gap")
      .eq("analysis", analysisId)
      .order("trigger_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data) {
      if (!r.trigger_at) continue;

      const rawGaps: number[] = Array.isArray(r.gaps)
        ? r.gaps.filter((g: any) => typeof g === "number" && !Number.isNaN(g) && g > 0)
        : [];

      let fg: number | null = null;
      if (typeof r.first_white_gap === "number" && r.first_white_gap > 0) {
        fg = r.first_white_gap;
      } else if (rawGaps.length > 0 && rawGaps[0] > 0) {
        fg = rawGaps[0];
      }

      if (fg === null || fg <= 0) continue;

      const secondary = rawGaps.slice(1);

      records.push({
        id: r.id,
        cycleKey: r.cycle_key,
        analysis: r.analysis,
        analysisCode: r.analysis_code || `A${r.analysis}`,
        value: r.value,
        triggerAt: new Date(r.trigger_at),
        firstWhiteGap: fg,
        gaps: rawGaps.length > 0 ? rawGaps : [fg],
        secondaryGaps: secondary,
        secondaryGapsSet: new Set(secondary),
      });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return records;
}
