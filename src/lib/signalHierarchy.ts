import { fmtClock } from "@/lib/predictive";
import { parseUtcDate } from "@/lib/utils";
import type { PredictiveSignal, StoredSignal } from "@/lib/signalsStore";
import type { AuditResultItem } from "@/lib/signalAuditEngine";

/**
 * Hierarquia estrita e monotônica dos sinais (do mais fraco ao mais forte):
 * 1. 🥉 Top 3 (top3_only)
 * 2. 🥇 Top 1 (top1_isolated)
 * 3. ⚡ Top 1 & Top 3 (top1_top3)
 * 4. 💎 Raro (rare)
 * 5. 👑 Supremo (supreme)
 * 6. 🚀 Alavancagem (alavancagem)
 */
export enum SignalRank {
  TOP3 = 1,
  TOP1 = 2,
  TOP1_TOP3 = 3,
  RARE = 4,
  SUPREME = 5,
  ALAVANCAGEM = 6,
}

export type SignalCategory =
  "top3_only" | "top1_isolated" | "top1_top3" | "rare" | "supreme" | "alavancagem";

export interface SignalLevelEvaluation {
  rank: SignalRank;
  category: SignalCategory;
  groupName: string;
  label: string;
  medal: string;
  isAlavancagem: boolean;
  isSupreme: boolean;
  isRare: boolean;
  isTop1: boolean;
}

/**
 * Retorna a chave canônica e estável para um horário alvo de sinal.
 * Ex: 12:12:00 -> "sig-1772194320000"
 */
export function getCanonicalSignalKey(entryDate: Date | string | number): string {
  const dt =
    entryDate instanceof Date
      ? entryDate
      : typeof entryDate === "string"
        ? parseUtcDate(entryDate)
        : new Date(entryDate);
  const t = dt.getTime();
  if (Number.isNaN(t)) return `sig-${Date.now()}`;
  const minuteStart = Math.floor(t / 60_000) * 60_000;
  return `sig-${minuteStart}`;
}

/**
 * Obtém o ranking numérico (1 a 6) de um sinal ou categoria.
 */
export function getSignalRank(sig?: Partial<PredictiveSignal> | string | null): SignalRank {
  if (!sig) return SignalRank.TOP1;

  if (typeof sig === "string") {
    const cat = sig.toLowerCase();
    if (cat.includes("alavanc")) return SignalRank.ALAVANCAGEM;
    if (cat.includes("suprem") || cat.includes("winn")) return SignalRank.SUPREME;
    if (cat.includes("rare") || cat.includes("raro")) return SignalRank.RARE;
    if (cat.includes("top1_top3") || cat.includes("top1_top5")) return SignalRank.TOP1_TOP3;
    if (cat.includes("top3") || cat.includes("top5")) return SignalRank.TOP3;
    return SignalRank.TOP1;
  }

  if (sig.isAlavancagem) return SignalRank.ALAVANCAGEM;
  if (sig.isSupreme) return SignalRank.SUPREME;
  if (sig.isRare) return SignalRank.RARE;

  const cat = (sig.category || "").toLowerCase();
  const label = (sig.label || "").toUpperCase();
  const conf = (sig.confluence || "").toUpperCase();

  const top1Sources = (sig.sources || []).filter((s: any) => !s.top3 && !s.top5);
  const top3Sources = (sig.sources || []).filter((s: any) => s.top3 || s.top5);
  const distinctTop1 = new Set(top1Sources.map((s: any) => s.analysis));

  // 1. 🚀 Alavancagem (4+ Top 1 confluentes)
  if (
    distinctTop1.size >= 4 ||
    cat.includes("alavanc") ||
    label.includes("ALAVANC") ||
    conf.includes("ALAVANC")
  ) {
    return SignalRank.ALAVANCAGEM;
  }

  // 2. 👑 Supremo (2+ Top 1 E 1+ Top 3)
  if (
    (distinctTop1.size >= 2 && top3Sources.length >= 1) ||
    cat.includes("suprem") ||
    cat.includes("winn") ||
    label.includes("SUPREM") ||
    conf.includes("SUPREM") ||
    label.includes("WINN")
  ) {
    return SignalRank.SUPREME;
  }

  // 3. 💎 Raro (2+ Top 1)
  if (
    distinctTop1.size >= 2 ||
    cat.includes("rare") ||
    cat.includes("raro") ||
    label.includes("RARO") ||
    conf.includes("RARO")
  ) {
    return SignalRank.RARE;
  }

  // 4. ⚡ Top 1 & Top 3 (1 Top 1 E 1+ Top 3)
  if (
    (distinctTop1.size === 1 && top3Sources.length >= 1) ||
    cat.includes("top1_top3") ||
    cat.includes("top1_top5") ||
    label.includes("TOP 1 & TOP 3") ||
    label.includes("TOP 1 & 3")
  ) {
    return SignalRank.TOP1_TOP3;
  }

  // 5. 🥇 Top 1 (1 Top 1 isolado)
  if (
    distinctTop1.size >= 1 ||
    cat.includes("top1_isolated") ||
    sig.isTop1 === true ||
    label.includes("TOP 1")
  ) {
    return SignalRank.TOP1;
  }

  // 6. 🥉 Top 3 (Apenas Top 3)
  if (
    cat.includes("top3") ||
    cat.includes("top5") ||
    sig.isTop1 === false ||
    (distinctTop1.size === 0 && top3Sources.length > 0) ||
    label.includes("TOP 3")
  ) {
    return SignalRank.TOP3;
  }

  return SignalRank.TOP1;
}

/**
 * Avalia o nível mais forte possível de um sinal com base em suas fontes Top 1 e Top 3.
 */
export function evaluateSignalLevel(
  top1Sources: Array<{ analysis: number; value: number; pct?: number }>,
  top3Sources: Array<{ analysis: number; value: number; pct?: number }>,
  options?: {
    isConsecutive?: boolean;
    levelOffset?: number;
    forcedAlavancagem?: boolean;
    forcedSupreme?: boolean;
    forcedRare?: boolean;
  },
): SignalLevelEvaluation {
  const distinctTop1 = new Set(top1Sources.map((s) => s.analysis));
  const distinctTop3 = new Set(top3Sources.map((s) => s.analysis));

  // 🚀 ALAVANCAGEM: 4+ Top 1
  if (distinctTop1.size >= 4 || options?.forcedAlavancagem) {
    return {
      rank: SignalRank.ALAVANCAGEM,
      category: "alavancagem",
      groupName: "Alavancagem",
      label: "Alavancagem",
      medal: `🚀 ALAVANCAGEM (${distinctTop1.size}x Top 1)`,
      isAlavancagem: true,
      isSupreme: true,
      isRare: true,
      isTop1: true,
    };
  }

  // 👑 SUPREMO: 2+ Top 1 E 1+ Top 3 (ou Super Confluência)
  if ((distinctTop1.size >= 2 && top3Sources.length >= 1) || options?.forcedSupreme) {
    return {
      rank: SignalRank.SUPREME,
      category: "supreme",
      groupName: "Supremo",
      label: "Supremo",
      medal: "🏆 WINN Supremo",
      isAlavancagem: false,
      isSupreme: true,
      isRare: true,
      isTop1: true,
    };
  }

  // 💎 RARO: 2+ Top 1
  if (distinctTop1.size >= 2 || options?.forcedRare) {
    return {
      rank: SignalRank.RARE,
      category: "rare",
      groupName: "Raro",
      label: "Raro",
      medal: `💎 Raro (${distinctTop1.size}x Top 1)`,
      isAlavancagem: false,
      isSupreme: false,
      isRare: true,
      isTop1: true,
    };
  }

  // ⚡ TOP 1 & TOP 3: 1 Top 1 E 1+ Top 3
  if (distinctTop1.size === 1 && top3Sources.length >= 1) {
    return {
      rank: SignalRank.TOP1_TOP3,
      category: "top1_top3",
      groupName: "Top 1 & Top 3",
      label: "Top 1 & Top 3",
      medal: "⚡ Top 1 & Top 3",
      isAlavancagem: false,
      isSupreme: false,
      isRare: false,
      isTop1: true,
    };
  }

  // 🥇 TOP 1: 1 Top 1 Isolado
  if (distinctTop1.size >= 1) {
    return {
      rank: SignalRank.TOP1,
      category: "top1_isolated",
      groupName: "Top 1",
      label: options?.isConsecutive ? "⚡ Consecutivo" : "🎯 Top 1",
      medal: options?.isConsecutive ? "⚡ Consecutivo" : "🎯 Top 1",
      isAlavancagem: false,
      isSupreme: false,
      isRare: false,
      isTop1: true,
    };
  }

  // 🥉 TOP 3: Apenas Top 3
  return {
    rank: SignalRank.TOP3,
    category: "top3_only",
    groupName: "Top 3",
    label: "Top 3",
    medal: `Coincidência Top 3 (${distinctTop3.size}x)`,
    isAlavancagem: false,
    isSupreme: false,
    isRare: false,
    isTop1: false,
  };
}

export type ResultItemInput =
  | AuditResultItem
  | { roll: number | string; color?: string; created_at?: string; createdAt?: string };

/**
 * Verifica se já ocorreu branco no minuto anterior (M-1) do sinal com base no timestamp real.
 * Exemplo: Sinal 12:12:00 -> Minuto M-1 é 12:11:00.000 até 12:11:59.999.
 * Se houver qualquer roll 0 / white em 12:11, retorna true (bloqueado).
 */
export function hasWhiteInPreviousMinute(
  targetDate: Date | string | number,
  results: ResultItemInput[],
): boolean {
  try {
    const dt =
      targetDate instanceof Date
        ? targetDate
        : typeof targetDate === "string"
          ? parseUtcDate(targetDate)
          : new Date(targetDate);
    const targetTime = dt.getTime();
    if (Number.isNaN(targetTime)) return false;

    const targetMinuteStart = Math.floor(targetTime / 60_000) * 60_000;
    const mMinus1Start = targetMinuteStart - 60_000;
    const mMinus1End = targetMinuteStart - 1; // 12:11:59.999

    for (const r of results || []) {
      if (!r) continue;
      const isWhite = Number(r.roll) === 0 || r.color === "white";
      if (!isWhite) continue;

      const rawIso = (r as any).created_at || (r as any).createdAt;
      if (!rawIso) continue;

      const rt = parseUtcDate(rawIso).getTime();
      if (rt >= mMinus1Start && rt <= mMinus1End) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Mescla sinais existentes com novos candidatos gerados garantindo:
 * 1. Sinais PENDING NUNCA desaparecem.
 * 2. Promoção monotônica de nível (novo rank > rank atual).
 * 3. Downgrade é estritamente proibido (novo rank <= rank atual mantém o nível).
 * 4. Bloqueio de publicação e promoção se já houver branco em M-1.
 * 5. Identidade estável (signalKey canônica baseada no minuto alvo).
 * 6. Sinais concluídos (WIN/LOSS) permanecem imutáveis.
 */
export function mergeSignalsLifecycle(
  existingSignals: PredictiveSignal[],
  newCandidates: PredictiveSignal[],
  results: ResultItemInput[],
  now: number = Date.now(),
): PredictiveSignal[] {
  const resultMap = new Map<string, PredictiveSignal>();

  // 1. Carrega todos os sinais existentes
  for (const sig of existingSignals || []) {
    if (!sig || !sig.entryDate) continue;
    const canonicalKey = getCanonicalSignalKey(sig.entryDate);
    const normalizedSig: PredictiveSignal = {
      ...sig,
      key: sig.key || canonicalKey,
    };

    // Sinais concluídos que já passaram da janela de 3 minutos de exibição são descartados
    if (
      normalizedSig.outcome &&
      normalizedSig.outcome !== "pending" &&
      normalizedSig.completedAt &&
      now - normalizedSig.completedAt > 180_000
    ) {
      continue;
    }

    resultMap.set(canonicalKey, normalizedSig);
  }

  // 2. Processa cada novo candidato gerado
  for (const cand of newCandidates || []) {
    if (!cand || !cand.entryDate) continue;
    const canonicalKey = getCanonicalSignalKey(cand.entryDate);
    const existing = resultMap.get(canonicalKey);

    const candRank = getSignalRank(cand);
    const whiteInM1 = hasWhiteInPreviousMinute(cand.entryDate, results);

    if (!existing) {
      // Novo candidato: se já houve branco em M-1, bloqueia a publicação!
      if (whiteInM1) {
        continue;
      }

      resultMap.set(canonicalKey, {
        ...cand,
        key: canonicalKey,
        outcome: "pending",
      });
    } else {
      // Sinal já existente:
      // Se já está concluído (WIN ou LOSS), é imutável!
      if (existing.outcome && existing.outcome !== "pending") {
        continue;
      }

      const existingRank = getSignalRank(existing);

      // Promoção de nível se o novo rank for superior E não houver branco em M-1
      if (candRank > existingRank && !whiteInM1) {
        resultMap.set(canonicalKey, {
          ...existing,
          pct: Math.max(existing.pct, cand.pct),
          label: cand.label || existing.label,
          medal: cand.medal || existing.medal,
          confluence: cand.confluence || existing.confluence,
          category: cand.category || existing.category,
          groupName: cand.groupName || existing.groupName,
          isAlavancagem: cand.isAlavancagem || existing.isAlavancagem,
          isSupreme: cand.isSupreme || existing.isSupreme,
          isRare: cand.isRare || existing.isRare,
          isTop1: cand.isTop1 ?? existing.isTop1,
          strategyKey: cand.strategyKey || existing.strategyKey,
          sources: cand.sources && cand.sources.length > 0 ? cand.sources : existing.sources,
          isHighTendency: cand.isHighTendency || existing.isHighTendency,
          isVerified: cand.isVerified || existing.isVerified,
        });
      } else {
        // Novo rank é igual ou inferior: NUNCA REBAIXAR! Mantém nível e apenas enriquece metadados
        resultMap.set(canonicalKey, {
          ...existing,
          pct: Math.max(existing.pct, cand.pct),
          isHighTendency: existing.isHighTendency || cand.isHighTendency,
        });
      }
    }
  }

  // Retorna a lista ordenada por horário de entrada
  return Array.from(resultMap.values()).sort((a, b) => {
    const tA =
      a.entryDate instanceof Date
        ? a.entryDate.getTime()
        : a.entryDate
          ? parseUtcDate(a.entryDate as any).getTime()
          : 0;
    const tB =
      b.entryDate instanceof Date
        ? b.entryDate.getTime()
        : b.entryDate
          ? parseUtcDate(b.entryDate as any).getTime()
          : 0;
    return (tA || 0) - (tB || 0);
  });
}
