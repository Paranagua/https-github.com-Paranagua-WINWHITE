import { parseUtcDate } from "@/lib/utils";
import { fmtTime, type Color } from "@/components/double/types";
import type { PredictiveSignal } from "@/lib/signalsStore";

export type AuditResultItem = {
  id: string | number;
  roll: number;
  color: Color;
  createdAt: string;
};

export interface SignalAuditInfo {
  signalKey: string;
  targetTime: string; // "14:06"
  targetIso: string;
  windowLabel: string; // "14:05-14:07"
  windowMinutes: string[]; // ["14:05", "14:06", "14:07"]
  checkedResults: number; // total rounds collected in the 3 minutes
  roundsMMinus1: number; // count of distinct rounds in M-1
  roundsM: number; // count of distinct rounds in M
  roundsMPlus1: number; // count of distinct rounds in M+1
  spinsMMinus1Ids: string[];
  spinsMIds: string[];
  spinsMPlus1Ids: string[];
  winningResultId: string | null;
  winningResultRoll: number | null;
  winningResultColor: string | null;
  winningResultTime: string | null;
  winningResultCreatedAt: string | null;
  outcome: "WIN" | "LOSS" | "PENDING";
  isComplete6Rounds: boolean;
  auditedAt: number;
}

export interface ValidationOutcome {
  outcome: "pending" | "green" | "red";
  resultTime?: string;
  completedAt?: number;
  winningResultId?: string | null;
  audit: SignalAuditInfo;
  hasChanged: boolean;
}

/**
 * Deduplica uma lista de resultados garantindo unicidade por id.
 */
export function deduplicateResults<T extends { id: string | number }>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || item.id === undefined || item.id === null) continue;
    const idStr = String(item.id);
    if (seen.has(idStr)) continue;
    seen.add(idStr);
    out.push(item);
  }
  return out;
}

/**
 * Validação rigorosa de sinal com base nas regras:
 * 1. Cada minuto possui exatamente 2 rodadas.
 * 2. Janela de validação: M-1, M, M+1 (3 minutos -> exatamente 6 rodadas).
 * 3. Baseado no minuto exato do timestamp real da rodada (SEM tolerância de segundos).
 * 4. Qualquer branco nas rodadas de M-1, M ou M+1 -> WIN imediato.
 * 5. Se as 6 rodadas forem confirmadas (>= 2 em M-1, >= 2 em M, >= 2 em M+1) e nenhum branco -> LOSS.
 * 6. Enquanto as 6 rodadas não estiverem completas e sem branco -> PENDING.
 * 7. Imutabilidade: WIN e LOSS nunca mudam de estado após concluídos.
 */
export function auditSignalWithRounds(
  signal: PredictiveSignal,
  rawResults: AuditResultItem[],
): ValidationOutcome {
  const now = Date.now();

  // Se o sinal já está concluído como WIN ou LOSS, respeita a imutabilidade absoluta
  if (signal.outcome === "green" || signal.outcome === "red") {
    return {
      outcome: signal.outcome,
      resultTime: signal.resultTime,
      completedAt: signal.completedAt || now,
      winningResultId: signal.winningResultId || null,
      audit: signal.audit || {
        signalKey: signal.key,
        targetTime: signal.time,
        targetIso:
          signal.entryDate instanceof Date
            ? signal.entryDate.toISOString()
            : String(signal.entryDate || ""),
        windowLabel: "--",
        windowMinutes: [],
        checkedResults: 0,
        roundsMMinus1: 0,
        roundsM: 0,
        roundsMPlus1: 0,
        spinsMMinus1Ids: [],
        spinsMIds: [],
        spinsMPlus1Ids: [],
        winningResultId: signal.winningResultId || null,
        winningResultRoll: null,
        winningResultColor: null,
        winningResultTime: signal.resultTime || null,
        winningResultCreatedAt: null,
        outcome: signal.outcome === "green" ? "WIN" : "LOSS",
        isComplete6Rounds: true,
        auditedAt: signal.completedAt || now,
      },
      hasChanged: false,
    };
  }

  // 1. Obter timestamp da data alvo do sinal
  const entryDateObj =
    signal.entryDate instanceof Date
      ? signal.entryDate
      : typeof signal.entryDate === "string"
        ? parseUtcDate(signal.entryDate)
        : new Date(signal.entryDate || 0);

  const entryTime = entryDateObj.getTime();
  if (Number.isNaN(entryTime)) {
    return {
      outcome: "pending",
      audit: {
        signalKey: signal.key,
        targetTime: signal.time,
        targetIso: "",
        windowLabel: "--",
        windowMinutes: [],
        checkedResults: 0,
        roundsMMinus1: 0,
        roundsM: 0,
        roundsMPlus1: 0,
        spinsMMinus1Ids: [],
        spinsMIds: [],
        spinsMPlus1Ids: [],
        winningResultId: null,
        winningResultRoll: null,
        winningResultColor: null,
        winningResultTime: null,
        winningResultCreatedAt: null,
        outcome: "PENDING",
        isComplete6Rounds: false,
        auditedAt: now,
      },
      hasChanged: false,
    };
  }

  // 2. Calcular o início dos 3 minutos exatos (M-1, M, M+1)
  const minuteMStart = Math.floor(entryTime / 60_000) * 60_000;
  const minuteMMinus1Start = minuteMStart - 60_000;
  const minuteMPlus1Start = minuteMStart + 60_000;

  const minMMinus1Label = fmtTime(new Date(minuteMMinus1Start));
  const minMLabel = fmtTime(new Date(minuteMStart));
  const minMPlus1Label = fmtTime(new Date(minuteMPlus1Start));
  const windowLabel = `${minMMinus1Label}-${minMPlus1Label}`;

  // 3. Deduplicar os resultados reais
  const uniqueResults = deduplicateResults(rawResults);

  // 4. Classificar cada rodada estritamente no seu minuto real (sem tolerância de segundos)
  const spinsMMinus1: AuditResultItem[] = [];
  const spinsM: AuditResultItem[] = [];
  const spinsMPlus1: AuditResultItem[] = [];

  for (const r of uniqueResults) {
    if (!r || !r.createdAt) continue;
    const rDate = parseUtcDate(r.createdAt);
    const rTime = rDate.getTime();
    if (Number.isNaN(rTime)) continue;

    // Minuto exato do timestamp da rodada
    const rMinute = Math.floor(rTime / 60_000) * 60_000;

    if (rMinute === minuteMMinus1Start) {
      spinsMMinus1.push(r);
    } else if (rMinute === minuteMStart) {
      spinsM.push(r);
    } else if (rMinute === minuteMPlus1Start) {
      spinsMPlus1.push(r);
    }
  }

  // Ordenar cada minuto cronologicamente crescente
  const sortByTimeAsc = (a: AuditResultItem, b: AuditResultItem) =>
    parseUtcDate(a.createdAt).getTime() - parseUtcDate(b.createdAt).getTime();

  spinsMMinus1.sort(sortByTimeAsc);
  spinsM.sort(sortByTimeAsc);
  spinsMPlus1.sort(sortByTimeAsc);

  const allWindowSpins = [...spinsMMinus1, ...spinsM, ...spinsMPlus1];
  const totalChecked = allWindowSpins.length;

  // 5. Verificar se algum dos resultados é branco/0
  const isWhite = (r: AuditResultItem) => Number(r.roll) === 0 || r.color === "white";
  const winningSpin = allWindowSpins.find(isWhite);

  const has2RoundsMMinus1 = spinsMMinus1.length >= 2;
  const has2RoundsM = spinsM.length >= 2;
  const has2RoundsMPlus1 = spinsMPlus1.length >= 2;
  const isComplete6Rounds = has2RoundsMMinus1 && has2RoundsM && has2RoundsMPlus1;

  let outcome: "pending" | "green" | "red" = "pending";
  let resultTime: string | undefined = undefined;
  let winningResultId: string | null = null;
  let winningResultRoll: number | null = null;
  let winningResultColor: string | null = null;
  let winningResultCreatedAt: string | null = null;

  const windowEndTime = minuteMPlus1Start + 60_000;
  const isTimePastWindow = now >= windowEndTime + 30_000;
  const hasSpinsAfterWindow = uniqueResults.some((r) => {
    const t = parseUtcDate(r.createdAt).getTime();
    return !Number.isNaN(t) && t >= windowEndTime;
  });

  if (winningSpin) {
    // WIN: Qualquer branco ocorrido na janela (mesmo antes das 6 rodadas)
    outcome = "green";
    resultTime = fmtTime(winningSpin.createdAt);
    winningResultId = String(winningSpin.id);
    winningResultRoll = Number(winningSpin.roll);
    winningResultColor = winningSpin.color;
    winningResultCreatedAt = winningSpin.createdAt;
  } else if (isComplete6Rounds || isTimePastWindow || hasSpinsAfterWindow) {
    // LOSS: Somente quando todas as rodadas forem confirmadas OU a janela de tempo já passou sem nenhum branco
    outcome = "red";
  } else {
    // PENDING: Faltam rodadas para completar as 6 e nenhum branco saiu até o momento
    outcome = "pending";
  }

  const audit: SignalAuditInfo = {
    signalKey: signal.key,
    targetTime: signal.time,
    targetIso: entryDateObj.toISOString(),
    windowLabel,
    windowMinutes: [minMMinus1Label, minMLabel, minMPlus1Label],
    checkedResults: totalChecked,
    roundsMMinus1: spinsMMinus1.length,
    roundsM: spinsM.length,
    roundsMPlus1: spinsMPlus1.length,
    spinsMMinus1Ids: spinsMMinus1.map((s) => String(s.id)),
    spinsMIds: spinsM.map((s) => String(s.id)),
    spinsMPlus1Ids: spinsMPlus1.map((s) => String(s.id)),
    winningResultId,
    winningResultRoll,
    winningResultColor,
    winningResultTime: resultTime || null,
    winningResultCreatedAt,
    outcome: outcome === "green" ? "WIN" : outcome === "red" ? "LOSS" : "PENDING",
    isComplete6Rounds,
    auditedAt: now,
  };

  const hasChanged = outcome !== "pending" && outcome !== signal.outcome;

  return {
    outcome,
    resultTime,
    completedAt: outcome !== "pending" ? signal.completedAt || now : undefined,
    winningResultId,
    audit,
    hasChanged,
  };
}
