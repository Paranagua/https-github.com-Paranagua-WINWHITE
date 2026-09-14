import { parseUtcDate } from "./utils";

export interface WhiteFreezeInterval {
  streakCount: number;
  startTime: number; // Timestamp (ms) do 24º giro sem branco
  endTime: number; // Timestamp (ms) do branco que reativou o sistema, ou Infinity se ainda ativo
  whiteCreatedAt?: string;
  freezeStartedAt?: string;
}

export interface WhiteStreakStatus {
  currentStreak: number;
  isFrozen: boolean;
  freezeStartTime: number | null;
  lastWhiteTime: number | null;
  maxAllowedWithoutWhite: number;
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
  if (typeof r.timestamp === "number" && r.timestamp > 0) return r.timestamp;
  if (typeof r.created_at === "string") {
    return parseUtcDate(r.created_at).getTime();
  }
  if (typeof r.createdAt === "string") {
    return parseUtcDate(r.createdAt).getTime();
  }
  if (typeof r.timestamp === "string") {
    return parseUtcDate(r.timestamp).getTime();
  }
  if (r.created_at instanceof Date) {
    return r.created_at.getTime();
  }
  return 0;
}

/**
 * Calcula todas as janelas históricas e ativas de congelamento (> 24 giros sem branco).
 * Regra: Quando tem uma sequência com mais de 24 giros sem o "0" (branco),
 * os sinais com horário posterior a esses giros são ocultos e param de contabilizar
 * no painel de auditoria/validador. A reativação total só acontece quando aparece um "0" (branco).
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
        // Encerra a janela de congelamento: o branco reativa totalmente o sistema!
        intervals.push({
          streakCount: currentStreak,
          startTime: freezeStartTime,
          endTime: roundTime,
          whiteCreatedAt: round.created_at || round.createdAt || round.timestamp,
          freezeStartedAt: freezeStartedAtIso,
        });
        freezeStartTime = null;
        freezeStartedAtIso = undefined;
      }
      currentStreak = 0;
    } else {
      currentStreak += 1;
      // Quando atinge o 25º giro sem branco, excedeu 24 giros (sequência com mais de 24 giros sem o 0).
      // Os sinais com horário posterior a esses 24 giros ficam congelados.
      if (currentStreak === 25) {
        // O 24º giro sem branco é o round anterior (i - 1)
        const round24 = sorted[i - 1] || round;
        freezeStartTime = getRoundTimestampMs(round24);
        freezeStartedAtIso = round24.created_at || round24.createdAt || round24.timestamp;
      }
    }
  }

  // Se a mesa ainda estiver atualmente em sequência > 24 giros sem branco
  if (freezeStartTime !== null) {
    intervals.push({
      streakCount: currentStreak,
      startTime: freezeStartTime,
      endTime: Number.POSITIVE_INFINITY, // Continua congelado até surgir o próximo branco
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
    };
  }

  // Ordena cronologicamente decrescente (do mais recente para o mais antigo)
  const sortedDesc = [...rounds].sort((a, b) => getRoundTimestampMs(b) - getRoundTimestampMs(a));

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

  const isFrozen = currentStreak > maxAllowedWithoutWhite;
  const freezeStartTime = isFrozen
    ? round24Time || (lastWhiteTime ? lastWhiteTime + 24 * 30000 : null)
    : null;

  return {
    currentStreak,
    isFrozen,
    freezeStartTime,
    lastWhiteTime,
    maxAllowedWithoutWhite,
  };
}

/**
 * Verifica se um sinal cai dentro de uma janela de congelamento (> 24 giros sem branco).
 * @param signalTimeMs Timestamp em milissegundos UTC do sinal (ou horário previsto de entrada)
 * @param intervals Lista de intervalos calculados por `computeWhiteFreezeIntervals`
 */
export function isSignalInWhiteFreeze(
  signalTimeMs: number,
  intervals: WhiteFreezeInterval[],
): boolean {
  if (!signalTimeMs || !Array.isArray(intervals) || intervals.length === 0) {
    return false;
  }

  for (const interval of intervals) {
    // Sinais com horário posterior aos 24 giros sem branco e até a saída do branco reativador
    if (signalTimeMs > interval.startTime && signalTimeMs <= interval.endTime) {
      return true;
    }
  }

  return false;
}

/**
 * Filtra sinais eliminando aqueles que caem em sequências de mais de 24 giros sem branco.
 */
export function filterSignalsExcludingWhiteFreeze<
  T extends {
    timestamp?: number;
    time?: string;
    entryDate?: any;
    at?: any;
    targetIso?: string;
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

    if (!sigTime) return true;

    // 1. Verifica contra todos os intervalos calculados (históricos e ativos)
    if (isSignalInWhiteFreeze(sigTime, intervals)) {
      return false;
    }

    // 2. Se a mesa estiver congelada atualmente e o sinal for posterior ao 24º giro
    if (
      currentStatus?.isFrozen &&
      currentStatus.freezeStartTime &&
      sigTime > currentStatus.freezeStartTime
    ) {
      return false;
    }

    return true;
  });
}
