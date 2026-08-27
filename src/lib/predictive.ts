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
export const MAX_CYCLES = 6;
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

/** Análise 1 — pedra (0..9) sai em minuto cuja unidade == pedra. */
export function buildA1(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  rows.forEach((r, i) => {
    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 9) return;
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;
    if (dt.getMinutes() % 10 !== n) return;
    out.push({ value: n, analysis: 1, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
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
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();
  const minuteCounts = new Map<string, number>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== 9) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    const count = (minuteCounts.get(key) || 0) + 1;
    minuteCounts.set(key, count);

    if (count !== 2) return;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: 3, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
}

/** Análise 4 — 1ª Pedra do Minuto 0 (00, 10, 20, 30, 40, 50). */
export function buildA4(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== 0) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: 4, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
}

/** Análise 5 — 2ª Pedra do Minuto 0 (00, 10, 20, 30, 40, 50). */
export function buildA5(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();
  const minuteCounts = new Map<string, number>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== 0) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    const count = (minuteCounts.get(key) || 0) + 1;
    minuteCounts.set(key, count);

    if (count !== 2) return;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: 5, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
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
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== 5) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: 17, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
}

/** Análise 18 — 2ª Pedra do Minuto 5 (05, 15, 25, 35, 45, 55). Coleta os próximos 14 brancos. */
export function buildA2Minuto5(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();
  const minuteCounts = new Map<string, number>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== 5) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    const count = (minuteCounts.get(key) || 0) + 1;
    minuteCounts.set(key, count);

    if (count !== 2) return;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: 18, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
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
