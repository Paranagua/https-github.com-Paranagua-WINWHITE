import { parseUtcDate } from "./utils";
import type { ResultItemInput } from "./signalAuditEngine";
import type { SumTriggerProjection } from "./sum19Strategies";

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

function sortRowsChronological(results: any[]): any[] {
  return results.slice().sort((a, b) => {
    const idA = typeof a.id === "number" ? a.id : Number.parseInt(String(a.id), 10) || 0;
    const idB = typeof b.id === "number" ? b.id : Number.parseInt(String(b.id), 10) || 0;
    if (idA !== 0 && idB !== 0 && idA !== idB) return idA - idB;

    const tA = parseRowDate(a)?.getTime() || 0;
    const tB = parseRowDate(b)?.getTime() || 0;
    return tA - tB;
  });
}

/**
 * REGRA 3:
 * "Se o gatilho da estratégia estiver dentre mais de 24 rodadas sem o zero, esse gatilho é cancelado."
 *
 * Verifica se o gatilho (ou o padrão que o originou) está inserido em uma sequência contínua
 * de mais de 24 rodadas consecutivas sem nenhum zero (branco).
 */
export function isTriggerInStreakWithoutZero(
  rows: any[],
  patternStartIndex: number,
  patternEndIndex: number,
): boolean {
  // Se qualquer pedra do próprio padrão for 0, o gatilho contém o zero, logo não é "sem o zero"
  for (let k = patternStartIndex; k <= patternEndIndex; k++) {
    if (getRowRoll(rows[k]) === 0) {
      return false;
    }
  }

  // 1. Encontra o zero imediatamente anterior ao início do padrão
  let lastZeroBefore = -1;
  for (let j = patternStartIndex - 1; j >= 0; j--) {
    if (getRowRoll(rows[j]) === 0) {
      lastZeroBefore = j;
      break;
    }
  }

  // Contagem de rodadas sem zero anteriores até o gatilho (patternEndIndex)
  const nonZerosUpToTrigger =
    lastZeroBefore === -1 ? patternEndIndex + 1 : patternEndIndex - lastZeroBefore;

  if (nonZerosUpToTrigger > 24) {
    // Cancelado: no momento do gatilho já haviam se passado mais de 24 rodadas sem zero
    return true;
  }

  // 2. Encontra o próximo zero após o gatilho
  let nextZeroAfter = -1;
  for (let j = patternEndIndex + 1; j < rows.length; j++) {
    if (getRowRoll(rows[j]) === 0) {
      nextZeroAfter = j;
      break;
    }
  }

  // Se o intervalo contínuo sem zero ao redor do gatilho ultrapassa 24 rodadas
  if (lastZeroBefore !== -1 && nextZeroAfter !== -1) {
    const totalStreak = nextZeroAfter - lastZeroBefore - 1;
    if (totalStreak > 24) {
      return true;
    }
  } else if (lastZeroBefore !== -1 && nextZeroAfter === -1) {
    // Sequência aberta sem zero até o fim da lista atual de giros
    const totalStreak = rows.length - 1 - lastZeroBefore;
    if (totalStreak > 24) {
      return true;
    }
  } else if (lastZeroBefore === -1 && nextZeroAfter !== -1) {
    if (nextZeroAfter > 24) {
      return true;
    }
  } else {
    // Nenhum zero na lista
    if (rows.length > 24) {
      return true;
    }
  }

  return false;
}

/**
 * B1:
 * "Quando dentre 4 giros a primeira e a quarta são iguais e as outras duas são diferente delas,
 * soma as duas do meio e o resultado soma com o minuto do quarta.
 * *A validação deve ser feita pelo valor das pedras das pontas de 0 a 14."
 */
export function computeB1TriggerProjections(
  results: ResultItemInput[] | any[],
): SumTriggerProjection[] {
  if (!Array.isArray(results) || results.length < 4) return [];
  const rows = sortRowsChronological(results);
  const projections: SumTriggerProjection[] = [];

  for (let i = 0; i <= rows.length - 4; i++) {
    const p1 = getRowRoll(rows[i]);
    const p2 = getRowRoll(rows[i + 1]);
    const p3 = getRowRoll(rows[i + 2]);
    const p4 = getRowRoll(rows[i + 3]);

    // Validação das pedras de 0 a 14
    if (p1 < 0 || p1 > 14 || p2 < 0 || p2 > 14 || p3 < 0 || p3 > 14 || p4 < 0 || p4 > 14) {
      continue;
    }

    // A primeira e a quarta são iguais
    if (p1 !== p4) continue;

    // As outras duas são diferentes delas
    if (p2 === p1 || p3 === p1) continue;

    // Regra 3: Se o gatilho estiver dentre mais de 24 rodadas sem o zero, cancela
    if (isTriggerInStreakWithoutZero(rows, i, i + 3)) {
      continue;
    }

    const d4 = parseRowDate(rows[i + 3]);
    if (!d4) continue;

    const triggerDate = d4;
    const triggerMinute = triggerDate.getMinutes();

    // Soma as duas do meio
    const sumOffset = p2 + p3;

    // O resultado soma com o minuto da quarta
    const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
    targetDate.setSeconds(0, 0);
    targetDate.setMilliseconds(0);

    const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
    const code = `B-${p1}`;
    const id = `B1_${p1}_${triggerDate.getTime()}`;
    const targetTimeStr = targetDate.toISOString().substring(11, 16);

    projections.push({
      id,
      code,
      name: `Estratégia B1 · Ponta ${p1} (B-${p1})`,
      sumType: "Estratégia B",
      description: `B1 [${p1}, ${p2}, ${p3}, ${p4}] (${triggerMinute}m) + meio (${p2}+${p3}=${sumOffset}) = ${targetTimeStr}`,
      triggerDate,
      targetDate,
      targetTimestamp,
      targetMinute: targetDate.getMinutes(),
      followingRolls: [p2, p3],
      baseMinuteText: `minuto da 4ª (${triggerMinute}m)`,
      sumFormulaText: `${triggerMinute}m + ${p2} + ${p3} = ${targetTimeStr}`,
      pProx: p1,
      bType: "B1",
      ponta: p1,
    } as any);
  }

  return projections;
}

/**
 * B2:
 * "Quando dentre 5 giros a primeira e a quinta são iguais e as outras tres são diferente delas,
 * soma as tres do meio e o resultado soma com o minuto do quinta.
 * *A validação deve ser feita pelo valor das pedras das pontas de 0 a 14."
 */
export function computeB2TriggerProjections(
  results: ResultItemInput[] | any[],
): SumTriggerProjection[] {
  if (!Array.isArray(results) || results.length < 5) return [];
  const rows = sortRowsChronological(results);
  const projections: SumTriggerProjection[] = [];

  for (let i = 0; i <= rows.length - 5; i++) {
    const p1 = getRowRoll(rows[i]);
    const p2 = getRowRoll(rows[i + 1]);
    const p3 = getRowRoll(rows[i + 2]);
    const p4 = getRowRoll(rows[i + 3]);
    const p5 = getRowRoll(rows[i + 4]);

    // Validação das pedras de 0 a 14
    if (
      p1 < 0 ||
      p1 > 14 ||
      p2 < 0 ||
      p2 > 14 ||
      p3 < 0 ||
      p3 > 14 ||
      p4 < 0 ||
      p4 > 14 ||
      p5 < 0 ||
      p5 > 14
    ) {
      continue;
    }

    // A primeira e a quinta são iguais
    if (p1 !== p5) continue;

    // As outras três são diferentes delas
    if (p2 === p1 || p3 === p1 || p4 === p1) continue;

    // Regra 3: Se o gatilho estiver dentre mais de 24 rodadas sem o zero, cancela
    if (isTriggerInStreakWithoutZero(rows, i, i + 4)) {
      continue;
    }

    const d5 = parseRowDate(rows[i + 4]);
    if (!d5) continue;

    const triggerDate = d5;
    const triggerMinute = triggerDate.getMinutes();

    // Soma as três do meio
    const sumOffset = p2 + p3 + p4;

    // O resultado soma com o minuto da quinta
    const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
    targetDate.setSeconds(0, 0);
    targetDate.setMilliseconds(0);

    const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
    const code = `B-${p1}`;
    const id = `B2_${p1}_${triggerDate.getTime()}`;
    const targetTimeStr = targetDate.toISOString().substring(11, 16);

    projections.push({
      id,
      code,
      name: `Estratégia B2 · Ponta ${p1} (B-${p1})`,
      sumType: "Estratégia B",
      description: `B2 [${p1}, ${p2}, ${p3}, ${p4}, ${p5}] (${triggerMinute}m) + meio (${p2}+${p3}+${p4}=${sumOffset}) = ${targetTimeStr}`,
      triggerDate,
      targetDate,
      targetTimestamp,
      targetMinute: targetDate.getMinutes(),
      followingRolls: [p2, p3, p4],
      baseMinuteText: `minuto da 5ª (${triggerMinute}m)`,
      sumFormulaText: `${triggerMinute}m + ${p2} + ${p3} + ${p4} = ${targetTimeStr}`,
      pProx: p1,
      bType: "B2",
      ponta: p1,
    } as any);
  }

  return projections;
}

/**
 * B3:
 * "Quando dentre 6 giros a primeira e a sexta são iguais e as outras quatro são diferente delas,
 * soma as quatro do meio e o resultado soma com o minuto do sexta.
 * *A validação deve ser feita pelo valor das pedras das pontas de 0 a 14."
 */
export function computeB3TriggerProjections(
  results: ResultItemInput[] | any[],
): SumTriggerProjection[] {
  if (!Array.isArray(results) || results.length < 6) return [];
  const rows = sortRowsChronological(results);
  const projections: SumTriggerProjection[] = [];

  for (let i = 0; i <= rows.length - 6; i++) {
    const p1 = getRowRoll(rows[i]);
    const p2 = getRowRoll(rows[i + 1]);
    const p3 = getRowRoll(rows[i + 2]);
    const p4 = getRowRoll(rows[i + 3]);
    const p5 = getRowRoll(rows[i + 4]);
    const p6 = getRowRoll(rows[i + 5]);

    // Validação das pedras de 0 a 14
    if (
      p1 < 0 ||
      p1 > 14 ||
      p2 < 0 ||
      p2 > 14 ||
      p3 < 0 ||
      p3 > 14 ||
      p4 < 0 ||
      p4 > 14 ||
      p5 < 0 ||
      p5 > 14 ||
      p6 < 0 ||
      p6 > 14
    ) {
      continue;
    }

    // A primeira e a sexta são iguais
    if (p1 !== p6) continue;

    // As outras quatro são diferentes delas
    if (p2 === p1 || p3 === p1 || p4 === p1 || p5 === p1) continue;

    // Regra 3: Se o gatilho estiver dentre mais de 24 rodadas sem o zero, cancela
    if (isTriggerInStreakWithoutZero(rows, i, i + 5)) {
      continue;
    }

    const d6 = parseRowDate(rows[i + 5]);
    if (!d6) continue;

    const triggerDate = d6;
    const triggerMinute = triggerDate.getMinutes();

    // Soma as quatro do meio
    const sumOffset = p2 + p3 + p4 + p5;

    // O resultado soma com o minuto da sexta
    const targetDate = new Date(triggerDate.getTime() + sumOffset * 60_000);
    targetDate.setSeconds(0, 0);
    targetDate.setMilliseconds(0);

    const targetTimestamp = Math.floor(targetDate.getTime() / 60_000) * 60_000;
    const code = `B-${p1}`;
    const id = `B3_${p1}_${triggerDate.getTime()}`;
    const targetTimeStr = targetDate.toISOString().substring(11, 16);

    projections.push({
      id,
      code,
      name: `Estratégia B3 · Ponta ${p1} (B-${p1})`,
      sumType: "Estratégia B",
      description: `B3 [${p1}, ${p2}, ${p3}, ${p4}, ${p5}, ${p6}] (${triggerMinute}m) + meio (${p2}+${p3}+${p4}+${p5}=${sumOffset}) = ${targetTimeStr}`,
      triggerDate,
      targetDate,
      targetTimestamp,
      targetMinute: targetDate.getMinutes(),
      followingRolls: [p2, p3, p4, p5],
      baseMinuteText: `minuto da 6ª (${triggerMinute}m)`,
      sumFormulaText: `${triggerMinute}m + ${p2} + ${p3} + ${p4} + ${p5} = ${targetTimeStr}`,
      pProx: p1,
      bType: "B3",
      ponta: p1,
    } as any);
  }

  return projections;
}

/**
 * Retorna todas as projeções ativas das Estratégias B (B1, B2 e B3).
 */
export function computeBTriggerProjections(
  results: ResultItemInput[] | any[],
): SumTriggerProjection[] {
  const b1 = computeB1TriggerProjections(results);
  const b2 = computeB2TriggerProjections(results);
  const b3 = computeB3TriggerProjections(results);
  return [...b1, ...b2, ...b3];
}
