import { parseUtcDate } from "./utils";
import { fmtClock } from "./predictive";
import {
  getCanonicalSignalKey,
  hasWhiteInPreviousMinute,
  formatStrategyCode,
  formatAnalysisCode,
} from "./signalHierarchy";
import type { PredictiveSignal } from "./signalsStore";
import type { ResultItemInput } from "./signalAuditEngine";

export interface F2TriggerProjection {
  id: string;
  code: "F2";
  name: string;
  sumType: "F2";
  description: string;
  triggerDate: Date;
  pProxDate: Date;
  targetDate: Date;
  targetTimestamp: number;
  targetMinute: number;
  baseMinuteText: string;
  sumFormulaText: string;
  pProx: number;
  pAnt: number;
  seg1: number;
  seg2: number;
  giros: number;
  girosSeconds: number;
  triggerBaseRoll: number;
}

function parseRowDate(row: any): Date | null {
  if (!row) return null;
  const raw = row.created_at || row.createdAt || row.time || row.date || row.targetIso;
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  try {
    const d = parseUtcDate(raw);
    if (!Number.isNaN(d.getTime())) return d;
  } catch (_e) {
    // fallback below
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getRowRoll(row: any): number {
  if (row === null || row === undefined) return -1;
  if (typeof row === "number") return row;
  const val = row.roll ?? row.value ?? row.result;
  const num = Number(val);
  return Number.isNaN(num) ? -1 : num;
}

export function sortRowsChronological<T = any>(rows: T[]): T[] {
  return rows.slice().sort((a: any, b: any) => {
    const idA = typeof a.id === "number" ? a.id : Number.parseInt(String(a.id), 10) || 0;
    const idB = typeof b.id === "number" ? b.id : Number.parseInt(String(b.id), 10) || 0;
    if (idA !== 0 && idB !== 0 && idA !== idB) return idA - idB;

    const tA = parseRowDate(a)?.getTime() || 0;
    const tB = parseRowDate(b)?.getTime() || 0;
    return tA - tB;
  });
}

/**
 * IMPLEMENTAÇÃO DA ESTRATÉGIA F2 NO MOTOR PREDITIVO
 *
 * 1. REGRAS E TRAVAS DO GATILHO (F2):
 *   - Monitorar o histórico de pedras em tempo real.
 *   - Posição Base: Identificar quando surgir uma pedra de valor exatamente igual a 4.
 *   - Trava de Cancelamento 1 (Anterior): Se a pedra imediatamente anterior ao 4 for "7", o gatilho é CANCELADO.
 *   - Posição Seguinte (P_prox): Verificar a pedra imediatamente após a pedra 4.
 *   - Condição da P_prox: Deve ser maior ou igual a 4 (P_prox >= 4). Se for menor que 4, o gatilho é CANCELADO.
 *   - Trava das Duas Seguintes: As duas pedras que seguem a pedra P_prox não podem ser 0 (Branco). Se qualquer uma das duas for 0, o gatilho é CANCELADO.
 *
 * 2. CÁLCULO DO HORÁRIO ALVO E GIROS:
 *   - Se o gatilho for aprovado em todas as travas, pegue o valor numérico da pedra seguinte à 4 (P_prox).
 *   - Converta esse valor em 'Quantidade de Giros' (considerando que cada giro equivale a 30 segundos, ou seja, Giros * 30 seg).
 *   - Adicione o tempo total de giros a partir do horário em que a P_prox foi sorteada.
 *   - No final da contagem de giros, SOMA-SE +1 MINUTO (ou +2 giros/60s). Este será o Horário Alvo final do sinal.
 */
export function computeF2TriggerProjections(
  results: ResultItemInput[] | any[],
): F2TriggerProjection[] {
  if (!Array.isArray(results) || results.length < 4) return [];

  const rows = sortRowsChronological(results);
  const projections: F2TriggerProjection[] = [];

  for (let i = 0; i < rows.length; i++) {
    const baseRoll = getRowRoll(rows[i]);
    // Posição Base: Identificar quando surgir uma pedra de valor exatamente igual a 4
    if (baseRoll !== 4) continue;

    // Trava de Cancelamento 1 (Anterior): Se a pedra imediatamente anterior ao 4 for "7", o gatilho é CANCELADO
    if (i < 1) continue;
    const prevRoll = getRowRoll(rows[i - 1]);
    if (prevRoll === 7) continue;

    // Posição Seguinte (P_prox): Verificar a pedra imediatamente após a pedra 4
    if (i + 1 >= rows.length) continue;
    const pProx = getRowRoll(rows[i + 1]);
    // Condição da P_prox: Deve ser maior ou igual a 4 (P_prox >= 4). Se for menor que 4, o gatilho é CANCELADO.
    if (pProx < 4) continue;

    // Trava das Duas Seguintes: As duas pedras que seguem a pedra P_prox não podem ser 0 (Branco).
    // Se qualquer uma das duas for 0, o gatilho é CANCELADO.
    if (i + 3 >= rows.length) {
      // Se a primeira seguinte já existir e for 0, o gatilho já está cancelado
      if (i + 2 < rows.length && getRowRoll(rows[i + 2]) === 0) {
        continue;
      }
      continue;
    }

    const seg1 = getRowRoll(rows[i + 2]);
    const seg2 = getRowRoll(rows[i + 3]);
    if (seg1 === 0 || seg2 === 0) continue;

    // Todas as travas foram rigorosamente aprovadas
    const pProxDate = parseRowDate(rows[i + 1]);
    if (!pProxDate) continue;

    const baseDate = parseRowDate(rows[i]) || pProxDate;
    const confirmDate = parseRowDate(rows[i + 3]) || pProxDate;

    // CÁLCULO DO HORÁRIO ALVO E GIROS:
    // 1. Quantidade de Giros = P_prox (cada giro = 30 seg => Giros * 30 seg)
    const giros = pProx;
    const girosSeconds = giros * 30;
    const girosMs = girosSeconds * 1000;

    // 2. Adicione o tempo total de giros a partir do horário em que a P_prox foi sorteada
    const timeWithGiros = pProxDate.getTime() + girosMs;

    // 3. No final da contagem de giros, SOMA-SE +1 MINUTO (60s). Este será o Horário Alvo final do sinal.
    const targetMs = timeWithGiros + 60_000;
    const targetDate = new Date(targetMs);
    const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
    const targetMinute = targetDate.getMinutes();

    const pProxTimeStr = fmtClock(pProxDate);
    const targetTimeStr = fmtClock(targetDate);

    const id = `F2_${pProxDate.getTime()}_${targetTimestamp}`;

    projections.push({
      id,
      code: "F2",
      name: "Estratégia F2",
      sumType: "F2",
      description: `Gatilho 4 seguido de ${pProx} (+${giros} giros [${girosSeconds}s] + 1 min)`,
      triggerDate: confirmDate || pProxDate,
      pProxDate,
      targetDate,
      targetTimestamp,
      targetMinute,
      baseMinuteText: pProxTimeStr,
      sumFormulaText: `P_prox: ${pProx} (${giros} giros = ${girosSeconds}s) + 60s => ${targetTimeStr}`,
      pProx,
      pAnt: prevRoll,
      seg1,
      seg2,
      giros,
      girosSeconds,
      triggerBaseRoll: 4,
    });
  }

  return projections;
}

/**
 * Constrói sinais preditivos disparados diretamente pela estratégia F2 para o envio de sinais.
 * Suporta confluência com outras estratégias de soma (Soma 17 e 19), análises secundárias e tendências.
 * Se já existir um sinal em `existingSignals` para o mesmo horário que já incorporou a F2 como confluência, evita duplicações.
 */
export function buildF2Signals(
  f2Projections: F2TriggerProjection[],
  results: any[],
  now: number = Date.now(),
  options?: {
    allowHistorical?: boolean;
    minTargetTime?: number;
    maxTargetTime?: number;
    existingSignals?: PredictiveSignal[];
    sumProjections?: any[];
    confluenceCandidates?: any[];
  },
): PredictiveSignal[] {
  const signals: PredictiveSignal[] = [];

  for (const proj of f2Projections) {
    const targetMs = proj.targetDate.getTime();
    if (Number.isNaN(targetMs)) continue;

    if (!options?.allowHistorical) {
      if (now >= targetMs - 60_000) continue;
      // Limite futuro razoável
      if (targetMs > now + 60 * 60_000) continue;
    } else {
      if (options.minTargetTime && targetMs < options.minTargetTime) continue;
      if (options.maxTargetTime && targetMs > options.maxTargetTime) continue;
    }

    // Trava de M-1: se houve branco no minuto anterior ao alvo, não envia sinal
    if (hasWhiteInPreviousMinute(proj.targetDate, results)) {
      continue;
    }

    const key = getCanonicalSignalKey(proj.targetDate);
    const clock = fmtClock(proj.targetDate);

    // Se já existe um sinal nos sinais existentes que já cobre este minuto (±60s):
    // Como a F2 já atua como confluência através de sumProjections em buildStrategyTriggeredSignals,
    // não criamos um sinal duplicado!
    if (options?.existingSignals && options.existingSignals.length > 0) {
      const alreadyCovered = options.existingSignals.some((es) => {
        if (!es || !es.entryDate) return false;
        const eTime =
          es.entryDate instanceof Date
            ? es.entryDate.getTime()
            : new Date(es.entryDate as any).getTime();
        return Math.abs(eTime - targetMs) <= 60_000;
      });
      if (alreadyCovered) {
        continue;
      }
    }

    // Coleta confluências adicionais na janela [targetMs - 60s, targetMs + 60s]
    const matchingSums = (options?.sumProjections || []).filter((sp: any) => {
      if (!sp || !sp.targetDate || sp.code === "F2") return false;
      const t =
        sp.targetDate instanceof Date ? sp.targetDate.getTime() : new Date(sp.targetDate).getTime();
      return Math.abs(t - targetMs) <= 60_000;
    });

    const matchingAnalyses = (options?.confluenceCandidates || []).filter((ac: any) => {
      if (!ac || !ac.targetDate) return false;
      const t =
        ac.targetDate instanceof Date ? ac.targetDate.getTime() : new Date(ac.targetDate).getTime();
      return Math.abs(t - targetMs) <= 60_000;
    });

    const extraStrategies: string[] = [];
    const seenStrat = new Set<string>();
    matchingSums.forEach((sp: any) => {
      const fmt = formatStrategyCode(sp.code);
      if (fmt && !seenStrat.has(fmt)) {
        seenStrat.add(fmt);
        extraStrategies.push(fmt);
      }
    });

    const sources: any[] = [
      {
        analysis: 202,
        value: proj.pProx,
        pct: 95.0,
        top3: true,
        rank: 1,
        cycleKey: proj.id || `F2_${proj.targetTimestamp}`,
      },
    ];

    matchingSums.forEach((sp: any, sIdx: number) => {
      const numericCode = parseInt(formatStrategyCode(sp.code), 10) || sIdx + 1;
      const sumBase = sp.sumType === "Soma 17" ? 20000 : 30000;
      sources.push({
        analysis: sumBase + numericCode,
        value: numericCode,
        pct: 78.0,
        top3: true,
        rank: 2,
        cycleKey: sp.id || `SUM_${sp.code}_T${sp.targetTimestamp}`,
      });
    });

    matchingAnalyses.forEach((ac: any) => {
      sources.push({
        analysis: ac.analysis,
        value: ac.value,
        pct: ac.pct,
        top3: !ac.isTop1,
        rank: ac.rank || 2,
        cycleKey: ac.cycleKey,
      });
    });

    const confluenceParts: string[] = [`F2 (P_prox: ${proj.pProx} · ${proj.giros} giros + 1 min)`];
    if (extraStrategies.length > 0) {
      confluenceParts.push(`+${extraStrategies.join(", ")}`);
    }
    const formattedAnalysesList: string[] = [];
    const seenAna = new Set<string>();
    matchingAnalyses.forEach((ac: any) => {
      const c = formatAnalysisCode(ac.analysis);
      const k = `${c}-${ac.value}`;
      if (!seenAna.has(k)) {
        seenAna.add(k);
        formattedAnalysesList.push(`${k}${ac.pct ? ` ${Math.round(ac.pct)}%` : ""}`);
      }
    });
    if (formattedAnalysesList.length > 0) {
      confluenceParts.push(formattedAnalysesList.join(", "));
    }

    const hasExtraConfluence = extraStrategies.length > 0 || formattedAnalysesList.length > 0;
    const isSupreme =
      extraStrategies.length >= 2 ||
      (extraStrategies.length >= 1 && formattedAnalysesList.length >= 1);
    const isRare = !isSupreme && hasExtraConfluence;

    const category = isSupreme ? "supreme" : isRare ? "rare" : "top1_top3";
    const medal = isSupreme
      ? "👑 Supremo (F2 + Confluência)"
      : isRare
        ? "💎 Raro (F2 + Confluência)"
        : "⚡ Estratégia F2";

    const label = isSupreme
      ? `Supremo (F2${extraStrategies.length > 0 ? ` + ${extraStrategies.join("/")}` : ""})`
      : isRare
        ? `Raro (F2${extraStrategies.length > 0 ? ` + ${extraStrategies.join("/")}` : ""})`
        : "Estratégia F2";

    signals.push({
      key,
      time: clock,
      entryDate: proj.targetDate,
      targetTime: clock,
      pct: 95.0,
      label,
      confluence: confluenceParts.join(" · "),
      medal,
      outcome: "pending",
      category,
      groupName: "Estratégia F2",
      isTop1: true,
      isSupreme,
      isRare,
      strategyKey: "F2",
      strategies: ["F2", ...extraStrategies],
      sources,
      clusterTimestamps: [proj.targetTimestamp],
    });
  }

  return signals;
}
