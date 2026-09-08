import { fmtClock, type Cycle } from "./predictive";

export interface IdentifiedTendency {
  gap: number;
  label: string;
  count: number;
  total: number;
  ratio: "3/3" | "2/3";
  pct: number; // 100 para 3/3, 66.7 para 2/3
  directHits: number;
  projectedTime?: Date;
  projectedClock?: string;
  cycleGaps: number[][];
}

export interface AnalysisTendencyResult {
  eligible: boolean;
  hasTendency: boolean;
  tendency: IdentifiedTendency | null;
  allTendencies: IdentifiedTendency[];
  recentCycles: Cycle[];
  reason?: string;
}

export interface RawTendencyCandidate {
  analysis: number;
  value: number;
  gap: number;
  targetDate: Date;
  ratio: "3/3" | "2/3";
  count: number;
  pct: number;
  triggerAt: Date;
  cycleKey?: string;
  strategyKey?: string;
  label?: string;
}

/**
 * Calcula a TENDÊNCIA baseada exclusivamente nos 3 ciclos mais recentes
 * daquela mesma análise/gatilho, anteriores ao novo gatilho.
 *
 * Regras:
 * - Localiza os 3 ciclos anteriores mais recentes.
 * - Considera os gaps registrados desde o gatilho até o branco.
 * - Compara os gaps dos 3 ciclos.
 * - Identifica o gap com confluência/repetição (janela [g-1, g, g+1] e direct hits).
 * - Confirmação: 3/3 (100%) ou 2/3 (66.7%).
 * - Projeta o gap a partir do gatilho fornecido (triggerAt).
 */
export function computeAnalysisTendency(
  pastValidCycles: Cycle[],
  triggerAt?: Date | null,
): AnalysisTendencyResult {
  if (!pastValidCycles || pastValidCycles.length < 3) {
    return {
      eligible: false,
      hasTendency: false,
      tendency: null,
      allTendencies: [],
      recentCycles: pastValidCycles || [],
      reason: `Necessita de no mínimo 3 ciclos anteriores válidos (atualmente ${pastValidCycles?.length || 0})`,
    };
  }

  // Pega exatamente os 3 ciclos anteriores mais recentes daquela análise
  const recent3 = pastValidCycles.slice(-3);

  // Gaps registrados em cada um dos 3 ciclos
  const gapSets = recent3.map(
    (c) => new Set(c.gaps.filter((g) => typeof g === "number" && !Number.isNaN(g))),
  );
  const allGapsFlat = recent3.flatMap((c) => c.gaps);
  const maxGap = allGapsFlat.length > 0 ? Math.max(30, ...allGapsFlat) : 30;

  const candidates: IdentifiedTendency[] = [];
  const upperLimit = Math.min(60, maxGap + 2);

  for (let g = 0; g <= upperLimit; g++) {
    // Verifica se cada um dos 3 ciclos confirma o gap g ou seus adjacentes [g-1, g, g+1]
    const confirms = gapSets.map((s) => {
      const hasMinus = g > 0 && s.has(g - 1);
      const hasExact = s.has(g);
      const hasPlus = s.has(g + 1);
      return hasMinus || hasExact || hasPlus;
    });

    const count = confirms.filter(Boolean).length;
    if (count < 2) continue; // Confluência mínima é 2/3

    const directHits = gapSets.filter((s) => s.has(g)).length;

    // Constrói os componentes presentes para o rótulo
    const parts: string[] = [];
    if (g > 0 && gapSets.some((s) => s.has(g - 1))) parts.push(String(g - 1));
    if (gapSets.some((s) => s.has(g))) parts.push(String(g));
    if (gapSets.some((s) => s.has(g + 1))) parts.push(String(g + 1));
    const label = parts.length > 1 ? parts.join(" - ") : String(g);

    let projDate: Date | undefined;
    let projClock: string | undefined;

    if (triggerAt) {
      projDate = new Date(triggerAt.getTime() + g * 60_000);
      projClock = fmtClock(projDate);
    }

    candidates.push({
      gap: g,
      label,
      count,
      total: 3,
      ratio: count === 3 ? "3/3" : "2/3",
      pct: count === 3 ? 100 : 66.7,
      directHits,
      projectedTime: projDate,
      projectedClock: projClock,
      cycleGaps: recent3.map((c) => [...c.gaps]),
    });
  }

  if (candidates.length === 0) {
    return {
      eligible: true,
      hasTendency: false,
      tendency: null,
      allTendencies: [],
      recentCycles: recent3,
      reason: "Sem confluência de gaps nos 3 ciclos mais recentes",
    };
  }

  // Ordenação: 3/3 tem prioridade absoluta sobre 2/3, seguido de directHits, seguido do menor gap
  candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.directHits !== a.directHits) return b.directHits - a.directHits;
    return a.gap - b.gap;
  });

  // Deduplicação de janelas adjacentes para manter picos limpos
  const deduped: IdentifiedTendency[] = [];
  for (const cand of candidates) {
    const isOverlapping = deduped.some(
      (d) => Math.abs(d.gap - cand.gap) <= 1 && d.count >= cand.count,
    );
    if (!isOverlapping) {
      deduped.push(cand);
    }
  }

  const best = deduped[0] || candidates[0];

  return {
    eligible: true,
    hasTendency: true,
    tendency: best,
    allTendencies: deduped,
    recentCycles: recent3,
  };
}
