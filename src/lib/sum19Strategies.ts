import { parseUtcDate } from "./utils";
import type { ResultItemInput } from "./signalAuditEngine";

export interface Sum19StrategyDefinition {
  id: string;
  code: string; // "10-9", "9-10", "11-8", "8-11", "12-7", "7-12", "6-13", "13-6", "14-5", "5-14"
  name: string;
  description: string;
  requiredFollowingRolls: number; // 2 ou 4
}

export interface Sum19TriggerProjection {
  id: string;
  code: string;
  name: string;
  description: string;
  triggerDate: Date;
  targetDate: Date;
  targetTimestamp: number;
  targetMinute: number;
  followingRolls: number[];
  baseMinuteText: string;
  sumFormulaText: string;
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

function getRowRoll(row: any): number {
  if (!row) return -1;
  if (typeof row.roll === "number") return row.roll;
  const n = Number.parseInt(String(row.roll), 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * Calcula todas as projeções válidas das Estratégias de Gatilho de Soma 19 no mesmo minuto:
 *
 * 1. 10-9 ou 9-10: soma as 2 pedras seguintes com o minuto da primeira delas.
 * 2. 11-8: soma as 4 seguintes com o minuto do gatilho.
 * 3. 8-11: soma as 2 pedras seguintes com o minuto do gatilho.
 * 4. 12-7 ou 7-12: soma as 4 pedras seguintes com o minuto do gatilho.
 * 5. 6-13 ou 13-6: soma as 2 pedras seguintes com o minuto anterior ao gatilho.
 * 6. 14-5 (e 5-14): soma as 2 pedras seguintes com o minuto do gatilho.
 */
export function computeSum19TriggerProjections(
  results: ResultItemInput[] | any[],
): Sum19TriggerProjection[] {
  if (!Array.isArray(results) || results.length < 2) return [];

  // Ordenação cronológica garantida (mais antigos primeiro, mais recentes no fim)
  const rows = results.slice().sort((a, b) => {
    const idA = typeof a.id === "number" ? a.id : Number.parseInt(String(a.id), 10) || 0;
    const idB = typeof b.id === "number" ? b.id : Number.parseInt(String(b.id), 10) || 0;
    if (idA !== 0 && idB !== 0 && idA !== idB) return idA - idB;

    const tA = parseRowDate(a)?.getTime() || 0;
    const tB = parseRowDate(b)?.getTime() || 0;
    return tA - tB;
  });

  const projections: Sum19TriggerProjection[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const r1 = rows[i];
    const r2 = rows[i + 1];

    const v1 = getRowRoll(r1);
    const v2 = getRowRoll(r2);
    if (v1 < 0 || v2 < 0) continue;

    // Condição Primária: Soma = 19
    if (v1 + v2 !== 19) continue;

    const d1 = parseRowDate(r1);
    const d2 = parseRowDate(r2);
    if (!d1 || !d2) continue;

    // Condição Primária: Ocorrer no MESMO minuto do relógio
    const min1 = Math.floor(d1.getTime() / 60_000);
    const min2 = Math.floor(d2.getTime() / 60_000);
    if (min1 !== min2) continue;

    const triggerDate = d2; // Momento em que o par se completa
    const triggerMinute = triggerDate.getMinutes();

    // 1. Estratégia 10-9 ou 9-10
    // "10-9 ou 9-10 soma as 2 pd seguintes com o min da primeira delas."
    if ((v1 === 10 && v2 === 9) || (v1 === 9 && v2 === 10)) {
      if (i + 3 < rows.length) {
        const p1Row = rows[i + 2];
        const p2Row = rows[i + 3];
        const p1 = getRowRoll(p1Row);
        const p2 = getRowRoll(p2Row);
        const p1Date = parseRowDate(p1Row);

        if (p1 >= 0 && p2 >= 0 && p1Date) {
          const sumOffset = p1 + p2;
          // Soma com o minuto da primeira delas (p1Date)
          const targetDate = new Date(p1Date.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = `${v1}-${v2}`;
          const id = `S19_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code}`,
            description: `Gatilho ${code} no mesmo min (${d1.toISOString().substring(11, 16)}) + 2 seg (${p1}, ${p2}) somadas ao min de p1 (${p1Date.getMinutes()}m) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2],
            baseMinuteText: `minuto de p1 (${p1Date.getMinutes()}m)`,
            sumFormulaText: `${p1Date.getMinutes()}m + ${p1} + ${p2} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 2. Estratégia 11-8
    // "11-8) soma as 4 seguintes com o min do gatilho."
    else if (v1 === 11 && v2 === 8) {
      if (i + 5 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);
        const p3 = getRowRoll(rows[i + 4]);
        const p4 = getRowRoll(rows[i + 5]);

        if (p1 >= 0 && p2 >= 0 && p3 >= 0 && p4 >= 0) {
          const sumOffset = p1 + p2 + p3 + p4;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = "11-8";
          const id = `S19_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code}`,
            description: `Gatilho 11-8 no mesmo min (${triggerMinute}m) + 4 seg (${p1}, ${p2}, ${p3}, ${p4}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2, p3, p4],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${p1} + ${p2} + ${p3} + ${p4} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 3. Estratégia 8-11
    // "8-11)soma as 2 pd seguintes com o minuto do gatilho."
    else if (v1 === 8 && v2 === 11) {
      if (i + 3 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);

        if (p1 >= 0 && p2 >= 0) {
          const sumOffset = p1 + p2;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = "8-11";
          const id = `S19_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code}`,
            description: `Gatilho 8-11 no mesmo min (${triggerMinute}m) + 2 seg (${p1}, ${p2}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${p1} + ${p2} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 4. Estratégia 12-7 ou 7-12
    // "12-7ou7-12) soma as 4 pd seguintes com o min do gatilho."
    else if ((v1 === 12 && v2 === 7) || (v1 === 7 && v2 === 12)) {
      if (i + 5 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);
        const p3 = getRowRoll(rows[i + 4]);
        const p4 = getRowRoll(rows[i + 5]);

        if (p1 >= 0 && p2 >= 0 && p3 >= 0 && p4 >= 0) {
          const sumOffset = p1 + p2 + p3 + p4;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = `${v1}-${v2}`;
          const id = `S19_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code}`,
            description: `Gatilho ${code} no mesmo min (${triggerMinute}m) + 4 seg (${p1}, ${p2}, ${p3}, ${p4}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2, p3, p4],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${p1} + ${p2} + ${p3} + ${p4} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 5. Estratégia 6-13 ou 13-6
    // "6-13 ou 13-6) som as 2 pd seguintes com o min anterior ao gatilho."
    else if ((v1 === 6 && v2 === 13) || (v1 === 13 && v2 === 6)) {
      if (i + 3 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);

        if (p1 >= 0 && p2 >= 0) {
          const sumOffset = p1 + p2;
          // Minuto anterior ao gatilho (- 1 minuto)
          const targetDate = new Date(triggerDate.getTime() - 60_000 + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const prevMinute = (triggerMinute - 1 + 60) % 60;
          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = `${v1}-${v2}`;
          const id = `S19_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code}`,
            description: `Gatilho ${code} no mesmo min (${triggerMinute}m) + 2 seg (${p1}, ${p2}) somadas ao min anterior (${prevMinute}m) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2],
            baseMinuteText: `minuto anterior (${prevMinute}m)`,
            sumFormulaText: `${prevMinute}m + ${p1} + ${p2} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 6. Estratégia 14-5 (e 5-14)
    // "14-5) soma as duas pd seguintes com o min do gatilho."
    else if ((v1 === 14 && v2 === 5) || (v1 === 5 && v2 === 14)) {
      if (i + 3 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);

        if (p1 >= 0 && p2 >= 0) {
          const sumOffset = p1 + p2;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = `${v1}-${v2}`;
          const id = `S19_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code}`,
            description: `Gatilho ${code} no mesmo min (${triggerMinute}m) + 2 seg (${p1}, ${p2}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${p1} + ${p2} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }
  }

  return projections;
}
