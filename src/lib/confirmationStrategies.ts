import { parseUtcDate } from "./utils";
import type { PredictiveSignal, StoredSignal } from "./signalsStore";
import type { ResultItemInput } from "./signalAuditEngine";

export type ConfirmationSealType = "yellow" | "blue";

export interface ConfirmedStrategyInfo {
  id: number; // 1 to 15
  code: string; // "E1", "E2", ..., "E15"
  name: string;
  type: ConfirmationSealType; // "yellow" (1-10) | "blue" (11-15)
  description: string;
  calculatedTime?: string;
  calculatedMinute?: number;
}

export interface StrategyDefinition {
  id: number;
  code: string;
  type: ConfirmationSealType;
  name: string;
  description: string;
}

export const CONFIRMATION_STRATEGIES: StrategyDefinition[] = [
  {
    id: 1,
    code: "E1",
    type: "yellow",
    name: "Estratégia 1",
    description: "Branco: minuto do branco + pedra anterior",
  },
  {
    id: 2,
    code: "E2",
    type: "yellow",
    name: "Estratégia 2",
    description: "Branco: minuto do branco + pedra posterior",
  },
  {
    id: 3,
    code: "E3",
    type: "yellow",
    name: "Estratégia 3",
    description: "Branco: minuto do branco + pedra anterior + posterior",
  },
  {
    id: 4,
    code: "E4",
    type: "yellow",
    name: "Estratégia 4",
    description: "Branco: minuto do branco + duas pedras anteriores",
  },
  {
    id: 5,
    code: "E5",
    type: "yellow",
    name: "Estratégia 5",
    description: "Branco: minuto do branco + duas pedras posteriores",
  },
  {
    id: 6,
    code: "E6",
    type: "yellow",
    name: "Estratégia 6",
    description: "Branco: minuto do branco + uma pedra anterior + uma posterior",
  },
  {
    id: 7,
    code: "E7",
    type: "yellow",
    name: "Estratégia 7",
    description: "Branco: minuto do branco + duas pedras anteriores + uma posterior",
  },
  {
    id: 8,
    code: "E8",
    type: "yellow",
    name: "Estratégia 8",
    description: "Branco: minuto do branco + uma pedra anterior + duas posteriores",
  },
  {
    id: 9,
    code: "E9",
    type: "yellow",
    name: "Estratégia 9",
    description: "Branco: minuto do branco + duas pedras anteriores + duas posteriores",
  },
  {
    id: 10,
    code: "E10",
    type: "yellow",
    name: "Estratégia 10",
    description: "Branco: minuto do branco + duas pedras anteriores + duas posteriores + 15 min",
  },
  {
    id: 11,
    code: "E11",
    type: "blue",
    name: "Estratégia 11",
    description: "Dois brancos consecutivos: soma dos minutos dos dois brancos - 1 min",
  },
  {
    id: 12,
    code: "E12",
    type: "blue",
    name: "Estratégia 12",
    description:
      "Dois brancos consecutivos: soma dos minutos dos dois brancos + minuto do 2º branco + pedra posterior",
  },
  {
    id: 13,
    code: "E13",
    type: "blue",
    name: "Estratégia 13",
    description: "Dois brancos consecutivos: soma dos minutos dos dois brancos + 37",
  },
  {
    id: 14,
    code: "E14",
    type: "blue",
    name: "Estratégia 14",
    description: "Dois brancos consecutivos: soma dos minutos dos dois brancos",
  },
  {
    id: 15,
    code: "E15",
    type: "blue",
    name: "Estratégia 15",
    description:
      "Dois brancos consecutivos: soma dos minutos dos dois brancos + duas pedras anteriores + duas posteriores",
  },
];

export interface StrategyProjection {
  strategyId: number;
  strategyCode: string;
  type: ConfirmationSealType;
  name: string;
  description: string;
  targetDate: Date;
  targetTimestamp: number;
  targetMinute: number;
  triggerEventDate: Date;
}

function parseRowDate(row: any): Date | null {
  if (!row) return null;
  if (row.created_at) {
    const d = parseUtcDate(row.created_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (row.date instanceof Date && !Number.isNaN(row.date.getTime())) {
    return row.date;
  }
  if (row.targetIso) {
    const d = parseUtcDate(row.targetIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function isWhiteRow(row: any): boolean {
  if (!row) return false;
  const r = Number(row.roll);
  if (!Number.isNaN(r) && r === 0) return true;
  const c = String(row.color || "")
    .toLowerCase()
    .trim();
  return c === "white" || c === "0";
}

function getRowRoll(row: any): number {
  if (!row) return -1;
  if (typeof row.roll === "number") return row.roll;
  const n = Number.parseInt(String(row.roll), 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * Calcula todas as projeções válidas das Estratégias 1–15 com base no histórico de giros (rows).
 *
 * Estratégias 1–10 (🟨 Selo Amarelo):
 * - Baseadas em cada Branco individual e pedras vizinhas (anteriores / posteriores).
 *
 * Estratégias 11–15 (🟦 Selo Azul):
 * - Baseadas em Dois Brancos Consecutivos.
 *
 * Trata rigorosamente viradas de hora e rolagem de minutos.
 */
export function computeConfirmationProjections(
  results: ResultItemInput[] | any[],
): StrategyProjection[] {
  if (!Array.isArray(results) || results.length === 0) return [];

  // Garante ordenação cronológica (giros mais antigos no início, mais recentes no fim)
  const rows = results.slice().sort((a, b) => {
    const idA = typeof a.id === "number" ? a.id : Number.parseInt(String(a.id), 10) || 0;
    const idB = typeof b.id === "number" ? b.id : Number.parseInt(String(b.id), 10) || 0;
    if (idA !== 0 && idB !== 0 && idA !== idB) return idA - idB;

    const tA = parseRowDate(a)?.getTime() || 0;
    const tB = parseRowDate(b)?.getTime() || 0;
    return tA - tB;
  });

  const projections: StrategyProjection[] = [];

  for (let i = 0; i < rows.length; i++) {
    const currentRow = rows[i];
    if (!isWhiteRow(currentRow)) continue;

    const whiteDate = parseRowDate(currentRow);
    if (!whiteDate) continue;

    const mB = whiteDate.getMinutes();

    const prev1 = getRowRoll(rows[i - 1]);
    const prev2 = getRowRoll(rows[i - 2]);
    const next1 = getRowRoll(rows[i + 1]);
    const next2 = getRowRoll(rows[i + 2]);

    // Helper para criar projeção segura com minutos e segundos normalizados
    const createProjection = (
      id: number,
      code: string,
      type: ConfirmationSealType,
      name: string,
      desc: string,
      offsetMin: number,
      trigDate: Date,
    ) => {
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      targetDate.setSeconds(0, 0);
      targetDate.setMilliseconds(0);
      projections.push({
        strategyId: id,
        strategyCode: code,
        type,
        name,
        description: desc,
        targetDate,
        targetTimestamp: Math.floor(targetDate.getTime() / 60_000) * 60_000,
        targetMinute: targetDate.getMinutes(),
        triggerEventDate: trigDate,
      });
    };

    // --- Estratégias 1–10 (1 Branco) -> 🟨 Selo Amarelo ---

    // E1: minuto do branco + pedra anterior
    if (prev1 > 0) {
      const offsetMin = prev1;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      createProjection(
        1,
        "E1",
        "yellow",
        "Estratégia 1",
        `Branco ${whiteDate.toISOString().substring(11, 16)} (${mB}m) + pedra ant (${prev1}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        whiteDate,
      );
    }

    // E2: minuto do branco + pedra posterior
    if (next1 > 0) {
      const offsetMin = next1;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 1]) || whiteDate;
      createProjection(
        2,
        "E2",
        "yellow",
        "Estratégia 2",
        `Branco ${whiteDate.toISOString().substring(11, 16)} (${mB}m) + pedra post (${next1}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // E3: minuto do branco + pedra anterior + posterior
    if (prev1 > 0 && next1 > 0) {
      const offsetMin = prev1 + next1;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 1]) || whiteDate;
      createProjection(
        3,
        "E3",
        "yellow",
        "Estratégia 3",
        `Branco ${whiteDate.toISOString().substring(11, 16)} + ant (${prev1}) + post (${next1}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // E4: minuto do branco + duas pedras anteriores
    if (prev1 > 0 && prev2 > 0) {
      const offsetMin = prev1 + prev2;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      createProjection(
        4,
        "E4",
        "yellow",
        "Estratégia 4",
        `Branco ${whiteDate.toISOString().substring(11, 16)} + 2 ant (${prev2}, ${prev1}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        whiteDate,
      );
    }

    // E5: minuto do branco + duas pedras posteriores
    if (next1 > 0 && next2 > 0) {
      const offsetMin = next1 + next2;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 2]) || whiteDate;
      createProjection(
        5,
        "E5",
        "yellow",
        "Estratégia 5",
        `Branco ${whiteDate.toISOString().substring(11, 16)} + 2 post (${next1}, ${next2}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // E6: minuto do branco + uma pedra anterior + uma posterior
    if (prev1 > 0 && next1 > 0) {
      const offsetMin = prev1 + next1;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 1]) || whiteDate;
      createProjection(
        6,
        "E6",
        "yellow",
        "Estratégia 6",
        `Branco ${whiteDate.toISOString().substring(11, 16)} + 1 ant (${prev1}) + 1 post (${next1}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // E7: minuto do branco + duas pedras anteriores + uma posterior
    if (prev1 > 0 && prev2 > 0 && next1 > 0) {
      const offsetMin = prev1 + prev2 + next1;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 1]) || whiteDate;
      createProjection(
        7,
        "E7",
        "yellow",
        "Estratégia 7",
        `Branco ${whiteDate.toISOString().substring(11, 16)} + 2 ant (${prev2}, ${prev1}) + 1 post (${next1}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // E8: minuto do branco + uma pedra anterior + duas posteriores
    if (prev1 > 0 && next1 > 0 && next2 > 0) {
      const offsetMin = prev1 + next1 + next2;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 2]) || whiteDate;
      createProjection(
        8,
        "E8",
        "yellow",
        "Estratégia 8",
        `Branco ${whiteDate.toISOString().substring(11, 16)} + 1 ant (${prev1}) + 2 post (${next1}, ${next2}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // E9: minuto do branco + duas pedras anteriores + duas posteriores
    if (prev1 > 0 && prev2 > 0 && next1 > 0 && next2 > 0) {
      const offsetMin = prev1 + prev2 + next1 + next2;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 2]) || whiteDate;
      createProjection(
        9,
        "E9",
        "yellow",
        "Estratégia 9",
        `Branco ${whiteDate.toISOString().substring(11, 16)} + 2 ant (${prev2}, ${prev1}) + 2 post (${next1}, ${next2}) = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // E10: Igual à estratégia 9, porém adicionar +15 minutos ao resultado
    if (prev1 > 0 && prev2 > 0 && next1 > 0 && next2 > 0) {
      const offsetMin = prev1 + prev2 + next1 + next2 + 15;
      const targetDate = new Date(whiteDate.getTime() + offsetMin * 60_000);
      const trigDate = parseRowDate(rows[i + 2]) || whiteDate;
      createProjection(
        10,
        "E10",
        "yellow",
        "Estratégia 10",
        `E9 + 15 min = ${targetDate.toISOString().substring(11, 16)}`,
        offsetMin,
        trigDate,
      );
    }

    // --- Estratégias 11–15 (Dois Brancos Consecutivos) -> 🟦 Selo Azul ---
    const nextRow = rows[i + 1];
    const isNextWhite = isWhiteRow(nextRow);

    if (isNextWhite) {
      const whiteDate2 = parseRowDate(nextRow);
      if (whiteDate2) {
        const mB1 = mB;
        const mB2 = whiteDate2.getMinutes();

        // Helper seguro de fuso-horário para projetar o próximo minuto do relógio (0..59)
        const computeUpcomingDateForMinute = (triggerDate: Date, minuteCalc: number): Date => {
          const normMin = ((minuteCalc % 60) + 60) % 60;
          const currentMin = triggerDate.getMinutes();
          let diffMin = normMin - currentMin;
          if (diffMin <= 0) {
            diffMin += 60;
          }
          const res = new Date(triggerDate.getTime() + diffMin * 60_000);
          res.setSeconds(0, 0);
          res.setMilliseconds(0);
          return res;
        };

        const postConsec1 = getRowRoll(rows[i + 2]);
        const postConsec2 = getRowRoll(rows[i + 3]);

        // E11: somar os minutos dos dois brancos e diminuir 1 minuto
        const e11Minute = mB1 + mB2 - 1;
        const e11Date = computeUpcomingDateForMinute(whiteDate2, e11Minute);
        projections.push({
          strategyId: 11,
          strategyCode: "E11",
          type: "blue",
          name: "Estratégia 11",
          description: `2 Brancos (${mB1}m + ${mB2}m) - 1m = ${e11Date.toISOString().substring(11, 16)}`,
          targetDate: e11Date,
          targetTimestamp: Math.floor(e11Date.getTime() / 60_000) * 60_000,
          targetMinute: e11Date.getMinutes(),
          triggerEventDate: whiteDate2,
        });

        // E12: soma dos minutos dos dois brancos + o minuto do segundo branco + o valor da pedra posterior
        if (postConsec1 > 0) {
          const e12Minute = mB1 + mB2 + mB2 + postConsec1;
          const trigDate = parseRowDate(rows[i + 2]) || whiteDate2;
          const e12Date = computeUpcomingDateForMinute(whiteDate2, e12Minute);
          projections.push({
            strategyId: 12,
            strategyCode: "E12",
            type: "blue",
            name: "Estratégia 12",
            description: `2 Brancos (${mB1}m + ${mB2}m) + ${mB2}m + post (${postConsec1}) = ${e12Date.toISOString().substring(11, 16)}`,
            targetDate: e12Date,
            targetTimestamp: Math.floor(e12Date.getTime() / 60_000) * 60_000,
            targetMinute: e12Date.getMinutes(),
            triggerEventDate: trigDate,
          });
        }

        // E13: soma + 37
        const e13Minute = mB1 + mB2 + 37;
        const e13Date = computeUpcomingDateForMinute(whiteDate2, e13Minute);
        projections.push({
          strategyId: 13,
          strategyCode: "E13",
          type: "blue",
          name: "Estratégia 13",
          description: `2 Brancos (${mB1}m + ${mB2}m) + 37m = ${e13Date.toISOString().substring(11, 16)}`,
          targetDate: e13Date,
          targetTimestamp: Math.floor(e13Date.getTime() / 60_000) * 60_000,
          targetMinute: e13Date.getMinutes(),
          triggerEventDate: whiteDate2,
        });

        // E14: soma dos minutos dos dois brancos
        const e14Minute = mB1 + mB2;
        const e14Date = computeUpcomingDateForMinute(whiteDate2, e14Minute);
        projections.push({
          strategyId: 14,
          strategyCode: "E14",
          type: "blue",
          name: "Estratégia 14",
          description: `2 Brancos (${mB1}m + ${mB2}m) = ${e14Date.toISOString().substring(11, 16)}`,
          targetDate: e14Date,
          targetTimestamp: Math.floor(e14Date.getTime() / 60_000) * 60_000,
          targetMinute: e14Date.getMinutes(),
          triggerEventDate: whiteDate2,
        });

        // E15: somar os minutos dos dois brancos + as duas pedras anteriores + as duas posteriores
        if (prev1 > 0 && prev2 > 0 && postConsec1 > 0 && postConsec2 > 0) {
          const e15Minute = mB1 + mB2 + prev1 + prev2 + postConsec1 + postConsec2;
          const trigDate = parseRowDate(rows[i + 3]) || whiteDate2;
          const e15Date = computeUpcomingDateForMinute(whiteDate2, e15Minute);
          projections.push({
            strategyId: 15,
            strategyCode: "E15",
            type: "blue",
            name: "Estratégia 15",
            description: `2 Brancos (${mB1}m + ${mB2}m) + 2 ant (${prev2}, ${prev1}) + 2 post (${postConsec1}, ${postConsec2}) = ${e15Date.toISOString().substring(11, 16)}`,
            targetDate: e15Date,
            targetTimestamp: Math.floor(e15Date.getTime() / 60_000) * 60_000,
            targetMinute: e15Date.getMinutes(),
            triggerEventDate: trigDate,
          });
        }
      }
    }
  }

  return projections;
}

/**
 * Combina listas de estratégias confirmadas sem duplicação de IDs.
 */
export function mergeConfirmedStrategies(
  existing: ConfirmedStrategyInfo[] = [],
  incoming: ConfirmedStrategyInfo[] = [],
): ConfirmedStrategyInfo[] {
  const map = new Map<number, ConfirmedStrategyInfo>();
  for (const c of existing || []) {
    if (c && c.id) map.set(c.id, c);
  }
  for (const c of incoming || []) {
    if (c && c.id) {
      if (!map.has(c.id)) {
        map.set(c.id, c);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id);
}

/**
 * Aplica as Estratégias de Confirmação a uma lista de sinais existentes.
 *
 * REGRAS CRÍTICAS:
 * 1. Estratégias NUNCA criam sinais por conta própria.
 * 2. Somente sinais que já existem (gerados por confluência das análises) recebem confirmação.
 * 3. Se um sinal coincidir com uma ou mais projeções das estratégias, recebe o(s) selo(s):
 *    - Estratégias 1–10: 🟨 Selo Amarelo
 *    - Estratégias 11–15: 🟦 Selo Azul
 * 4. Sinais confirmados por múltiplas estratégias mantêm TODAS as confirmações.
 * 5. Os selos permanecem durante todo o ciclo do sinal (Pending, Green, Red).
 */
export function applyConfirmationStrategies<T extends PredictiveSignal | StoredSignal>(
  signals: T[],
  results: ResultItemInput[] | any[],
): T[] {
  if (!Array.isArray(signals) || signals.length === 0) return [];

  const projections = computeConfirmationProjections(results);
  if (projections.length === 0) return signals;

  return signals.map((sig) => {
    if (!sig) return sig;

    const sigDate =
      (sig as any).entryDate instanceof Date
        ? (sig as any).entryDate
        : (sig as any).entryDate
          ? parseUtcDate((sig as any).entryDate)
          : (sig as any).targetIso
            ? parseUtcDate((sig as any).targetIso)
            : null;

    if (!sigDate || Number.isNaN(sigDate.getTime())) {
      return sig;
    }

    const sigTimestamp = Math.floor(sigDate.getTime() / 60_000) * 60_000;
    const sigMinute = sigDate.getMinutes();

    const clusterTimestamps: number[] = Array.isArray((sig as any).clusterTimestamps)
      ? (sig as any).clusterTimestamps
      : [sigTimestamp];

    // Busca todas as projeções que coincidem com o horário do sinal (janela de ±1 minuto ou minuto exato)
    const matchedProjections = projections.filter((proj) => {
      // 1. Coincidência exata de timestamp ou dentro de ±1 minuto
      if (Math.abs(proj.targetTimestamp - sigTimestamp) <= 60_000) {
        return true;
      }

      // 2. Coincidência com algum horário do cluster da confluência
      if (
        clusterTimestamps.some(
          (ts) => Math.abs(Math.floor(ts / 60_000) * 60_000 - proj.targetTimestamp) <= 60_000,
        )
      ) {
        return true;
      }

      // 3. Coincidência de minuto com tolerância de virada dentro da janela de análise (até 3h)
      if (
        proj.targetMinute === sigMinute &&
        Math.abs(proj.targetTimestamp - sigTimestamp) <= 3 * 3600_000
      ) {
        return true;
      }

      return false;
    });

    const newConfirmed: ConfirmedStrategyInfo[] = matchedProjections.map((p) => ({
      id: p.strategyId,
      code: p.strategyCode,
      name: p.name,
      type: p.type,
      description: p.description,
      calculatedTime: p.targetDate.toISOString().substring(11, 16),
      calculatedMinute: p.targetMinute,
    }));

    const mergedConfirmed = mergeConfirmedStrategies(
      (sig as any).confirmedStrategies || [],
      newConfirmed,
    );

    const hasYellowSeal =
      (sig as any).hasYellowSeal || mergedConfirmed.some((c) => c.type === "yellow");
    const hasBlueSeal = (sig as any).hasBlueSeal || mergedConfirmed.some((c) => c.type === "blue");
    const isVerified = hasYellowSeal || hasBlueSeal || (sig as any).isVerified;

    return {
      ...sig,
      confirmedStrategies: mergedConfirmed,
      hasYellowSeal,
      hasBlueSeal,
      isVerified,
    };
  });
}
