/**
 * Motor Preditivo FreitasWhite
 * Arquitetura Unificada: 7 Análises, Limites de 14 tempos, 120 min timeout, Janela de 6 Gatilhos.
 */
import { parseUtcDate } from "@/lib/utils";
export type Row = { id: number; roll: string; color: string; created_at: string };

export type RecAlert = { type: string; triggerAt: Date; duration: number };

export type Cycle = {
  value: number;
  analysis: 1 | 2 | 3 | 4 | 5 | 6 | 7 | number; // 1-7 main, 100+ secondary
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

/** Análise 2 — pedras iguais consecutivas (0..14), gatilho na segunda. */
export function buildA2(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = Number(rows[i - 1].roll);
    const cur = Number(rows[i].roll);
    if (!Number.isFinite(cur) || cur < 0 || cur > 14 || cur !== prev) continue;
    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;
    out.push({ value: cur, analysis: 2, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 3 — repetição consecutiva (0..9) com unidade do minuto casada. */
export function buildA3(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = Number(rows[i - 1].roll);
    const cur = Number(rows[i].roll);
    if (!Number.isFinite(cur) || cur < 0 || cur > 9 || cur !== prev) continue;
    const dtPrev = parseUtcDate(rows[i - 1].created_at);
    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime()) || Number.isNaN(dtPrev.getTime())) continue;
    if (dtPrev.getMinutes() % 10 !== cur && dt.getMinutes() % 10 !== cur) continue;
    out.push({ value: cur, analysis: 3, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 4 — Primeira Pedra da Dezena (virada do minuto 00, 10, 20, 30, 40, 50). */
export function buildA4(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    // Gatilho: minutos terminados em 0 (00, 10, 20, 30, 40, 50)
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

/** Análise 5 — Segunda Pedra da Dezena (virada do minuto 00, 10, 20, 30, 40, 50). */
export function buildA5(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  const processedKeys = new Set<string>();

  // Dicionário para contar pedras no mesmo minuto
  const minuteCounts = new Map<string, number>();

  rows.forEach((r, i) => {
    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    const minutes = dt.getMinutes();
    if (minutes % 10 !== 0) return;

    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${minutes}`;
    const count = (minuteCounts.get(key) || 0) + 1;
    minuteCounts.set(key, count);

    // Gatilho apenas na SEGUNDA pedra enviada no minuto
    if (count !== 2) return;
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const n = Number(r.roll);
    if (!Number.isFinite(n) || n < 0 || n > 14) return;

    out.push({ value: n, analysis: 5, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  });
  return out;
}

/** Análise 6 (O Pão) — Padrão Sanduíche (A - B - A) focando no alinhamento das pontas A. */
export function buildA6(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 2; i < rows.length; i++) {
    const a1 = Number(rows[i - 2].roll);
    const a2 = Number(rows[i].roll);
    if (!Number.isFinite(a1) || !Number.isFinite(a2) || a1 !== a2 || a1 < 0 || a1 > 14) continue;
    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;
    out.push({ value: a2, analysis: 6, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/** Análise 7 (A Carne) — Padrão Sanduíche (A - B - A) focando na reação da pedra B recheio. */
export function buildA7(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 2; i < rows.length; i++) {
    const a1 = Number(rows[i - 2].roll);
    const b = Number(rows[i - 1].roll);
    const a2 = Number(rows[i].roll);
    if (
      !Number.isFinite(a1) ||
      !Number.isFinite(a2) ||
      !Number.isFinite(b) ||
      a1 !== a2 ||
      b < 0 ||
      b > 14
    )
      continue;
    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;
    out.push({ value: b, analysis: 7, triggerAt: dt, gaps: collectGaps(rows, i, dt) });
  }
  return out;
}

/**
 * ESTRATÉGIA A8 - BRANCO DUPLO (Gatilho: 2 Brancos Seguidos - ⚪⚪)
 * Gatilhos G1-G6 baseados em hora/minuto e pedras adjacentes.
 * Delta = G6 + G4 + G5
 */
export function buildA8(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  // Percorremos o histórico procurando por dois brancos seguidos
  for (let i = 2; i < rows.length - 1; i++) {
    const b1 = Number(rows[i - 1].roll);
    const b2 = Number(rows[i].roll);
    if (b1 !== 0 || b2 !== 0) continue;

    const dt1 = parseUtcDate(rows[i - 1].created_at);
    const dt2 = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt1.getTime()) || Number.isNaN(dt2.getTime())) continue;

    const g1 = dt1.getHours();
    const g2 = dt1.getMinutes();
    const g3 = dt2.getMinutes();
    const g4 = Number(rows[i - 2].roll); // Pedra anterior ao 1º branco
    const g5 = Number(rows[i + 1].roll); // Pedra posterior ao 2º branco
    const g6 = g1 + g2 + g3; // Soma Temporal

    if (!Number.isFinite(g4) || !Number.isFinite(g5)) continue;

    const delta = g6 + g4 + g5;

    // Projeção: Horário Alvo = Timestamp do 2º Branco + deltaMinutes.
    // Usamos 'gaps' para transportar o delta para o motor.
    out.push({
      value: 0,
      analysis: 8,
      triggerAt: dt2,
      gaps: [delta],
    });
  }
  return out;
}

/**
 * GATILHO 8-11: [8 -> 11]
 * Soma(Ant1 + Ant2) + Minuto da pedra 8
 */
export function buildA8_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 3; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (p1 !== 8 || p2 !== 11) continue;

    const dt8 = parseUtcDate(rows[i - 1].created_at);
    if (Number.isNaN(dt8.getTime())) continue;

    const ant1 = Number(rows[i - 2].roll); // Pedra anterior ao 8
    const ant2 = Number(rows[i - 3].roll); // Pedra anterior à pedra anterior ao 8
    if (!Number.isFinite(ant1) || !Number.isFinite(ant2)) continue;

    const delta = ant1 + ant2;
    out.push({ value: 811, analysis: 10, triggerAt: dt8, gaps: [delta] });
  }
  return out;
}

/**
 * GATILHO 11-11: [11 -> 11]
 * Soma(Ant1 + Ant2 + Post1 + Post2) + Minuto da 1ª 11 + 10
 */
export function buildA11_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 3; i < rows.length - 2; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (p1 !== 11 || p2 !== 11) continue;

    const dt11_1 = parseUtcDate(rows[i - 1].created_at);
    if (Number.isNaN(dt11_1.getTime())) continue;

    const a1 = Number(rows[i - 2].roll); // Ant 1
    const a2 = Number(rows[i - 3].roll); // Ant 2
    const post1 = Number(rows[i + 1].roll);
    const post2 = Number(rows[i + 2].roll);
    if (
      !Number.isFinite(a1) ||
      !Number.isFinite(a2) ||
      !Number.isFinite(post1) ||
      !Number.isFinite(post2)
    )
      continue;

    const delta = a1 + a2 + post1 + post2 + 10;
    out.push({ value: 1111, analysis: 11, triggerAt: dt11_1, gaps: [delta] });
  }
  return out;
}

/**
 * GATILHO 4-11: [4 -> 11]
 * Minuto da pedra 4 + 5
 */
export function buildA4_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    if (p1 !== 4 || p2 !== 11) continue;

    const dt4 = parseUtcDate(rows[i - 1].created_at);
    if (Number.isNaN(dt4.getTime())) continue;

    out.push({ value: 411, analysis: 12, triggerAt: dt4, gaps: [5] });
  }
  return out;
}

/**
 * GATILHO 4-14 ou 14-4: [4 -> 14] ou [14 -> 4]
 * Minuto da 2ª pedra + 1
 */
export function buildA4_14(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    const isMatch = (p1 === 4 && p2 === 14) || (p1 === 14 && p2 === 4);
    if (!isMatch) continue;

    const dt2 = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt2.getTime())) continue;

    out.push({ value: 414, analysis: 13, triggerAt: dt2, gaps: [1] });
  }
  return out;
}

/**
 * GATILHO 7-11 ou 11-7: [7 -> 11] ou [11 -> 7]
 * Minuto da 1ª pedra + 5 -> SELO VERDE
 */
export function buildA7_11(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const p1 = Number(rows[i - 1].roll);
    const p2 = Number(rows[i].roll);
    const isMatch = (p1 === 7 && p2 === 11) || (p1 === 11 && p2 === 7);
    if (!isMatch) continue;

    const dt1 = parseUtcDate(rows[i - 1].created_at);
    if (Number.isNaN(dt1.getTime())) continue;

    out.push({ value: 711, analysis: 20711, triggerAt: dt1, gaps: [5] });
  }
  return out;
}

/** Análise 14 — Soma de duas pedras consecutivas igual a 17 (0..14). Coleta os próximos 14 brancos. */
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

/** Análise 15 — Soma de duas pedras consecutivas igual a 19 (0..14). Coleta os próximos 14 brancos. */
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

/** Análise 16 — Soma de duas pedras consecutivas igual a 21 (0..14). Coleta os próximos 14 brancos. */
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

/** Análise 17 — 1ª Pedra do Minuto 5 (virada dos minutos 05, 15, 25, 35, 45, 55). Coleta os próximos 14 brancos. */
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

/** Análise 18 — 2ª Pedra do Minuto 5 (minutos 05, 15, 25, 35, 45, 55). Coleta os próximos 14 brancos. */
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

    // Gatilho apenas na SEGUNDA pedra enviada no minuto
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
 * ESTRATÉGIA A9 - PÃO DE BRANCO (Gatilho: Branco + Cor Normal + Branco - ⚪🔴⚪)
 * Gatilhos G1-G6 com peso fixo 30 e pedra "Carne".
 * Delta = 30 + G2 + G3 + G4
 */
export function buildA9(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 2; i < rows.length - 2; i++) {
    const b1 = Number(rows[i - 1].roll);
    const carne = Number(rows[i].roll);
    const b2 = Number(rows[i + 1].roll);

    // Gatilho: Branco + Cor Normal + Branco
    if (b1 !== 0 || b2 !== 0 || carne === 0) continue;

    const dtCarne = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dtCarne.getTime())) continue;

    const g1 = 30; // Peso_Pães (fixo 30)
    const g2 = carne; // Pedra_Carne
    const g3 = Number(rows[i - 2].roll); // Pedra_Antes (anterior ao 1º pão)
    const g4 = Number(rows[i + 2].roll); // Pedra_Depois (posterior ao 2º pão)
    // G5 seria o timestamp da carne, G6 a soma. Seguimos a fórmula do delta:

    if (!Number.isFinite(g3) || !Number.isFinite(g4)) continue;

    const delta = g1 + g2 + g3 + g4;

    // Projeção: Horário Alvo = Timestamp da Carne + deltaMinutes.
    out.push({
      value: carne,
      analysis: 9,
      triggerAt: dtCarne,
      gaps: [delta],
    });
  }
  return out;
}

/**
 * Análises Secundárias (#1 ao #9)
 * Utilizam a mesma lógica da A1 (leitura de pedra vs unidade do minuto),
 * mas deslocadas no tempo conforme a posição no histórico.
 */

/**
 * ESTRATÉGIA DE CONFIRMAÇÃO - SELO VERDE
 * Gatilho: Pedra_Anterior >= 2 E Soma(Pedra_A + Pedra_B) in [17, 19, 21]
 */
export function buildSeloVerde(rows: Row[]): Cycle[] {
  const out: Cycle[] = [];
  for (let i = 2; i < rows.length; i++) {
    const pAnt = Number(rows[i - 2].roll);
    const pA = Number(rows[i - 1].roll);
    const pB = Number(rows[i].roll);

    if (!Number.isFinite(pAnt) || !Number.isFinite(pA) || !Number.isFinite(pB)) continue;

    // Filtro de Segurança removido conforme solicitação
    // if (pAnt < 2) continue;

    const soma = pA + pB;
    if (![17, 18, 19, 21].includes(soma)) continue;

    const dt = parseUtcDate(rows[i].created_at);
    if (Number.isNaN(dt.getTime())) continue;

    // Selo Verde usa gaps[0] para pular casas (Pedra_Anterior)
    out.push({
      value: soma,
      analysis: 200 + soma, // Tag única: 217, 219, 221
      triggerAt: dt,
      gaps: [pAnt], // casas a pular
      isSecondary: false,
    });
  }
  return out;
}

export function buildSecondary(rows: Row[], offset: number): Cycle[] {
  const out: Cycle[] = [];
  // offset 1-9 representa a posição no histórico
  // Aqui interpretamos como: a pedra que saiu a 'offset' rodadas atrás
  // deve casar com o minuto em que saiu.
  rows.forEach((r, i) => {
    if (i < offset) return;
    const targetRow = rows[i - offset];
    const n = Number(targetRow.roll);
    if (!Number.isFinite(n) || n < 0 || n > 9) return;

    const dt = parseUtcDate(r.created_at);
    if (Number.isNaN(dt.getTime())) return;

    // Mesma lógica do #0: se a unidade do minuto casa com a pedra
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
