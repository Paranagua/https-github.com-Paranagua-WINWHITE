import { parseUtcDate } from "./utils";

export interface WhiteFreezeInterval {
  streakCount: number;
  startTime: number; // Timestamp (ms) ao atingir 25 giros sem o "0" (oculta sinais e congela auditor)
  endTime: number; // Timestamp (ms) da quebra do congelamento (saída do "0")
  resumeTime: number; // Timestamp (ms) de quebra + 2 (re-exibição de sinais e retomada do auditor)
  whiteCreatedAt?: string;
  freezeStartedAt?: string;
}

export interface WhiteStreakStatus {
  currentStreak: number;
  isFrozen: boolean;
  freezeStartTime: number | null;
  lastWhiteTime: number | null;
  maxAllowedWithoutWhite: number; // 24 giros sem 0 permitidos; no 25º giro sem 0 congela!
  lastUnfreezeTime: number | null; // Timestamp (ms) da última quebra do congelamento ('0')
  lastResumeTime: number | null; // Timestamp (ms) da reativação (quebra + 2 minutos)
}

/**
 * Verifica se um resultado representa a pedra 0 (branco).
 */
export function isWhiteRound(r: any): boolean {
  if (!r) return false;
  if (r.roll !== undefined && r.roll !== null) {
    const num = Number(r.roll);
    if (!Number.isNaN(num) && num === 0) return true;
    if (String(r.roll).trim() === "0") return true;
  }
  if (r.numero !== undefined && r.numero !== null) {
    const num = Number(r.numero);
    if (!Number.isNaN(num) && num === 0) return true;
  }
  if (r.color !== undefined && r.color !== null) {
    const c = String(r.color).trim().toLowerCase();
    if (c === "white" || c === "0" || c === "branco") return true;
  }
  if (r.cor !== undefined && r.cor !== null) {
    const c = String(r.cor).trim().toLowerCase();
    if (c === "white" || c === "0" || c === "branco" || c === "branca") return true;
  }
  return false;
}

/**
 * Extrai o timestamp em milissegundos UTC de qualquer objeto de rodada.
 */
export function getRoundTimestampMs(r: any): number {
  if (!r) return 0;
  if (typeof r.timestamp === "number" && !Number.isNaN(r.timestamp) && r.timestamp > 0)
    return r.timestamp;
  if (typeof r.created_at === "string") {
    const t = parseUtcDate(r.created_at).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof r.createdAt === "string") {
    const t = parseUtcDate(r.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (typeof r.timestamp === "string") {
    const t = parseUtcDate(r.timestamp).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (r.created_at instanceof Date) {
    const t = r.created_at.getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (r.createdAt instanceof Date) {
    const t = r.createdAt.getTime();
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/**
 * Calcula todas as janelas de congelamento com base na regra:
 * - 25 giros sem o "0": os sinais são ocultados e o painel auditor congelado.
 * - Quando aparece o "0" nos giros: são exclusos os sinais menor igual à quebra do congelamento (<= quebra).
 * - Sinais maior igual à quebra do congelamento + 2 (>= quebra + 2) são re-exibidos.
 * - O painel auditor descongela contando win/loss apenas dos sinais pós descongelamento.
 */
export function computeWhiteFreezeIntervals(rounds: any[]): WhiteFreezeInterval[] {
  if (!Array.isArray(rounds) || rounds.length === 0) return [];

  // Ordena cronologicamente crescente (do mais antigo para o mais recente)
  const sorted = [...rounds].sort((a, b) => getRoundTimestampMs(a) - getRoundTimestampMs(b));

  const intervals: WhiteFreezeInterval[] = [];
  let currentStreak = 0;
  let freezeStartTime: number | null = null;
  let freezeStartedAtIso: string | undefined = undefined;

  for (let i = 0; i < sorted.length; i++) {
    const round = sorted[i];
    const isWhite = isWhiteRound(round);
    const roundTime = getRoundTimestampMs(round);

    if (isWhite) {
      if (freezeStartTime !== null) {
        // Encerra a janela de congelamento: o "0" quebrou o congelamento!
        // Sinais <= quebra são exclusos.
        // Sinais >= quebra + 2 minutos são re-exibidos.
        const whiteMinuteMs = Math.floor(roundTime / 60000) * 60000;
        const resumeTime = whiteMinuteMs + 2 * 60000;

        intervals.push({
          streakCount: currentStreak,
          startTime: freezeStartTime,
          endTime: roundTime,
          resumeTime,
          whiteCreatedAt: round.created_at || round.createdAt || round.timestamp,
          freezeStartedAt: freezeStartedAtIso,
        });
        freezeStartTime = null;
        freezeStartedAtIso = undefined;
      }
      currentStreak = 0;
    } else {
      currentStreak += 1;
      // Regra exata: 25 giros sem o "0", os sinais são ocultados e o painel auditor congelado.
      if (currentStreak === 25) {
        const round24 = sorted[i - 1] || round;
        freezeStartTime = getRoundTimestampMs(round24);
        freezeStartedAtIso = round24.created_at || round24.createdAt || round24.timestamp;
      }
    }
  }

  // Se a mesa ainda estiver atualmente em sequência >= 25 giros sem branco
  if (freezeStartTime !== null) {
    intervals.push({
      streakCount: currentStreak,
      startTime: freezeStartTime,
      endTime: Number.POSITIVE_INFINITY, // Continua congelado até surgir o "0"
      resumeTime: Number.POSITIVE_INFINITY,
      freezeStartedAt: freezeStartedAtIso,
    });
  }

  return intervals;
}

/**
 * Obtém o status em tempo real da sequência atual sem branco na mesa.
 */
export function getCurrentWhiteStreak(rounds: any[]): WhiteStreakStatus {
  const maxAllowedWithoutWhite = 24;
  if (!Array.isArray(rounds) || rounds.length === 0) {
    return {
      currentStreak: 0,
      isFrozen: false,
      freezeStartTime: null,
      lastWhiteTime: null,
      maxAllowedWithoutWhite,
      lastUnfreezeTime: null,
      lastResumeTime: null,
    };
  }

  // Ordena cronologicamente decrescente (do mais recente para o mais antigo)
  const sortedDesc = [...rounds].sort((a, b) => {
    const diff = getRoundTimestampMs(b) - getRoundTimestampMs(a);
    if (diff !== 0) return diff;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  let currentStreak = 0;
  let lastWhiteTime: number | null = null;
  let round24Time: number | null = null;

  for (let i = 0; i < sortedDesc.length; i++) {
    const round = sortedDesc[i];
    if (isWhiteRound(round)) {
      lastWhiteTime = getRoundTimestampMs(round);
      break;
    }
    currentStreak += 1;
    if (currentStreak === 24) {
      round24Time = getRoundTimestampMs(round);
    }
  }

  const intervals = computeWhiteFreezeIntervals(rounds);
  const active = intervals.find((inv) => inv.endTime === Number.POSITIVE_INFINITY);
  const isFrozen = currentStreak >= 25 || !!active;
  const freezeStartTime = isFrozen
    ? (active?.startTime ?? (lastWhiteTime ? lastWhiteTime + 24 * 30000 : null))
    : null;

  const finished = intervals.filter((inv) => inv.endTime !== Number.POSITIVE_INFINITY);
  const lastFinished = finished.length > 0 ? finished[finished.length - 1] : null;

  const lastUnfreezeTime = lastFinished ? lastFinished.endTime : null;
  const lastResumeTime = lastFinished ? lastFinished.resumeTime : null;

  return {
    currentStreak,
    isFrozen,
    freezeStartTime,
    lastWhiteTime,
    maxAllowedWithoutWhite,
    lastUnfreezeTime,
    lastResumeTime,
  };
}

/**
 * Verifica se um sinal cai dentro de uma janela de congelamento ou de exclusão pré-reativação.
 * Retorna true se o sinal deve ser OCULTADO / EXCLUSO.
 * Regra:
 * - Durante congelamento: sinais com horário > startTime são ocultados.
 * - Na quebra do congelamento ("0"): são exclusos sinais <= quebra e sinais < quebra + 2.
 * - Sinais >= quebra + 2 são re-exibidos (retorna false).
 */
export function isSignalInWhiteFreeze(
  signalTimeMs: number,
  intervals: WhiteFreezeInterval[],
): boolean {
  if (!signalTimeMs || !Array.isArray(intervals) || intervals.length === 0) {
    return false;
  }

  for (const interval of intervals) {
    if (interval.endTime === Number.POSITIVE_INFINITY) {
      // Congelamento ativo: qualquer sinal após o início do congelamento fica oculto
      if (signalTimeMs > interval.startTime) {
        return true;
      }
    } else {
      // Quebra do congelamento pelo "0":
      // Sinais <= quebra do congelamento e menores que quebra + 2 são exclusos!
      // Sinais >= quebra + 2 são re-exibidos!
      const resumeThreshold =
        interval.resumeTime !== undefined
          ? interval.resumeTime
          : Math.floor(interval.endTime / 60000) * 60000 + 2 * 60000;

      if (signalTimeMs > interval.startTime && signalTimeMs < resumeThreshold) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verifica se um sinal é elegível para ser contabilizado no painel auditor.
 * Regra:
 * - 25 giros sem o "0": sinais são ocultados e o painel auditor congelado.
 *   O painel auditor para de contar mas NÃO DEVE ZERAR (mantém dados e histórico pré-congelamento).
 * - Quando aparece o "0" nos giros: são exclusos sinais <= quebra, re-exibindo sinais >= quebra + 2,
 *   e o painel auditor descongela contando win/loss apenas dos sinais pós descongelamento.
 */
export function isSignalAuditableAfterFreeze(
  signalTimeMs: number,
  intervals: WhiteFreezeInterval[],
  currentStatus?: WhiteStreakStatus,
): boolean {
  if (!signalTimeMs) return false;

  // 1. Enquanto a mesa estiver congelada (25 giros sem 0):
  // O painel auditor para de contar NOVOS sinais (sinais após o início do congelamento são ignorados),
  // mas NÃO DEVE ZERAR: os sinais concluídos antes do início do congelamento permanecem válidos.
  if (currentStatus?.isFrozen) {
    if (currentStatus.freezeStartTime && signalTimeMs > currentStatus.freezeStartTime) {
      return false;
    }
    return !isSignalInWhiteFreeze(signalTimeMs, intervals);
  }

  // 2. Quando a mesa descongela (aparece o "0"):
  // Sinais dentro do intervalo de congelamento histórico ou no período de exclusão (< quebra + 2)
  // são excluídos (isSignalInWhiteFreeze retorna true).
  // Sinais concluídos antes do congelamento permanecem preservados, e sinais pós-descongelamento
  // (>= quebra + 2) são reativados e contabilizados normalmente.
  if (isSignalInWhiteFreeze(signalTimeMs, intervals)) {
    return false;
  }

  return true;
}

/**
 * Filtra sinais eliminando aqueles que caem em congelamento ou no período de exclusão (< quebra + 2).
 */
export function filterSignalsExcludingWhiteFreeze<
  T extends {
    timestamp?: number;
    time?: string;
    entryDate?: any;
    at?: any;
    targetIso?: string;
    targetTime?: any;
  },
>(signals: T[], intervals: WhiteFreezeInterval[], currentStatus?: WhiteStreakStatus): T[] {
  if (!Array.isArray(signals) || signals.length === 0) return [];

  return signals.filter((sig) => {
    let sigTime = sig.timestamp;
    if (!sigTime && sig.entryDate) {
      sigTime =
        sig.entryDate instanceof Date
          ? sig.entryDate.getTime()
          : parseUtcDate(sig.entryDate).getTime();
    }
    if (!sigTime && sig.at) {
      sigTime = sig.at instanceof Date ? sig.at.getTime() : parseUtcDate(sig.at).getTime();
    }
    if (!sigTime && sig.targetIso) {
      sigTime = parseUtcDate(sig.targetIso).getTime();
    }
    if (!sigTime && sig.targetTime) {
      sigTime =
        typeof sig.targetTime === "number"
          ? sig.targetTime
          : parseUtcDate(sig.targetTime).getTime();
    }

    if (!sigTime) return true;

    // 1. Se estiver em congelamento ativo (25 giros sem 0), oculta todos os sinais posteriores ao início do congelamento
    if (
      currentStatus?.isFrozen &&
      currentStatus.freezeStartTime &&
      sigTime > currentStatus.freezeStartTime
    ) {
      return false;
    }

    // 2. Verifica se o sinal cai em janela de congelamento ou período de exclusão (< quebra + 2)
    if (isSignalInWhiteFreeze(sigTime, intervals)) {
      return false;
    }

    // 3. Se houve descongelamento recente com quebra + 2, exclui sinais menores que quebra + 2
    if (
      currentStatus &&
      !currentStatus.isFrozen &&
      currentStatus.lastResumeTime &&
      sigTime < currentStatus.lastResumeTime &&
      currentStatus.lastUnfreezeTime &&
      sigTime > (currentStatus.freezeStartTime || currentStatus.lastUnfreezeTime - 25 * 30000)
    ) {
      return false;
    }

    return true;
  });
}
