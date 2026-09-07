import { addMinutes, fmtClock, isValidCycle, type Cycle } from "./predictive";
import type { PredictiveSignal } from "./signalsStore";
import { parseUtcDate } from "./utils";

/**
 * Interface para representar um gap confluente entre os 3 ciclos anteriores ao gatilho.
 */
export interface ConfluentGapInfo {
  gap: number;
  occurrences: number; // 3
  totalCycles: number; // 3
  frequencyPct: number; // 100%
}

/**
 * Analisa os 3 ciclos imediatamente anteriores ao gatilho ativo e verifica
 * quais gaps estão presentes em 100% (3 de 3) deles.
 *
 * @param pastValid Ciclos anteriores válidos ao gatilho, ordenados cronologicamente
 * @returns Array de gaps (minutos) que atingiram 100% (3/3) de confluência
 */
export function findConfluentGapsIn3Cycles(pastValid: Cycle[]): number[] {
  if (!Array.isArray(pastValid) || pastValid.length < 3) {
    return [];
  }

  // Pega exatamente os 3 ciclos imediatamente anteriores ao gatilho ativo
  const last3 = pastValid.slice(-3);

  const gapsC1 = new Set(last3[0].gaps || []);
  const gapsC2 = new Set(last3[1].gaps || []);
  const gapsC3 = new Set(last3[2].gaps || []);

  if (gapsC1.size === 0 || gapsC2.size === 0 || gapsC3.size === 0) {
    return [];
  }

  // Interseção: gaps presentes em 100% dos 3 ciclos (3/3)
  const confluent = Array.from(gapsC1)
    .filter((g) => gapsC2.has(g) && gapsC3.has(g))
    .sort((a, b) => a - b);

  return confluent;
}

export interface TendenciasCandidate {
  analysis: number;
  value: number;
  gap: number;
  targetDate: Date;
  triggerDate: Date;
  frequencyPct: number; // 100
  cycleKey: string;
}

/**
 * Extrai todos os candidatos de Tendências a partir dos gatilhos ativos e do motor de ciclos.
 * Apenas as análises com gaps de 100% 3/3 nos 3 ciclos anteriores ao gatilho são elegíveis.
 */
export function extractTendenciasCandidates(
  activeList: Array<{ analysis: number; value: number; open: Cycle }>,
  engine: Record<number, Cycle[]>,
  nowMs: number = Date.now(),
  options?: { allowHistorical?: boolean; minTargetTime?: number; maxTargetTime?: number },
): TendenciasCandidate[] {
  const candidates: TendenciasCandidate[] = [];

  for (const item of activeList) {
    const allCycles = (engine[item.analysis] || []).filter((c) => c.value === item.value);

    // Ciclos anteriores válidos e finalizados com gaps
    const pastValid = allCycles.filter(
      (c) =>
        c !== item.open &&
        c.triggerAt.getTime() <= item.open.triggerAt.getTime() &&
        isValidCycle(c) &&
        Array.isArray(c.gaps) &&
        c.gaps.length > 0,
    );

    // Requisito estrito: verificar nos 3 ciclos anteriores ao gatilho
    if (pastValid.length < 3) continue;

    const confluentGaps = findConfluentGapsIn3Cycles(pastValid);
    if (confluentGaps.length === 0) continue;

    const cycleKey = `A${item.analysis}_V${item.value}_T${item.open.triggerAt.getTime()}`;

    // Para cada gap com 100% (3/3) de confluência, projeta o alvo temporal
    for (const gap of confluentGaps) {
      let targetMinutes = gap;
      if ([17, 18].includes(item.analysis)) {
        targetMinutes += 1;
      }

      const targetDate = addMinutes(item.open.triggerAt, targetMinutes);
      const t = targetDate.getTime();

      if (options?.allowHistorical) {
        const min = options.minTargetTime ?? 0;
        const max = options.maxTargetTime ?? Infinity;
        if (t < min || t > max) continue;
      } else {
        // Tolerância padrão: sinais futuros ou dentro da janela ativa (último 1 minuto)
        if (t < nowMs - 60_000) continue;
      }

      candidates.push({
        analysis: item.analysis,
        value: item.value,
        gap,
        targetDate,
        triggerDate: item.open.triggerAt,
        frequencyPct: 100,
        cycleKey,
      });
    }
  }

  return candidates;
}

/**
 * Constrói os sinais especiais para o grupo "Tendências".
 * As análises com gaps de 100% 3/3 serão as únicas enviadas para este grupo.
 */
export function buildTendenciasSignals(
  activeList: Array<{ analysis: number; value: number; open: Cycle }>,
  engine: Record<number, Cycle[]>,
  nowMs: number = Date.now(),
  options?: { allowHistorical?: boolean; minTargetTime?: number; maxTargetTime?: number },
): PredictiveSignal[] {
  const candidates = extractTendenciasCandidates(activeList, engine, nowMs, options);
  if (candidates.length === 0) return [];

  // Agrupa candidatos pelo minuto do alvo para construir sinais consolidados
  const byMinute = new Map<number, TendenciasCandidate[]>();

  for (const cand of candidates) {
    const dt = new Date(cand.targetDate.getTime());
    dt.setSeconds(0, 0);
    dt.setMilliseconds(0);
    const minuteTime = dt.getTime();

    const list = byMinute.get(minuteTime) || [];
    list.push(cand);
    byMinute.set(minuteTime, list);
  }

  const signals: PredictiveSignal[] = [];

  for (const [minuteTime, list] of byMinute.entries()) {
    const targetDate = new Date(minuteTime);
    const timeStr = fmtClock(targetDate);
    const canonicalKey = `sig-${minuteTime}-tendencias`;

    // Constrói detalhamento das fontes confluentes
    const sources = list.map((c) => ({
      analysis: c.analysis,
      value: c.value,
      pct: 100,
      gap: c.gap,
      cycleKey: c.cycleKey,
    }));

    // Formata o resumo das análises confluentes com o gap de 100% (3/3)
    const confParts = list.map((c) => {
      const code = c.analysis >= 50 && c.analysis <= 56 ? `Q${c.analysis - 49}` : `A${c.analysis}`;
      return `${code}·${c.value} (Gap ${c.gap}m)`;
    });
    const confluenceText = `${confParts.join(", ")} · 100% (3/3 ciclos)`;

    // Rótulo descritivo
    const label =
      list.length === 1
        ? `Tendências · Gap ${list[0].gap}m (100% 3/3)`
        : `Tendências · ${list.length}x Confluência (100% 3/3)`;

    signals.push({
      key: canonicalKey,
      time: timeStr,
      pct: 100,
      label,
      confluence: confluenceText,
      medal: "📈 TENDÊNCIAS",
      entryDate: targetDate,
      outcome: "pending",
      isHighTendency: true,
      isVerified: true,
      category: "tendencias",
      groupName: "Tendências",
      isTop1: true,
      isRare: false,
      isSupreme: false,
      isAlavancagem: false,
      isNoConfluence: false,
      strategyKey: "TENDENCIAS",
      sources,
      strategies: ["TENDENCIAS"],
      confirmedStrategies: [
        {
          code: "TENDENCIAS",
          name: "Tendências (Gaps 100% 3/3)",
          id: 99,
        },
      ],
    });
  }

  // Ordena cronologicamente
  signals.sort((a, b) => {
    const tA =
      a.entryDate instanceof Date
        ? a.entryDate.getTime()
        : parseUtcDate(a.entryDate as any).getTime();
    const tB =
      b.entryDate instanceof Date
        ? b.entryDate.getTime()
        : parseUtcDate(b.entryDate as any).getTime();
    return tA - tB;
  });

  return signals;
}

/**
 * Regra do Usuário para o grupo Tendências:
 * 1. "gerou uma tag dentro dos cards dos outros grupos, como se fosse uma estratégia. (isso só deve acontecer se tiver confluência com outros grupos)."
 * 2. "Quando não tiver confluência com outro grupo deve gerar o sinal em seu próprio grupo 'Tendencias'."
 *
 * Esta função reconcilia os sinais gerados:
 * - Se um sinal de Tendências coincide no mesmo minuto alvo com um sinal de outro grupo (Alavancagem, Supremo, Raro ou Top 1 & Top 3):
 *   ele injeta a tag de estratégia "+TENDENCIAS" no card do outro grupo e NÃO cria card separado.
 * - Se o sinal de Tendências NÃO coincide com nenhum sinal de outro grupo:
 *   ele é mantido como sinal independente do seu próprio grupo "Tendências".
 */
export function reconcileTendenciasWithGroups(
  strategySignals: PredictiveSignal[],
  tendenciasSignals: PredictiveSignal[],
): PredictiveSignal[] {
  if (!tendenciasSignals || tendenciasSignals.length === 0) {
    return strategySignals || [];
  }
  if (!strategySignals || strategySignals.length === 0) {
    return tendenciasSignals;
  }

  // Clona strategySignals com segurança para não gerar efeitos colaterais
  const updatedStrategySignals: PredictiveSignal[] = strategySignals.map((s) => ({
    ...s,
    strategies: [...(s.strategies || [])],
    sources: [...(s.sources || [])],
  }));

  const isolatedTendencias: PredictiveSignal[] = [];

  for (const tendSig of tendenciasSignals) {
    if (!tendSig || !tendSig.entryDate) continue;

    const tendTime =
      tendSig.entryDate instanceof Date
        ? tendSig.entryDate.getTime()
        : parseUtcDate(tendSig.entryDate as any).getTime();
    const tendMinute = Math.floor(tendTime / 60_000);

    // Procura se há algum sinal dos outros grupos apontando para o mesmo minuto
    let matchedStrategySig: PredictiveSignal | undefined = undefined;

    for (const stratSig of updatedStrategySignals) {
      if (!stratSig || !stratSig.entryDate) continue;
      const stratTime =
        stratSig.entryDate instanceof Date
          ? stratSig.entryDate.getTime()
          : parseUtcDate(stratSig.entryDate as any).getTime();
      const stratMinute = Math.floor(stratTime / 60_000);

      if (stratMinute === tendMinute) {
        matchedStrategySig = stratSig;
        break;
      }
    }

    if (matchedStrategySig) {
      // 1. CONFLUÊNCIA com outro grupo:
      // Adiciona a tag "TENDENCIAS" como estratégia dentro do card do outro grupo
      const currentStrats = new Set(matchedStrategySig.strategies || []);
      currentStrats.add("TENDENCIAS");
      matchedStrategySig.strategies = Array.from(currentStrats);

      // Marca indicativo de alta tendência e confluência
      matchedStrategySig.isHighTendency = true;
      (matchedStrategySig as any).hasTendenciasConfluence = true;

      // Adiciona fontes do sinal de tendência se ainda não estiverem na lista de fontes
      if (Array.isArray(tendSig.sources)) {
        const existingSourceKeys = new Set(
          (matchedStrategySig.sources || []).map((s: any) => `${s.analysis}_${s.value}`),
        );
        for (const src of tendSig.sources) {
          const k = `${src.analysis}_${src.value}`;
          if (!existingSourceKeys.has(k)) {
            existingSourceKeys.add(k);
            matchedStrategySig.sources = [...(matchedStrategySig.sources || []), src];
          }
        }
      }
    } else {
      // 2. SEM CONFLUÊNCIA com outro grupo:
      // Deve gerar o sinal em seu próprio grupo "Tendências"
      isolatedTendencias.push({
        ...tendSig,
        category: "tendencias",
        groupName: "Tendências",
        isTendencias: true,
        // No próprio grupo "Tendências", não duplica tag +TENDENCIAS dentro do card
        strategies: (tendSig.strategies || []).filter((s) => s.toUpperCase() !== "TENDENCIAS"),
      });
    }
  }

  return [...updatedStrategySignals, ...isolatedTendencias];
}

