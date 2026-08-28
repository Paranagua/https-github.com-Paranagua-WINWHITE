/**
 * Motor Preditivo FreitasWhite
 * Arquitetura Unificada: Análises estatísticas com limite de 14 tempos, 120 min timeout, Janela de 6 Gatilhos.
 */
import { parseUtcDate } from "@/lib/utils";
export type Row = { id: number; roll: string; color: string; created_at: string };

export type RecAlert = { type: string; triggerAt: Date; duration: number };

export type Cycle = {
  value: number;
  analysis: number; // 1-5 main, 10-21 sequence & condition triggers, 100+ secondary
  isSecondary?: boolean;

  triggerAt: Date;
  gaps: number[];
};

export const MAX_ZEROS = 14;
export const MAX_CYCLES = 5;
export const TIMEOUT_MINUTES = 120;

function diffMinutes(a: Date, b: Date) {
  const diffMs = b.getTime() - a.getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

function collectGaps(rows: Row[], i: number, dt: Date): number[] {
  const gaps: number[] = [];
  const limit = MAX_ZEROS;
  const timeoutMs = TIMEOUT_MINUTES * 60000;

  for (let k = 1; i + k < rows.length && gaps.length < limit; k++) {
    const r = rows[i + k];
    if (!r) continue;
    const zdt = parseUtcDate(r.created_at);
    if (Number.isNaN(zdt.getTime())) continue;

    // Trava de Timeout (120 Minutos)
    if (zdt.getTime() - dt.getTime() > timeoutMs) break;

    if (Number(r.roll) === 0) {
      gaps.push(diffMinutes(dt, zdt));
    }
  }
  return gaps;
}

/** Helper: 1ª Pedra do Minuto de final X (0..9) */
export function buildMinuteFirstStone(rows: Row[], minUnit: number, analysisId: number): Cycle[] {
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== minUnit) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: analysisId, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
}

/** Helper: 2ª Pedra do Minuto de final X (0..9) */
export function buildMinuteSecondStone(rows: Row[], minUnit: number, analysisId: number): Cycle[] {
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();
  const minuteCounts = new Map<string, number>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== minUnit) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    const count = (minuteCounts.get(key) || 0) + 1;
    minuteCounts.set(key, count);

    if (count !== 2) return;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: analysisId, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
}

/** Análise 2 — Repetição Simples: pedra sai igual à anterior (P1 == P2). */
export function buildA2(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const n = Number(rows[i].roll);
    const prev = Number(rows[i - 1].roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) continue;
    if (n !== prev) continue;
    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;
    out.push({ value: n, analysis: 2, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 3 — 2ª Pedra do Minuto 9 (09, 19, 29, 39, 49, 59). */
export function buildA3(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 9, 3);
}

/** Análise 4 — 1ª Pedra do Minuto 0 (00, 10, 20, 30, 40, 50). */
export function buildA4(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 0, 4);
}

/** Análise 5 — 2ª Pedra do Minuto 0 (00, 10, 20, 30, 40, 50). */
export function buildA5(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 0, 5);
}

/** Análise 10 — Gatilho 8-11: [8 -> 11]. Coleta os próximos 14 brancos. */
export function buildA8_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (p1 !== 8 || p2 !== 11) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 811, analysis: 10, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 11 — Gatilho 11-11: [11 -> 11]. Coleta os próximos 14 brancos. */
export function buildA11_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (p1 !== 11 || p2 !== 11) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 1111, analysis: 11, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 12 — Gatilho 4-11: [4 -> 11]. Coleta os próximos 14 brancos. */
export function buildA4_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (p1 !== 4 || p2 !== 11) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 411, analysis: 12, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 13 — Gatilho 4-14 ou 14-4: [4 -> 14] ou [14 -> 4]. Coleta os próximos 14 brancos. */
export function buildA4_14(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    const isMatch = (p1 === 4 && p2 === 14) || (p1 === 14 && p2 === 4);
    if (!isMatch) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 414, analysis: 13, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 14 — Soma de duas pedras consecutivas igual a 17. Coleta os próximos 14 brancos. */
export function buildASoma17(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 < 0 || p2 < 0) continue;
    if (p1 + p2 !== 17) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 17, analysis: 14, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 15 — Soma de duas pedras consecutivas igual a 19. Coleta os próximos 14 brancos. */
export function buildASoma19(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 < 0 || p2 < 0) continue;
    if (p1 + p2 !== 19) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 19, analysis: 15, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 16 — Soma de duas pedras consecutivas igual a 21. Coleta os próximos 14 brancos. */
export function buildASoma21(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 < 0 || p2 < 0) continue;
    if (p1 + p2 !== 21) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 21, analysis: 16, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 17 — 1ª Pedra do Minuto 5 (05, 15, 25, 35, 45, 55). Coleta os próximos 14 brancos. */
export function buildA1Minuto5(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 5, 17);
}

/** Análise 18 — 2ª Pedra do Minuto 5 (05, 15, 25, 35, 45, 55). Coleta os próximos 14 brancos. */
export function buildA2Minuto5(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 5, 18);
}

/** Análise 22 — 1ª Pedra do Minuto 1 (01, 11, 21, 31, 41, 51). */
export function buildA1Minuto1(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 1, 22);
}

/** Análise 23 — 2ª Pedra do Minuto 1 (01, 11, 21, 31, 41, 51). */
export function buildA2Minuto1(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 1, 23);
}

/** Análise 24 — 1ª Pedra do Minuto 2 (02, 12, 22, 32, 42, 52). */
export function buildA1Minuto2(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 2, 24);
}

/** Análise 25 — 2ª Pedra do Minuto 2 (02, 12, 22, 32, 42, 52). */
export function buildA2Minuto2(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 2, 25);
}

/** Análise 26 — 1ª Pedra do Minuto 3 (03, 13, 23, 33, 43, 53). */
export function buildA1Minuto3(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 3, 26);
}

/** Análise 27 — 2ª Pedra do Minuto 3 (03, 13, 23, 33, 43, 53). */
export function buildA2Minuto3(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 3, 27);
}

/** Análise 28 — 1ª Pedra do Minuto 4 (04, 14, 24, 34, 44, 54). */
export function buildA1Minuto4(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 4, 28);
}

/** Análise 29 — 2ª Pedra do Minuto 4 (04, 14, 24, 34, 44, 54). */
export function buildA2Minuto4(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 4, 29);
}

/** Análise 30 — 1ª Pedra do Minuto 6 (06, 16, 26, 36, 46, 56). */
export function buildA1Minuto6(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 6, 30);
}

/** Análise 31 — 2ª Pedra do Minuto 6 (06, 16, 26, 36, 46, 56). */
export function buildA2Minuto6(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 6, 31);
}

/** Análise 32 — 1ª Pedra do Minuto 7 (07, 17, 27, 37, 47, 57). */
export function buildA1Minuto7(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 7, 32);
}

/** Análise 33 — 2ª Pedra do Minuto 7 (07, 17, 27, 37, 47, 57). */
export function buildA2Minuto7(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 7, 33);
}

/** Análise 34 — 1ª Pedra do Minuto 8 (08, 18, 28, 38, 48, 58). */
export function buildA1Minuto8(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 8, 34);
}

/** Análise 35 — 2ª Pedra do Minuto 8 (08, 18, 28, 38, 48, 58). */
export function buildA2Minuto8(rows: Row[]): Cycle[] {
  return buildMinuteSecondStone(rows, 8, 35);
}

/** Análise 36 — 1ª Pedra do Minuto 9 (09, 19, 29, 39, 49, 59). */
export function buildA1Minuto9(rows: Row[]): Cycle[] {
  return buildMinuteFirstStone(rows, 9, 36);
}

/**
 * Análise 19 — Padrão 3 Pedras: Pontas Iguais (P1 - P2 - P1, com P2 != P1).
 * Verifica tempo até o branco indexado pela numeração da 1ª e última pedra (P1).
 */
export function buildASandwichPontas(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 2; i < rows.length; i++) {
    const p1 = Number(rows[i - 2].roll);
    const p2 = Number(rows[i - 1].roll);
    const p3 = Number(rows[i].roll);

    if (!Number.isFinite(p1) || !Number.isFinite(p2) || !Number.isFinite(p3)) continue;
    if (p1 < 0 || p1 > 14 || p2 < 0 || p2 > 14 || p3 < 0 || p3 > 14) continue;
    if (p1 !== p3 || p2 === p1) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: p1, analysis: 19, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/**
 * Análise 20 — Padrão 3 Pedras: Pedra do Meio (P1 - P2 - P1, com P2 != P1).
 * Verifica tempo até o branco indexado pela numeração da segunda pedra / recheio (P2).
 */
export function buildASandwichMeio(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 2; i < rows.length; i++) {
    const p1 = Number(rows[i - 2].roll);
    const p2 = Number(rows[i - 1].roll);
    const p3 = Number(rows[i].roll);

    if (!Number.isFinite(p1) || !Number.isFinite(p2) || !Number.isFinite(p3)) continue;
    if (p1 < 0 || p1 > 14 || p2 < 0 || p2 > 14 || p3 < 0 || p3 > 14) continue;
    if (p1 !== p3 || p2 === p1) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: p2, analysis: 20, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 21 — Gatilho 7-11 ou 11-7: [7 -> 11] ou [11 -> 7]. Coleta os próximos 14 brancos. */
export function buildA7_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    const isMatch = (p1 === 7 && p2 === 11) || (p1 === 11 && p2 === 7);
    if (!isMatch) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    out.push({ value: 711, analysis: 21, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/**
 * ALERTA "POSSÍVEL REC": 7-14, 4-7, 5-14
 */
export function buildRecAlerts(
  rows: Row[],
): Array<{ type: string; triggerAt: Date; duration: number }> {
  const alerts: Array<{ type: string; triggerAt: Date; duration: number }> = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    const dt = parseUtcDate(rows[i].created_at);

    if (p1 === 7 && p2 === 14) alerts.push({ type: "7-14", triggerAt: dt, duration: 14 });
    if (p1 === 4 && p2 === 7) alerts.push({ type: "4-7", triggerAt: dt, duration: 9 });
    if (p1 === 5 && p2 === 14) alerts.push({ type: "5-14", triggerAt: dt, duration: 14 });
  }
  return alerts;
}

/**
 * Análises Secundárias (#1 ao #9)
 * Utilizam a mesma lógica da A1 (leitura de pedra vs unidade do minuto),
 * mas deslocadas no tempo conforme a posição no histórico.
 */
export function buildSecondary(rows: Row[], offset: number): Cycle[] {
  const out: Cycle[] = [];
  rows.forEach((r, i) => {
    if (i < offset) return;
    const targetRow = rows[i - offset];
    const n = Number(targetRow.roll);
    if (!Number.isFinite(n) || n < 0 || n > 9) return;

    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    if (dt.getMinutes() % 10 !== n) return;

    out.push({
      value: n,
      analysis: 100 + offset,
      triggerAt: dt,
      gaps: collectGaps(rows, i, dt),
      isSecondary: true,
    });
  });
  return out;
}

export type Group = { m: number; label: string; count: number; pct: number };

/** Top N por presença única de linha, janela (M-1, M, M+1), com dedup. */
export function computeTop(cycles: Cycle[], topN: number): Group[] {
  const rowSets = cycles.map((c) => new Set(c.gaps));
  const totalRows = cycles.length;
  if (!totalRows) return [];
  let maxGap = 0;
  for (const rs of rowSets) for (const v of rs) if (v > maxGap) maxGap = v;

  const candidates: Group[] = [];
  for (let m = 0; m <= maxGap + 1; m++) {
    let hasM = false;
    let hasMinus = false;
    let hasPlus = false;
    let count = 0;
    for (const rs of rowSets) {
      const inM = rs.has(m);
      const inMinus = m > 0 && rs.has(m - 1);
      const inPlus = rs.has(m + 1);
      if (inM || inMinus || inPlus) {
        count++;
        if (inM) hasM = true;
        if (inMinus) hasMinus = true;
        if (inPlus) hasPlus = true;
      }
    }
    if (!count) continue;
    const parts: string[] = [];
    if (hasMinus) parts.push(`${m - 1}`);
    if (hasM) parts.push(`${m}`);
    if (hasPlus) parts.push(`${m + 1}`);
    candidates.push({ m, label: parts.join(" - "), count, pct: (count / totalRows) * 100 });
  }
  candidates.sort((a, b) => b.count - a.count || a.m - b.m);

  const picked: Group[] = [];
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

/** Última ocorrência (ciclo mais recente) por valor, para uma análise. */
export function latestByValue(cycles: Cycle[]): Map<number, Cycle> {
  const map = new Map<number, Cycle>();
  for (const c of cycles) {
    const cur = map.get(c.value);
    if (!cur || c.triggerAt.getTime() > cur.triggerAt.getTime()) map.set(c.value, c);
  }
  return map;
}

export function cyclesOf(cycles: Cycle[], value: number, analysis?: number): Cycle[] {
  return cycles
    .filter((c) => c.value === value && (!analysis || c.analysis === analysis))
    .slice(-MAX_CYCLES);
}

export function fmtClock(d?: Date | string | number | null) {
  if (!d) return "--:--";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Verifica se os últimos dois gatilhos (ou um deles) daquela análise
 * tiveram o mesmo 'value' que o gatilho atual.
 */
export function checkHighTendency(cycles: Cycle[] | undefined | null, value: number): boolean {
  if (!cycles || !Array.isArray(cycles) || cycles.length < 2) return false;
  const penult = cycles[cycles.length - 2];
  const antepenult = cycles[cycles.length - 3];

  return penult?.value === value || antepenult?.value === value;
}
