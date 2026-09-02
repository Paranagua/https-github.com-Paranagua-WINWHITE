import { parseUtcDate } from "./utils";
import type { ResultItemInput } from "./signalAuditEngine";

export interface SumTriggerProjection {
  id: string;
  code: string; // "10-9", "9-10", "11-8", "8-11", "12-7", "7-12", "6-13", "13-6", "14-5", "5-14", "10-7", "7-10", "8-9", "9-8"
  name: string;
  sumType: "Soma 19" | "Soma 17";
  description: string;
  triggerDate: Date;
  targetDate: Date;
  targetTimestamp: number;
  targetMinute: number;
  followingRolls?: number[];
  previousRolls?: number[];
  baseMinuteText: string;
  sumFormulaText: string;
}

export type Sum19TriggerProjection = SumTriggerProjection;

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
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    if ((v1 === 10 && v2 === 9) || (v1 === 9 && v2 === 10)) {
      if (i + 3 < rows.length) {
        const p1Row = rows[i + 2];
        const p2Row = rows[i + 3];
        const p1 = getRowRoll(p1Row);
        const p2 = getRowRoll(p2Row);
        const p1Date = parseRowDate(p1Row);

        // Se alguma das pedras seguintes for branco (0) ou inválida, cancela a predição
        if (p1 > 0 && p2 > 0 && p1Date) {
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
            name: `Estratégia ${code} (Soma 19)`,
            sumType: "Soma 19",
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
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    else if (v1 === 11 && v2 === 8) {
      if (i + 5 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);
        const p3 = getRowRoll(rows[i + 4]);
        const p4 = getRowRoll(rows[i + 5]);

        if (p1 > 0 && p2 > 0 && p3 > 0 && p4 > 0) {
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
            name: `Estratégia ${code} (Soma 19)`,
            sumType: "Soma 19",
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
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    else if (v1 === 8 && v2 === 11) {
      if (i + 3 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);

        if (p1 > 0 && p2 > 0) {
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
            name: `Estratégia ${code} (Soma 19)`,
            sumType: "Soma 19",
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
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    else if ((v1 === 12 && v2 === 7) || (v1 === 7 && v2 === 12)) {
      if (i + 5 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);
        const p3 = getRowRoll(rows[i + 4]);
        const p4 = getRowRoll(rows[i + 5]);

        if (p1 > 0 && p2 > 0 && p3 > 0 && p4 > 0) {
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
            name: `Estratégia ${code} (Soma 19)`,
            sumType: "Soma 19",
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
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    else if ((v1 === 6 && v2 === 13) || (v1 === 13 && v2 === 6)) {
      if (i + 3 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);

        if (p1 > 0 && p2 > 0) {
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
            name: `Estratégia ${code} (Soma 19)`,
            sumType: "Soma 19",
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
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    else if ((v1 === 14 && v2 === 5) || (v1 === 5 && v2 === 14)) {
      if (i + 3 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);

        if (p1 > 0 && p2 > 0) {
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
            name: `Estratégia ${code} (Soma 19)`,
            sumType: "Soma 19",
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

/**
 * Calcula todas as projeções válidas das Estratégias de Gatilho de Soma 17 no mesmo minuto:
 *
 * 1. 10-7: soma 15 min ao horário do gatilho.
 * 2. 7-10: soma 7 min ao horário do gatilho.
 * 3. 8-9 ou 9-8: soma as 4 pedras anteriores com o minuto do gatilho.
 * 4. 11-6 ou 6-11: soma as 3 pedras seguintes com o minuto do gatilho.
 * 5. 5-12: soma a pedra seguinte com o minuto anterior ao gatilho.
 * 6. 12-5: soma as 3 seguintes com o minuto do gatilho + 1.
 * 7. 13-4: soma as 2 seguintes e uma anterior ao horário do gatilho.
 * 8. 4-13: soma as 2 anteriores ao minuto do gatilho.
 * 9. 14-3 ou 3-14: soma 37 ao minuto do gatilho.
 *
 * Regra para todas: Se alguma das pedras (anterior ou seguinte) for o branco (0), cancela a predição.
 */
export function computeSum17TriggerProjections(
  results: ResultItemInput[] | any[],
): SumTriggerProjection[] {
  if (!Array.isArray(results) || results.length < 2) return [];

  const rows = results.slice().sort((a, b) => {
    const idA = typeof a.id === "number" ? a.id : Number.parseInt(String(a.id), 10) || 0;
    const idB = typeof b.id === "number" ? b.id : Number.parseInt(String(b.id), 10) || 0;
    if (idA !== 0 && idB !== 0 && idA !== idB) return idA - idB;

    const tA = parseRowDate(a)?.getTime() || 0;
    const tB = parseRowDate(b)?.getTime() || 0;
    return tA - tB;
  });

  const projections: SumTriggerProjection[] = [];

  for (let i = 0; i < rows.length - 1; i++) {
    const r1 = rows[i];
    const r2 = rows[i + 1];

    const v1 = getRowRoll(r1);
    const v2 = getRowRoll(r2);
    if (v1 < 0 || v2 < 0) continue;

    // Condição Primária: Soma = 17
    if (v1 + v2 !== 17) continue;

    const d1 = parseRowDate(r1);
    const d2 = parseRowDate(r2);
    if (!d1 || !d2) continue;

    // Condição Primária: Ocorrer no MESMO minuto do relógio
    const min1 = Math.floor(d1.getTime() / 60_000);
    const min2 = Math.floor(d2.getTime() / 60_000);
    if (min1 !== min2) continue;

    const triggerDate = d2;
    const triggerMinute = triggerDate.getMinutes();

    // 1. 10-7) soma 15 min ao horário do gatilho.
    if (v1 === 10 && v2 === 7) {
      const targetDate = new Date(triggerDate.getTime() + 15 * 60_000);
      targetDate.setSeconds(0, 0);
      targetDate.setMilliseconds(0);
      const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
      const code = "10-7";
      const id = `S17_${code}_${triggerDate.getTime()}`;

      projections.push({
        id,
        code,
        name: `Estratégia ${code} (Soma 17)`,
        sumType: "Soma 17",
        description: `Gatilho 10-7 no mesmo min (${d1.toISOString().substring(11, 16)}) + 15 min = ${targetDate.toISOString().substring(11, 16)}`,
        triggerDate,
        targetDate,
        targetTimestamp,
        targetMinute: targetDate.getMinutes(),
        baseMinuteText: `horário gatilho + 15m`,
        sumFormulaText: `${triggerMinute}m + 15 min = ${targetDate.toISOString().substring(11, 16)}`,
      });
    }

    // 2. 7-10) soma 7 min ao horário do gatilho.
    else if (v1 === 7 && v2 === 10) {
      const targetDate = new Date(triggerDate.getTime() + 7 * 60_000);
      targetDate.setSeconds(0, 0);
      targetDate.setMilliseconds(0);
      const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
      const code = "7-10";
      const id = `S17_${code}_${triggerDate.getTime()}`;

      projections.push({
        id,
        code,
        name: `Estratégia ${code} (Soma 17)`,
        sumType: "Soma 17",
        description: `Gatilho 7-10 no mesmo min (${d1.toISOString().substring(11, 16)}) + 7 min = ${targetDate.toISOString().substring(11, 16)}`,
        triggerDate,
        targetDate,
        targetTimestamp,
        targetMinute: targetDate.getMinutes(),
        baseMinuteText: `horário gatilho + 7m`,
        sumFormulaText: `${triggerMinute}m + 7 min = ${targetDate.toISOString().substring(11, 16)}`,
      });
    }

    // 3. 8-9 ou 9-8) soma as 4 pd anterior com o min do gatilho.
    // Regra: Se alguma das pedras anteriores for branco (0), cancelar predição.
    else if ((v1 === 8 && v2 === 9) || (v1 === 9 && v2 === 8)) {
      if (i >= 4) {
        const p1 = getRowRoll(rows[i - 4]);
        const p2 = getRowRoll(rows[i - 3]);
        const p3 = getRowRoll(rows[i - 2]);
        const p4 = getRowRoll(rows[i - 1]);

        if (p1 > 0 && p2 > 0 && p3 > 0 && p4 > 0) {
          const sumOffset = p1 + p2 + p3 + p4;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);
          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = `${v1}-${v2}`;
          const id = `S17_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code} (Soma 17)`,
            sumType: "Soma 17",
            description: `Gatilho ${code} no mesmo min (${triggerMinute}m) + 4 pedras anteriores (${p1}, ${p2}, ${p3}, ${p4}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            previousRolls: [p1, p2, p3, p4],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${p1} + ${p2} + ${p3} + ${p4} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 4. 11-6 ou 6-11) soma as 3 pd seguintes com o min do gatilho.
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    else if ((v1 === 11 && v2 === 6) || (v1 === 6 && v2 === 11)) {
      if (i + 4 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);
        const p3 = getRowRoll(rows[i + 4]);

        if (p1 > 0 && p2 > 0 && p3 > 0) {
          const sumOffset = p1 + p2 + p3;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);
          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = `${v1}-${v2}`;
          const id = `S17_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code} (Soma 17)`,
            sumType: "Soma 17",
            description: `Gatilho ${code} no mesmo min (${triggerMinute}m) + 3 pedras seguintes (${p1}, ${p2}, ${p3}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2, p3],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${p1} + ${p2} + ${p3} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 5. 5-12) soma a pd seguinte com o min anterior ao gatilho.
    // Regra: Se a pedra seguinte for branco (0), cancelar predição.
    else if (v1 === 5 && v2 === 12) {
      if (i + 2 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);

        if (p1 > 0) {
          const targetDate = new Date(triggerDate.getTime() - 60_000 + p1 * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const prevMinute = (triggerMinute - 1 + 60) % 60;
          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = "5-12";
          const id = `S17_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code} (Soma 17)`,
            sumType: "Soma 17",
            description: `Gatilho 5-12 no mesmo min (${triggerMinute}m) + pedra seguinte (${p1}) somada ao min anterior (${prevMinute}m) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1],
            baseMinuteText: `minuto anterior (${prevMinute}m)`,
            sumFormulaText: `${prevMinute}m + ${p1} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 6. 12-5) soma as 3 seguintes com o min do gatilho +1.
    // Regra: Se alguma das pedras seguintes for branco (0), cancelar predição.
    else if (v1 === 12 && v2 === 5) {
      if (i + 4 < rows.length) {
        const p1 = getRowRoll(rows[i + 2]);
        const p2 = getRowRoll(rows[i + 3]);
        const p3 = getRowRoll(rows[i + 4]);

        if (p1 > 0 && p2 > 0 && p3 > 0) {
          const sumOffset = p1 + p2 + p3;
          // min do gatilho + 1 (+ 60_000) + sumOffset
          const targetDate = new Date(triggerDate.getTime() + (1 + sumOffset) * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const baseMin = (triggerMinute + 1) % 60;
          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = "12-5";
          const id = `S17_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code} (Soma 17)`,
            sumType: "Soma 17",
            description: `Gatilho 12-5 no mesmo min (${triggerMinute}m) + 3 seguintes (${p1}, ${p2}, ${p3}) somadas ao min gatilho+1 (${baseMin}m) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [p1, p2, p3],
            baseMinuteText: `minuto gatilho + 1 (${baseMin}m)`,
            sumFormulaText: `(${triggerMinute}m + 1m) + ${p1} + ${p2} + ${p3} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 7. 13-4) soma as 2 seguinte e uma anterior ao horario do gatilho.
    // Regra: Se alguma das pedras (anterior ou seguinte) for branco (0), cancelar predição.
    else if (v1 === 13 && v2 === 4) {
      if (i >= 1 && i + 3 < rows.length) {
        const pAnt1 = getRowRoll(rows[i - 1]);
        const pSeg1 = getRowRoll(rows[i + 2]);
        const pSeg2 = getRowRoll(rows[i + 3]);

        if (pAnt1 > 0 && pSeg1 > 0 && pSeg2 > 0) {
          const sumOffset = pSeg1 + pSeg2 + pAnt1;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = "13-4";
          const id = `S17_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code} (Soma 17)`,
            sumType: "Soma 17",
            description: `Gatilho 13-4 no mesmo min (${triggerMinute}m) + 2 seguintes (${pSeg1}, ${pSeg2}) e 1 anterior (${pAnt1}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            followingRolls: [pSeg1, pSeg2],
            previousRolls: [pAnt1],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${pSeg1} + ${pSeg2} + ${pAnt1} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 8. 4-13) soma as 2 anterior ao min do gatilho.
    // Regra: Se alguma das pedras anteriores for branco (0), cancelar predição.
    else if (v1 === 4 && v2 === 13) {
      if (i >= 2) {
        const pAnt1 = getRowRoll(rows[i - 2]);
        const pAnt2 = getRowRoll(rows[i - 1]);

        if (pAnt1 > 0 && pAnt2 > 0) {
          const sumOffset = pAnt1 + pAnt2;
          const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
          targetDate.setSeconds(0, 0);
          targetDate.setMilliseconds(0);

          const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
          const code = "4-13";
          const id = `S17_${code}_${triggerDate.getTime()}`;

          projections.push({
            id,
            code,
            name: `Estratégia ${code} (Soma 17)`,
            sumType: "Soma 17",
            description: `Gatilho 4-13 no mesmo min (${triggerMinute}m) + 2 anteriores (${pAnt1}, ${pAnt2}) = ${targetDate.toISOString().substring(11, 16)}`,
            triggerDate,
            targetDate,
            targetTimestamp,
            targetMinute: targetDate.getMinutes(),
            previousRolls: [pAnt1, pAnt2],
            baseMinuteText: `minuto gatilho (${triggerMinute}m)`,
            sumFormulaText: `${triggerMinute}m + ${pAnt1} + ${pAnt2} = ${targetDate.toISOString().substring(11, 16)}`,
          });
        }
      }
    }

    // 9. 14-3 ou 3-14) soma 37 ao min do gatilho.
    else if ((v1 === 14 && v2 === 3) || (v1 === 3 && v2 === 14)) {
      const targetDate = new Date(triggerDate.getTime() + 37 * 60_000);
      targetDate.setSeconds(0, 0);
      targetDate.setMilliseconds(0);

      const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
      const code = `${v1}-${v2}`;
      const id = `S17_${code}_${triggerDate.getTime()}`;

      projections.push({
        id,
        code,
        name: `Estratégia ${code} (Soma 17)`,
        sumType: "Soma 17",
        description: `Gatilho ${code} no mesmo min (${triggerMinute}m) + 37 min = ${targetDate.toISOString().substring(11, 16)}`,
        triggerDate,
        targetDate,
        targetTimestamp,
        targetMinute: targetDate.getMinutes(),
        baseMinuteText: `minuto gatilho + 37m`,
        sumFormulaText: `${triggerMinute}m + 37 min = ${targetDate.toISOString().substring(11, 16)}`,
      });
    }
  }

  return projections;
}

/**
 * Calcula todas as projeções de estratégias de soma de gatilho (Soma 19 + Soma 17).
 */
export function computeAllSumTriggerProjections(
  results: ResultItemInput[] | any[],
): SumTriggerProjection[] {
  const sum19 = computeSum19TriggerProjections(results);
  const sum17 = computeSum17TriggerProjections(results);
  return [...sum19, ...sum17];
}
