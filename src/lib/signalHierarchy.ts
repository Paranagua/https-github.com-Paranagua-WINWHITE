import { fmtClock } from "@/lib/predictive";
import { parseUtcDate } from "@/lib/utils";
import type { PredictiveSignal, StoredSignal } from "@/lib/signalsStore";
import { auditSignalWithRounds, type AuditResultItem } from "@/lib/signalAuditEngine";
import {
  mergeConfirmedStrategies,
  applyConfirmationStrategies,
  type StrategyProjection,
  type ConfirmedStrategyInfo,
} from "@/lib/confirmationStrategies";
import type { SumTriggerProjection } from "@/lib/sum19Strategies";
import { useSignalStatsStore } from "@/lib/signalStatsStore";
import type { RawTendencyCandidate } from "@/lib/tendencias";
import {
  DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS,
  getActiveSignalAnalysisIds,
  isAnalysisActiveForSignals,
} from "@/lib/analysisSignalConfig";

/**
 * Hierarquia estrita e monotônica dos sinais (do mais forte ao mais fraco):
 * 1. 🚀 Alavancagem (alavancagem): >= 4x Top 1 (+ 0 ou mais Top 2/3)
 * 2. 👑 Supremo (supreme): 2x ou 3x Top 1 + 2 ou mais Top 2/3
 * 3. 💎 Raro (rare): 2x ou 3x Top 1 + 0 ou 1 Top 2/3
 * 4. ⚡ Top 1 & Top 3 (top1_top3): 1x Top 1 + 1 ou mais Top 2/3
 *
 * NOTA: Top 1 isolado (1x Top 1 + 0 Top 2/3) e Coincidências Top 3 (0x Top 1) NÃO geram sinais.
 */
export enum SignalRank {
  NO_CONFLUENCE = 0,
  EM_ALTA = 1,
  TOP1_TOP3 = 2,
  RARE = 3,
  SUPREME = 4,
  ALAVANCAGEM = 5,
}

export type SignalCategory =
  "em_alta" | "top1_top3" | "rare" | "supreme" | "alavancagem" | "no_confluence";

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
 * Formata o código da estratégia conforme a especificação do usuário:
 * - F2 = F2-(P_prox), ex: F2-8
 * - Soma = S-(pedras da soma), ex: S-314, S-109, S-118, S-145, S-89
 * - Confirmações = E1 a E15, ex: E5
 * - B = B-(numero das pontas), ex: B-3
 */
export function formatStrategyCode(raw?: string | null): string {
  if (!raw) return "";
  let clean = raw.trim();

  // Remove qualquer indicador de percentual (ex: " (88%)", " 88%", "(100%)")
  clean = clean.replace(/\s*\(\d+%\)|\s*\d+%/g, "").trim();

  // 1. Confirmações E1 a E15 (ex. E5)
  const eMatch = clean.match(/^E(?:1[0-5]|[1-9])$/i);
  if (eMatch) {
    return clean.toUpperCase();
  }

  // 2. F2: F2-(P_prox), ex. F2-8
  const f2Match = clean.match(/^F2(?:[-_](\d+))?$/i);
  if (f2Match) {
    return f2Match[1] !== undefined ? `F2-${f2Match[1]}` : "F2";
  }

  // 3. B: B-(numero das pontas), ex. B-3 (pontas de 0 a 14)
  const bMatch = clean.match(/^B(?:[1-3])?[-_](\d+)$/i);
  if (bMatch) {
    return `B-${bMatch[1]}`;
  }
  // Se for apenas o código do gatilho (B1, B2, B3) sem ponta explícita
  if (/^B[1-3]$/i.test(clean)) {
    return clean.toUpperCase();
  }

  // 4. Soma: S-(pedras da soma), ex. S-314
  if (/^S-\d+$/i.test(clean)) {
    return clean.toUpperCase();
  }

  // Remove prefixos como S19_, S17_, S_, Gatilho
  clean = clean.replace(/^(S19_|S17_|S_|Gatilho\s*:?\s*)/i, "");

  // Pares com hífen, ex: "14-5" -> "S-145", "10-9" -> "S-109", "3-14" -> "S-314", "14-3" -> "S-143"
  if (/^\d+-\d+$/.test(clean)) {
    const digits = clean.replace(/-/g, "");
    return `S-${digits}`;
  }

  // Dígitos puros de somas conhecidas (ex: "314", "109", "145", "89", "118")
  if (/^\d{2,4}$/.test(clean)) {
    return `S-${clean}`;
  }

  return clean.trim();
}

/**
 * Extrai e deduplica todas as estratégias de um sinal no padrão de tags do usuário:
 * B-(numero das pontas) [ex: B-3], F2-(P_prox) [ex: F2-8], E1-E15 [ex: E5], S-(pedras da soma) [ex: S-314].
 */
export function extractSignalStrategies(sig: any): string[] {
  if (!sig) return [];
  const list: string[] = [];

  // Extrai direto de propriedades estruturadas
  if (sig.ponta !== undefined) {
    list.push(`B-${sig.ponta}`);
  } else if (sig.bType) {
    list.push(String(sig.bType).toUpperCase());
  }
  if (sig.pProx !== undefined) {
    list.push(`F2-${sig.pProx}`);
  }

  // 1. Array strategies explícito
  if (Array.isArray(sig.strategies) && sig.strategies.length > 0) {
    sig.strategies.forEach((s: any) => {
      if (typeof s === "string") list.push(formatStrategyCode(s));
    });
  }

  // 2. Array triggerStrategies
  if (Array.isArray(sig.triggerStrategies)) {
    sig.triggerStrategies.forEach((s: any) => {
      if (typeof s === "string") list.push(formatStrategyCode(s));
    });
  }

  // 3. Estratégias confirmadas
  if (Array.isArray(sig.confirmedStrategies)) {
    sig.confirmedStrategies.forEach((c: any) => {
      if (c && c.code) list.push(formatStrategyCode(c.code));
    });
  }

  // 4. strategyKey (se não for análise pura tipo A1 ou prefixo de tendência tipo T_A18)
  if (sig.strategyKey && typeof sig.strategyKey === "string") {
    if (!/^[AQ]\d+$/i.test(sig.strategyKey) && !/^T[_-]/i.test(sig.strategyKey)) {
      list.push(formatStrategyCode(sig.strategyKey));
    }
  }

  // 5. Escaneia confluence e label para capturar B-(0..14), B1-B3, F2(-X)?, E1-E15 e pares de soma
  const textToScan = `${sig.confluence || ""} ${sig.label || ""}`;
  if (textToScan) {
    // Captura B-(0 a 14)
    const bTipMatches = textToScan.match(/\bB-(?:1[0-4]|[0-9])\b/gi);
    if (bTipMatches) {
      bTipMatches.forEach((m) => list.push(formatStrategyCode(m)));
    }
    // Captura B1, B2, B3
    const bMatches = textToScan.match(/\bB[1-3]\b/gi);
    if (bMatches) {
      bMatches.forEach((m) => list.push(m.toUpperCase()));
    }
    // Captura F2-(4 a 14) ou F2
    const f2TipMatches = textToScan.match(/\bF2-(?:1[0-4]|[0-9])\b/gi);
    if (f2TipMatches) {
      f2TipMatches.forEach((m) => list.push(formatStrategyCode(m)));
    } else if (/\bF2\b/i.test(textToScan)) {
      list.push("F2");
    }
    // Captura E1-E15
    const eMatches = textToScan.match(/\bE(?:1[0-5]|[1-9])\b/gi);
    if (eMatches) {
      eMatches.forEach((m) => list.push(m.toUpperCase()));
    }
    // Captura S-XXX
    const sMatches = textToScan.match(/\bS-\d+\b/gi);
    if (sMatches) {
      sMatches.forEach((m) => list.push(formatStrategyCode(m)));
    }
    // Procura por pares de soma como 14-5, 10-9, 11-8, 12-7, 6-13, 8-11, 10-7, 8-9, 11-6, 5-12, 13-4, 14-3, 3-14
    const sumMatches = textToScan.match(/\b\d+-\d+\b/g);
    if (sumMatches) {
      sumMatches.forEach((m) => list.push(formatStrategyCode(m)));
    }
  }

  // Deduplica mantendo valores únicos e remove tags de tendência (T_A18...)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (/^T[_-]/i.test(item)) continue; // Remove tags de tendência como T_A18
    const formatted = formatStrategyCode(item);
    if (formatted && !/^T[_-]/i.test(formatted) && !seen.has(formatted)) {
      seen.add(formatted);
      result.push(formatted);
    }
  }

  // Se houver uma ponta específica (ex: B-3), não precisa exibir o genérico B1 na mesma tag se ambos existirem
  const hasSpecificB = result.some((r) => /^B-\d+$/i.test(r));
  const filtered = hasSpecificB ? result.filter((r) => !/^B[1-3]$/i.test(r)) : result;

  // Ordena B primeiro (ex. B-3), depois F2 (ex. F2-8), depois Confirmações E1-E15 (ex. E5), depois Somas (ex. S-314)
  filtered.sort((a, b) => {
    const isB_A = /^B[-_\d]/i.test(a);
    const isB_B = /^B[-_\d]/i.test(b);
    if (isB_A && !isB_B) return -1;
    if (!isB_A && isB_B) return 1;

    const isF2_A = /^F2/i.test(a);
    const isF2_B = /^F2/i.test(b);
    if (isF2_A && !isF2_B) return -1;
    if (!isF2_A && isF2_B) return 1;

    const isE_A = /^E\d+$/i.test(a);
    const isE_B = /^E\d+$/i.test(b);
    if (isE_A && !isE_B) return -1;
    if (!isE_A && isE_B) return 1;
    if (isE_A && isE_B) {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    }

    return a.localeCompare(b);
  });

  return filtered;
}

export interface SignalAnalysisItem {
  text: string;
  pct?: string;
  analysis?: number;
  value?: number;
  top3?: boolean;
  isTendency?: boolean;
}

/**
 * Extrai e formata análises de um sinal (ex: "A1-5 88%" ou "Q1-0 80%").
 */
export function extractSignalAnalyses(sig: any): SignalAnalysisItem[] {
  if (!sig) return [];
  const results: SignalAnalysisItem[] = [];

  const isSignalEmAlta =
    !!sig.isEmAlta ||
    (sig.category || "").toLowerCase() === "em_alta" ||
    (typeof sig.label === "string" && sig.label.toLowerCase().includes("tendência"));

  if (Array.isArray(sig.sources) && sig.sources.length > 0) {
    sig.sources.forEach((src: any) => {
      if (!src) return;
      // Estratégias (E1..E15, F2, B1..B3, Somas) NÃO são análises primárias e nunca exibem tags de percentual no card
      if (src.analysis >= 100) return;
      const pctStr = typeof src.pct === "number" && src.pct > 0 ? `${Math.round(src.pct)}%` : "";
      const code =
        src.analysis >= 50 && src.analysis <= 56 ? `Q${src.analysis - 49}` : `A${src.analysis}`;

      const isTend =
        !!src.isTendency ||
        isSignalEmAlta ||
        src.ratio === "3/3" ||
        src.ratio === "2/3" ||
        (typeof src.cycleKey === "string" && src.cycleKey.startsWith("TEND_")) ||
        (code === "A18" && (pctStr.includes("100") || isSignalEmAlta));

      results.push({
        text: `${code}-${src.value}`,
        pct: pctStr,
        analysis: src.analysis,
        value: src.value,
        top3: !!src.top3,
        isTendency: isTend,
      });
    });
    return results;
  }

  // Fallback escaneando confluence
  const text = sig.confluence || "";
  const regex = /(?:A|Q)(\d+)[-·](\d+)(?:\s*\(?(\d+)%?\)?)?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const isQ = match[0].toUpperCase().startsWith("Q");
    const aNum = parseInt(match[1], 10);
    const analysisId = isQ ? aNum + 49 : aNum;
    const val = parseInt(match[2], 10);
    const pct = match[3] ? `${match[3]}%` : "";
    const code = isQ ? `Q${aNum}` : `A${aNum}`;
    const isTend = isSignalEmAlta || (code === "A18" && (pct.includes("100") || isSignalEmAlta));

    results.push({
      text: `${code}-${val}`,
      pct,
      analysis: analysisId,
      value: val,
      isTendency: isTend,
    });
  }

  return results;
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
 * Obtém o ranking numérico (1 a 5) de um sinal ou categoria.
 * Retorna NO_CONFLUENCE (0) se o sinal não atende aos requisitos mínimos dos cards.
 */
export function getSignalRank(sig?: Partial<PredictiveSignal> | string | null): SignalRank {
  if (!sig) return SignalRank.NO_CONFLUENCE;

  if (typeof sig === "string") {
    const cat = sig.toLowerCase();
    if (cat.includes("no_confluence") || cat.includes("sem conflu"))
      return SignalRank.NO_CONFLUENCE;
    if (cat === "em_alta") return SignalRank.EM_ALTA;
    if (cat.includes("alavanc")) return SignalRank.ALAVANCAGEM;
    if (cat.includes("suprem") || cat.includes("winn")) return SignalRank.SUPREME;
    if (cat.includes("rare") || cat.includes("raro")) return SignalRank.RARE;
    if (cat.includes("top1_top3") || cat.includes("top 1 & top 3") || cat.includes("top 1 & 3"))
      return SignalRank.TOP1_TOP3;
    return SignalRank.NO_CONFLUENCE;
  }

  if (sig.isNoConfluence || (sig.category || "").toLowerCase() === "no_confluence") {
    return SignalRank.NO_CONFLUENCE;
  }

  const cat = (sig.category || "").toLowerCase();

  // 1. Grupo 'EM ALTA': Recebe EXCLUSIVAMENTE sinais de Tendência gerados pelo módulo de tendências (buildEmAltaSignals)
  // Tem classificação estrita garantindo que nunca seja rebaixado ou reclassificado como outro grupo
  if (
    (sig as any).isEmAlta === true ||
    cat === "em_alta" ||
    cat.includes("em_alta") ||
    (sig as any).groupName === "Em Alta" ||
    (typeof sig.key === "string" && sig.key.startsWith("EM_ALTA_")) ||
    (typeof sig.label === "string" &&
      (sig.label.toUpperCase().includes("EM ALTA") || sig.label.startsWith("Tendência 3/3")))
  ) {
    return SignalRank.EM_ALTA;
  }

  // 2. Grupos de maior hierarquia para sinais padrão de análise
  if (sig.isAlavancagem || cat === "alavancagem" || (sig as any).hasYellowSeal) {
    return SignalRank.ALAVANCAGEM;
  }
  if (sig.isSupreme || cat === "supreme" || (sig as any).hasBlueSeal) {
    return SignalRank.SUPREME;
  }
  if (sig.isRare || cat === "rare") {
    return SignalRank.RARE;
  }

  const top1Sources = (sig.sources || []).filter((s: any) => !s.top3 && !s.top5);
  const top3Sources = (sig.sources || []).filter((s: any) => s.top3 || s.top5);
  const distinctTop1 = new Set(top1Sources.map((s: any) => s.analysis));
  const distinctTop3 = new Set(top3Sources.map((s: any) => s.analysis));

  // Confluência de estratégias ativas (B1-B3, F2, E1-E15, e somas numéricas):
  const textToScan = `${sig.confluence || ""} ${sig.label || ""} ${(sig as any).strategies?.join(" ") || ""}`;
  const sumMatches = textToScan.match(/\b\d+-\d+\b/g);
  if (sumMatches) {
    sumMatches.forEach((m) => distinctTop3.add(`SUM_${formatStrategyCode(m)}`));
  }
  const stratMatches = textToScan.match(/\b(B[1-3]|F2|E(?:1[0-5]|[1-9]))\b/gi);
  if (stratMatches) {
    stratMatches.forEach((m) => distinctTop3.add(`STRAT_${m.toUpperCase()}`));
  }

  // Quando fontes estruturadas estão presentes, calcula estritamente pelas regras dos grupos:
  if (distinctTop1.size > 0 || distinctTop3.size > 0) {
    if (distinctTop1.size >= 4) return SignalRank.ALAVANCAGEM;
    if ((distinctTop1.size === 2 || distinctTop1.size === 3) && distinctTop3.size >= 2) {
      return SignalRank.SUPREME;
    }
    if ((distinctTop1.size === 2 || distinctTop1.size === 3) && distinctTop3.size < 2) {
      return SignalRank.RARE;
    }
    if (distinctTop1.size === 1 && distinctTop3.size >= 1) {
      return SignalRank.TOP1_TOP3;
    }
    // Top 1 isolado (1x Top 1 + 0 Top 2/3) ou apenas Top 3 (0x Top 1) NÃO formam card!
    return SignalRank.NO_CONFLUENCE;
  }

  // Fallback por flags/tags
  const label = (sig.label || "").toUpperCase();
  const medal = ((sig as any).medal || "").toUpperCase();
  const conf = (sig.confluence || "").toUpperCase();

  if (
    sig.isAlavancagem ||
    cat.includes("alavanc") ||
    label.includes("ALAVANC") ||
    medal.includes("ALAVANC") ||
    conf.includes("ALAVANC")
  ) {
    return SignalRank.ALAVANCAGEM;
  }

  if (
    sig.isSupreme ||
    cat.includes("suprem") ||
    cat.includes("winn") ||
    label.includes("SUPREM") ||
    medal.includes("SUPREM") ||
    conf.includes("SUPREM") ||
    label.includes("WINN") ||
    medal.includes("WINN")
  ) {
    return SignalRank.SUPREME;
  }

  if (
    sig.isRare ||
    cat.includes("rare") ||
    cat.includes("raro") ||
    label.includes("RARO") ||
    medal.includes("RARO") ||
    conf.includes("RARO")
  ) {
    return SignalRank.RARE;
  }

  if (
    label.includes("TOP 1 & TOP 3") ||
    label.includes("TOP 1 & 3") ||
    label.includes("TOP1 & TOP3") ||
    medal.includes("TOP 1 & TOP 3") ||
    conf.includes("TOP 1 & TOP 3")
  ) {
    return SignalRank.TOP1_TOP3;
  }

  return SignalRank.NO_CONFLUENCE;
}

/**
 * Determina se um sinal é ELEGÍVEL para ser exibido como CARD na tela e contabilizado no PAINEL AUDITOR.
 * REGRA ESTRITA: O painel auditor deve auditar ÚNICA E EXCLUSIVAMENTE os sinais que atingiram os critérios de card:
 * - 🚀 Alavancagem (alavancagem): >= 4x Top 1
 * - 👑 Supremo (supreme): 2x ou 3x Top 1 + 2 ou mais Top 2/3
 * - 💎 Raro (rare): 2x ou 3x Top 1 + 0 ou 1 Top 2/3
 * - ⚡ Top 1 & Top 3 (top1_top3): 1x Top 1 + 1 ou mais Top 2/3
 * - 🔥 Em Alta (em_alta): Tendência 3/3
 *
 * Sinais sem confluência, Top 1 isolado, apenas Top 3 ou sem confluência NUNCA são elegíveis.
 */
export function isSignalCardEligible(sig?: Partial<PredictiveSignal> | any | null): boolean {
  if (!sig) return false;
  if (
    sig.isNoConfluence === true ||
    sig.category === "no_confluence" ||
    (typeof sig.confluence === "string" &&
      (sig.confluence.includes("Sem Confluência") || sig.confluence.includes("sem confluência")))
  ) {
    return false;
  }
  const rank = getSignalRank(sig);
  return (
    rank === SignalRank.ALAVANCAGEM ||
    rank === SignalRank.SUPREME ||
    rank === SignalRank.RARE ||
    rank === SignalRank.TOP1_TOP3 ||
    rank === SignalRank.EM_ALTA
  );
}

/**
 * Avalia o nível do sinal com base na hierarquia estrita:
 * 1. 🚀 Alavancagem: 4 ou mais análises Top 1 considerando vizinhos (Top 2/3 não altera o grupo).
 * 2. 👑 Supremo: 2 a 3 análises Top 1 considerando vizinhos + 2 ou mais Top 2/3.
 * 3. 💎 Raro: 2 a 3 análises Top 1 considerando vizinhos (com 0 ou 1 Top 2/3).
 * 4. ⚡ Top 1 & Top 3: 1 análise Top 1 juntamente de 1 ou mais Top 2/3 considerando vizinhos.
 *
 * Retorna null para Top 1 isolado (1x Top 1 + 0 Top 2/3) ou Apenas Top 3 (0x Top 1).
 */
export function evaluateSignalLevel(
  top1Sources: Array<{ analysis: number; value: number; pct?: number }>,
  top3Sources: Array<{ analysis: number; value: number; pct?: number }>,
  options?: {
    isConsecutive?: boolean;
    levelOffset?: number;
  },
): SignalLevelEvaluation | null {
  const distinctTop1 = new Set(top1Sources.map((s) => s.analysis));
  const distinctTop3 = new Set(top3Sources.map((s) => s.analysis));
  const top1Count = distinctTop1.size;
  const top3Count = distinctTop3.size;

  // 1. 🚀 ALAVANCAGEM: 4x ou mais Top 1 (Top 2/3 não altera seu grupo)
  if (top1Count >= 4) {
    return {
      rank: SignalRank.ALAVANCAGEM,
      category: "alavancagem",
      groupName: "Alavancagem",
      label: "Alavancagem",
      medal: `🚀 ALAVANCAGEM (${top1Count}x Top 1)`,
      isAlavancagem: true,
      isSupreme: false,
      isRare: false,
      isTop1: true,
    };
  }

  // 2. 👑 SUPREMO: 2 a 3 análises Top 1 + 2 ou mais Top 2/3
  if ((top1Count === 2 || top1Count === 3) && top3Count >= 2) {
    return {
      rank: SignalRank.SUPREME,
      category: "supreme",
      groupName: "Supremo",
      label: "Supremo",
      medal: `👑 Supremo (${top1Count}x Top 1 + ${top3Count}x Top 2/3)`,
      isAlavancagem: false,
      isSupreme: true,
      isRare: false,
      isTop1: true,
    };
  }

  // 3. 💎 RARO: 2 a 3 análises Top 1 (sem 2+ Top 2/3)
  if ((top1Count === 2 || top1Count === 3) && top3Count < 2) {
    return {
      rank: SignalRank.RARE,
      category: "rare",
      groupName: "Raro",
      label: "Raro",
      medal: `💎 Raro (${top1Count}x Top 1)`,
      isAlavancagem: false,
      isSupreme: false,
      isRare: true,
      isTop1: true,
    };
  }

  // 4. ⚡ TOP 1 & TOP 3: 1x Top 1 + 1 ou mais Top 2/3
  if (top1Count === 1 && top3Count >= 1) {
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

  // 🛑 Top 1 isolado (1x Top 1 + 0 Top 2/3) e Coincidências Top 3 (0x Top 1) NÃO ENVIAM SINAIS
  return null;
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
      const isWhite = Number(r.roll) === 0 || r.color === "white" || String(r.color).trim() === "0";
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

export function getSourceCycleKey(src: {
  analysis: number;
  value: number;
  cycleKey?: string;
}): string {
  if (src.cycleKey && typeof src.cycleKey === "string" && src.cycleKey.trim().length > 0) {
    return src.cycleKey;
  }
  return `A${src.analysis}_V${src.value}`;
}

export interface RawCandidate {
  analysis: number;
  value: number;
  pct: number;
  targetDate: Date;
  isTop1: boolean;
  rank?: number;
  isHighTendency?: boolean;
  isRecAlert?: boolean;
  strategyKey?: string;
  cycleKey?: string;
  gap?: number;
  triggerAt?: Date;
}

export interface ConfluenceGroup {
  representativeDate: Date;
  clusterDates: Date[];
  top1Sources: Array<{
    analysis: number;
    value: number;
    pct: number;
    top3: false;
    cycleKey?: string;
  }>;
  top3Sources: Array<{
    analysis: number;
    value: number;
    pct: number;
    top3: true;
    rank?: number;
    cycleKey?: string;
  }>;
  allSources: Array<{
    analysis: number;
    value: number;
    pct: number;
    top3: boolean;
    rank?: number;
    cycleKey?: string;
  }>;
  distinctTop1Analyses: number[];
  distinctAnalyses: number[];
  maxPct: number;
  avgPct: number;
  isHighTendency: boolean;
  isRecAlert: boolean;
  isConsecutive: boolean;
  allowsOscillation: boolean;
  strategyKey?: string;
  evaluation: SignalLevelEvaluation;
}

/**
 * Compara a força/nível de duas confluências usando a hierarquia estrita:
 * 1. 🚀 Alavancagem (Rank 4) > 👑 Supremo (Rank 3) > 💎 Raro (Rank 2) > ⚡ Top 1 & Top 3 (Rank 1)
 * 2. Quantidade de análises Top 1 distintas (mais Top 1 = mais forte)
 * 3. Quantidade total de análises distintas (mais análises = mais forte)
 * 4. Média de assertividade (avgPct)
 * 5. Maior assertividade individual (maxPct)
 * 6. Horário (mais cedo primeiro para estabilidade)
 */
export function compareConfluenceStrength(a: ConfluenceGroup, b: ConfluenceGroup): number {
  const rankA = a.evaluation?.rank ?? getSignalRank(a.evaluation?.category);
  const rankB = b.evaluation?.rank ?? getSignalRank(b.evaluation?.category);
  if (rankB !== rankA) {
    return rankB - rankA;
  }

  const top1A = a.distinctTop1Analyses.length;
  const top1B = b.distinctTop1Analyses.length;
  if (top1B !== top1A) {
    return top1B - top1A;
  }

  const totalA = a.distinctAnalyses.length;
  const totalB = b.distinctAnalyses.length;
  if (totalB !== totalA) {
    return totalB - totalA;
  }

  const avgA = a.avgPct || 0;
  const avgB = b.avgPct || 0;
  if (Math.abs(avgB - avgA) >= 0.01) {
    return avgB - avgA;
  }

  const maxA = a.maxPct || 0;
  const maxB = b.maxPct || 0;
  if (Math.abs(maxB - maxA) >= 0.01) {
    return maxB - maxA;
  }

  return a.representativeDate.getTime() - b.representativeDate.getTime();
}

/**
 * Agrupa candidatos gerados pelas análises em grupos de confluência com base na proximidade de horário (janela primária de até 3 minutos).
 * Regras de negócio:
 * 1. Permite múltiplos ciclos ativos por análise (diferenciados por cycleKey).
 * 2. Gera primeiro TODAS as confluências possíveis sem exclusividade prematura.
 * 3. Avalia o nível de cada confluência: 🚀 Alavancagem > 👑 Supremo > 💎 Raro > ⚡ Top 1 & Top 3.
 * 4. Ordena as confluências da mais forte para a mais fraca.
 * 5. Aplica a exclusividade: uma mesma análise não pode participar de dois sinais concorrentes.
 *    Se uma análise aparecer em duas confluências, mantém a confluência mais forte e descarta a mais fraca.
 */
export function groupCandidatesByTimeProximity(candidates: RawCandidate[]): ConfluenceGroup[] {
  if (!candidates || candidates.length === 0) return [];

  // 1. Normaliza os timestamps dos candidatos para o início do minuto
  const normalizedCandidates: RawCandidate[] = candidates
    .filter((c) => c && c.targetDate && !Number.isNaN(c.targetDate.getTime()))
    .map((c) => {
      const dt = new Date(c.targetDate.getTime());
      dt.setSeconds(0, 0);
      dt.setMilliseconds(0);
      return { ...c, targetDate: dt };
    });

  if (normalizedCandidates.length === 0) return [];

  // 2. Agrupa candidatos por minuto exato
  const minuteMap = new Map<number, RawCandidate[]>();
  for (const c of normalizedCandidates) {
    const t = c.targetDate.getTime();
    const list = minuteMap.get(t) || [];
    list.push(c);
    minuteMap.set(t, list);
  }

  // 3. Ordena os minutos de forma cronológica crescente
  const sortedMinutes = Array.from(minuteMap.keys()).sort((a, b) => a - b);

  // 4. Cria clusters de vizinhos primários (span total máximo de 2 minutos = 120.000 ms, ou seja janela de 3 minutos m-1, m, m+1)
  const clusters: number[][] = [];
  let currentCluster: number[] = [];

  for (const minute of sortedMinutes) {
    if (currentCluster.length === 0) {
      currentCluster.push(minute);
    } else {
      const firstMinute = currentCluster[0];
      const totalSpan = minute - firstMinute;

      // Agrupa se o span total não exceder 2 minutos (120.000 ms = janela primária de 3 minutos)
      if (totalSpan <= 120_000) {
        currentCluster.push(minute);
      } else {
        clusters.push(currentCluster);
        currentCluster = [minute];
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 5. PASSO 1: Gera primeiro TODAS as confluências possíveis de cada cluster (sem descartes prematuros)
  const candidateGroups: ConfluenceGroup[] = [];

  for (const cluster of clusters) {
    const clusterCandidates: RawCandidate[] = [];
    for (const m of cluster) {
      const cList = minuteMap.get(m) || [];
      for (const c of cList) {
        clusterCandidates.push(c);
      }
    }

    if (clusterCandidates.length === 0) continue;

    // A. Determina horário representativo pelo gap mais assertivo da análise geradora (Top 1):
    // "Os sinais devem seguir o gap da analise geradora, as conflencia devem apenas acompanhar o horario (m-1, m , m+1) gerado.
    // Quando mais de uma analise geradora tiver horarios vizinhos, deve verificar qual gap está mais assertivo."
    const top1Cluster = clusterCandidates.filter((c) => c.isTop1);
    let dominantCand: RawCandidate | undefined = undefined;

    if (top1Cluster.length > 0) {
      dominantCand = top1Cluster[0];
      for (let i = 1; i < top1Cluster.length; i++) {
        const cand = top1Cluster[i];
        if (cand.pct > dominantCand.pct) {
          dominantCand = cand;
        } else if (cand.pct === dominantCand.pct) {
          if ((cand.rank || 1) < (dominantCand.rank || 1)) {
            dominantCand = cand;
          } else if (cand.analysis < dominantCand.analysis) {
            dominantCand = cand;
          }
        }
      }
    } else if (clusterCandidates.length > 0) {
      dominantCand = clusterCandidates[0];
      for (let i = 1; i < clusterCandidates.length; i++) {
        if (clusterCandidates[i].pct > dominantCand.pct) {
          dominantCand = clusterCandidates[i];
        }
      }
    }

    const representativeTimestamp = dominantCand ? dominantCand.targetDate.getTime() : cluster[0];
    const allowsOscillation = false;
    const isConsecutive = cluster.length >= 3;

    const representativeDate = new Date(representativeTimestamp);

    // B. Consolida fontes Top 1 (preserva cycleKey para distinguir ciclos diferentes da mesma análise)
    const top1Map = new Map<
      string,
      { analysis: number; value: number; pct: number; top3: false; cycleKey?: string }
    >();
    for (const c of clusterCandidates.filter((c) => c.isTop1)) {
      const key = c.cycleKey || `A${c.analysis}_V${c.value}`;
      const existing = top1Map.get(key);
      if (!existing || c.pct > existing.pct) {
        top1Map.set(key, {
          analysis: c.analysis,
          value: c.value,
          pct: c.pct,
          top3: false,
          cycleKey: c.cycleKey,
        });
      }
    }
    const top1Sources = Array.from(top1Map.values()).sort((a, b) => b.pct - a.pct);
    const distinctTop1Analyses = Array.from(new Set(top1Sources.map((s) => s.analysis)));

    // C. Consolida fontes Top 3 (secundárias de análises que não sejam Top 1 neste cluster)
    const top3Map = new Map<
      string,
      {
        analysis: number;
        value: number;
        pct: number;
        top3: true;
        rank?: number;
        cycleKey?: string;
      }
    >();
    for (const c of clusterCandidates.filter((c) => !c.isTop1)) {
      if (distinctTop1Analyses.includes(c.analysis)) continue;
      const key = c.cycleKey || `A${c.analysis}_V${c.value}`;
      const existing = top3Map.get(key);
      if (!existing || c.pct > existing.pct) {
        top3Map.set(key, {
          analysis: c.analysis,
          value: c.value,
          pct: c.pct,
          top3: true,
          rank: c.rank,
          cycleKey: c.cycleKey,
        });
      }
    }
    const top3Sources = Array.from(top3Map.values()).sort((a, b) => b.pct - a.pct);

    const allSources = [...top1Sources, ...top3Sources];
    const distinctAnalyses = Array.from(new Set(allSources.map((s) => s.analysis)));

    // Se não há nenhum Top 1, não gera sinal
    if (top1Sources.length === 0) {
      continue;
    }

    const maxPct = allSources.length > 0 ? Math.max(...allSources.map((s) => s.pct)) : 0;
    const avgPct =
      allSources.length > 0
        ? Math.round(
            (allSources.reduce((acc, s) => acc + (s.pct || 0), 0) / allSources.length) * 10,
          ) / 10
        : 0;
    const isHighTendency = clusterCandidates.some((c) => c.isHighTendency);
    const isRecAlert = clusterCandidates.some((c) => c.isRecAlert);

    // D. Avalia o nível final da confluência após o agrupamento
    const evaluation = evaluateSignalLevel(top1Sources, top3Sources, { isConsecutive });

    // Se for Top 1 isolado ou não atingir critério de confluência, não envia sinal
    if (!evaluation) {
      continue;
    }

    const strategyKey =
      top1Sources.length > 0
        ? `A${top1Sources[0].analysis}`
        : top3Sources.length > 0
          ? `A${top3Sources[0].analysis}`
          : undefined;

    candidateGroups.push({
      representativeDate,
      clusterDates: cluster.map((m) => new Date(m)),
      top1Sources,
      top3Sources,
      allSources,
      distinctTop1Analyses,
      distinctAnalyses,
      maxPct,
      avgPct,
      isHighTendency,
      isRecAlert,
      isConsecutive,
      allowsOscillation,
      strategyKey,
      evaluation,
    });
  }

  // 6. PASSO 2: Ordena as confluências candidatas da MAIS FORTE para a MAIS FRACA
  candidateGroups.sort(compareConfluenceStrength);

  // 7. PASSO 3: Aplica a exclusividade por Ciclo/Gatilho específico (cycleKey)
  // O mesmo ciclo não pode gerar múltiplos sinais próximos (ex: 12:10, 12:12, 12:14).
  // A confluência mais forte reserva o ciclo; ciclos diferentes da mesma análise são totalmente independentes.
  const claimedCycleKeys = new Set<string>();
  const winningGroups: ConfluenceGroup[] = [];

  for (const group of candidateGroups) {
    const currentSources = group.allSources || [];
    const groupCycleKeys = currentSources.map((s) => getSourceCycleKey(s));
    const hasConflict = groupCycleKeys.some((ck) => claimedCycleKeys.has(ck));

    if (!hasConflict) {
      // Sem conflito: confluência inteira é aceita e reivindica seus cycleKeys
      for (const ck of groupCycleKeys) {
        claimedCycleKeys.add(ck);
      }
      winningGroups.push(group);
      continue;
    }

    // Se houve conflito em algum cycleKey, filtra somente as fontes que não foram reivindicadas
    const exclusiveSources = currentSources.filter(
      (src) => !claimedCycleKeys.has(getSourceCycleKey(src)),
    );

    const remainingTop1 = exclusiveSources
      .filter((s) => !s.top3)
      .map((s) => ({
        analysis: s.analysis,
        value: s.value,
        pct: s.pct,
        top3: false as const,
        cycleKey: s.cycleKey,
      }));
    const remainingTop3 = exclusiveSources
      .filter((s) => s.top3)
      .map((s) => ({
        analysis: s.analysis,
        value: s.value,
        pct: s.pct,
        top3: true as const,
        rank: s.rank,
        cycleKey: s.cycleKey,
      }));

    // Reavalia o nível da confluência com as fontes exclusivas restantes
    const newEval = evaluateSignalLevel(remainingTop1, remainingTop3, {
      isConsecutive: group.isConsecutive,
    });

    // Se perdeu os requisitos mínimos (ex: sem Top 1 ou confluência insuficiente), descarta
    if (!newEval || remainingTop1.length === 0) {
      continue;
    }

    // Caso permaneça válida, reivindica os cycleKeys exclusivos restantes
    for (const src of exclusiveSources) {
      claimedCycleKeys.add(getSourceCycleKey(src));
    }

    const distinctTop1Analyses = Array.from(new Set(remainingTop1.map((s) => s.analysis)));
    const distinctAnalyses = Array.from(new Set(exclusiveSources.map((s) => s.analysis)));
    const avgPct =
      exclusiveSources.length > 0
        ? Math.round(
            (exclusiveSources.reduce((acc, s) => acc + (s.pct || 0), 0) / exclusiveSources.length) *
              10,
          ) / 10
        : group.avgPct;

    winningGroups.push({
      ...group,
      top1Sources: remainingTop1,
      top3Sources: remainingTop3,
      allSources: exclusiveSources,
      distinctTop1Analyses,
      distinctAnalyses,
      avgPct,
      evaluation: newEval,
    });
  }

  // 8. Retorna as confluências vencedoras ordenadas cronologicamente
  return winningGroups.sort(
    (a, b) => a.representativeDate.getTime() - b.representativeDate.getTime(),
  );
}

/**
 * Constrói sinais preditivos a partir dos candidatos brutos já agrupados por confluência.
 */
export function buildSignalConfluences(rawCandidates: RawCandidate[]): PredictiveSignal[] {
  const groups = groupCandidatesByTimeProximity(rawCandidates);

  return groups.map((g) => {
    const canonicalKey = getCanonicalSignalKey(g.representativeDate);
    const confluenceText = g.allSources
      .map((s) => `A${s.analysis}-${s.value}${s.pct ? ` ${Math.round(s.pct)}%` : ""}`)
      .join(", ");
    const displayPct = Number.isFinite(g.avgPct) && g.avgPct > 0 ? g.avgPct : g.maxPct;

    return {
      key: canonicalKey,
      time: fmtClock(g.representativeDate),
      pct: displayPct,
      label: g.evaluation.label,
      confluence: confluenceText,
      medal: g.evaluation.medal,
      entryDate: g.representativeDate,
      outcome: "pending" as const,
      isHighTendency: g.isHighTendency,
      isRecAlert: g.isRecAlert,
      category: g.evaluation.category,
      groupName: g.evaluation.groupName,
      isTop1: g.evaluation.isTop1,
      isAlavancagem: g.evaluation.isAlavancagem,
      isRare: g.evaluation.isRare,
      isSupreme: g.evaluation.isSupreme,
      strategyKey: g.strategyKey,
      sources: g.allSources,
      clusterTimestamps: g.clusterDates.map((d) => d.getTime()),
      allowsOscillation: g.allowsOscillation,
      isConsecutive: g.isConsecutive,
      levelOffset: g.isConsecutive ? 4 : 0,
    };
  });
}

/**
 * ANÁLISES PRIMÁRIAS HABILITADAS PARA GERAÇÃO DE SINAIS:
 * 1. Padrões de Pedra: A2 (Rep. Simples), A19 (Sanduíche Pontas), A20 (Sanduíche Meio)
 * 2. Gatilhos de Sequência: A10 (8->11), A11 (11->11), A12 (4->11), A13 (4<->14), A21 (7<->11)
 * 3. Somas Consecutivas: A14 (Soma 17), A15 (Soma 19), A16 (Soma 21)
 * 4. Quebra de Padrões de Cores: Q1..Q7 (IDs 50 a 56: Alternados, Alt. Contínuos 2x2, 1N 3x3, 2N 4x4, Contínuos 5x, Contínuos N1 6x, Contínuos N2 7x+)
 *
 * Todas as demais análises (Minutos 0 a 9) e estratégias (E1-E15, Somas) servem estritamente como CONFLUÊNCIA.
 */
export const PRIMARY_SIGNAL_ANALYSIS_IDS = DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS;

export function isPrimarySignalAnalysis(
  analysisId: number,
  customActiveIds?: Set<number> | null,
): boolean {
  if (customActiveIds) {
    return customActiveIds.has(analysisId);
  }
  return isAnalysisActiveForSignals(analysisId);
}

export function getAnalysisGroupName(analysisId: number): string {
  if (analysisId >= 60 && analysisId <= 114) {
    return "Quebra de Recuperação";
  }
  if (analysisId === 202) {
    return "Estratégia F2";
  }
  if (analysisId === 2 || analysisId === 19 || analysisId === 20) {
    return "Padrões de Pedra";
  }
  if (
    analysisId === 10 ||
    analysisId === 11 ||
    analysisId === 12 ||
    analysisId === 13 ||
    analysisId === 21
  ) {
    return "Gatilhos de Sequência";
  }
  if (analysisId === 14 || analysisId === 15 || analysisId === 16) {
    return "Somas Consecutivas";
  }
  if (analysisId >= 50 && analysisId <= 56) {
    return "Quebra de Padrões de Cores";
  }
  return "Minutos (Confluência)";
}

export function formatAnalysisCode(analysisId: number): string {
  if (analysisId >= 60 && analysisId <= 114) {
    return `A${analysisId}`;
  }
  if (analysisId === 202) {
    return "F2";
  }
  if (analysisId >= 50 && analysisId <= 56) {
    return `Q${analysisId - 49}`;
  }
  return `A${analysisId}`;
}

/**
 * MOTOR DE SINAIS: GERADO EXCLUSIVAMENTE PELAS ANÁLISES ATIVAS
 * COM DEMAIS ANÁLISES E ESTRATÉGIAS DESATIVADAS SERVINDO ESTREITAMENTE DE CONFLUÊNCIA.
 */
export function buildStrategyTriggeredSignals(
  sumProjections: SumTriggerProjection[],
  analysisCandidates: RawCandidate[],
  confirmationProjections: StrategyProjection[] = [],
  activeRecAlerts: Array<{ type: string; start: number; end: number }> = [],
  now: number = Date.now(),
  options?: {
    allowHistorical?: boolean;
    minTargetTime?: number;
    maxTargetTime?: number;
    activeAnalysisIds?: Set<number>;
  },
  tendencyCandidates: RawTendencyCandidate[] = [],
): PredictiveSignal[] {
  // 1. Isola candidatos primários elegíveis para GERAR sinais:
  // - Apenas Análises Ativas para Envio de Sinais
  // - Apenas Top 1 (isTop1 === true e rank === 1)
  // - Assertividade de 80% a 100%
  // - Padrões de pedras (A2, A19, A20) elegíveis para qualquer pedra (0 a 14)
  const activeIds = options?.activeAnalysisIds ?? getActiveSignalAnalysisIds();

  const isEligiblePrimary = (ac: RawCandidate) => {
    if (!ac || !ac.targetDate) return false;
    if (!activeIds.has(ac.analysis)) return false;
    if (!ac.isTop1 || ac.rank !== 1) return false;
    if (ac.pct < 80 || ac.pct > 100) return false;
    return true;
  };

  const primaryCandidates = (analysisCandidates || []).filter(isEligiblePrimary);

  // Todas as demais análises e projeções (Top 2/3 75-79%, pedras 1-14 de padrões, Minutos 0-9, etc.) atuam estritamente como CONFLUÊNCIA
  const confluenceCandidates = (analysisCandidates || []).filter((ac) => {
    if (!ac || !ac.targetDate) return false;
    return !isEligiblePrimary(ac);
  });

  if (primaryCandidates.length === 0) return [];

  // 2. Filtra candidatos primários pelo horizonte temporal
  const validPrimary = primaryCandidates.filter((p) => {
    const t = p.targetDate.getTime();
    if (Number.isNaN(t)) return false;
    if (options?.allowHistorical) {
      const min = options.minTargetTime ?? 0;
      const max = options.maxTargetTime ?? Infinity;
      return t >= min && t <= max;
    }
    return t >= now - 60_000;
  });

  if (validPrimary.length === 0) return [];

  // Normaliza horário do gatilho para o início do minuto
  const normalizedPrimary = validPrimary.map((c) => {
    const dt = new Date(c.targetDate.getTime());
    dt.setSeconds(0, 0);
    dt.setMilliseconds(0);
    return { ...c, normalizedDate: dt, normalizedTime: dt.getTime() };
  });

  // Agrupa candidatos primários por minuto
  const minuteMap = new Map<number, typeof normalizedPrimary>();
  for (const cand of normalizedPrimary) {
    const list = minuteMap.get(cand.normalizedTime) || [];
    list.push(cand);
    minuteMap.set(cand.normalizedTime, list);
  }

  // Agrupa candidatos primários em clusters de horários vizinhos priorizando a assertividade do gap:
  // "Os sinais devem seguir o gap da analise geradora, as conflencia devem apenas acompanhar o horario (m-1, m , m+1) gerado.
  // Ex. 13:30 analise geradora. 13:31,13:30,13:29,13:29,13:29 analises confluencia. O horario do sinal permanece 13:30.
  // Quando mais de uma analise geradora tiver horarios vizinhos, deve verificar qual gap está mais assertivo."

  // 1. Cria lista ordenada de candidatos primários por assertividade decrescente do gap
  const unassignedPrimary = [...normalizedPrimary].sort((a, b) => {
    if (b.pct !== a.pct) return b.pct - a.pct;
    const rA = a.rank || 1;
    const rB = b.rank || 1;
    if (rA !== rB) return rA - rB;
    if (a.normalizedTime !== b.normalizedTime) return a.normalizedTime - b.normalizedTime;
    return a.analysis - b.analysis;
  });

  interface PrimaryCluster {
    dominantPrimary: (typeof normalizedPrimary)[0];
    repTimestamp: number;
    repDate: Date;
    clusterPrimary: typeof normalizedPrimary;
    clusterWindowStart: number;
    clusterWindowEnd: number;
  }

  const primaryClusters: PrimaryCluster[] = [];
  const assignedCandKeys = new Set<string>();

  for (const candidate of unassignedPrimary) {
    const candKey = `${candidate.analysis}_${candidate.value}_${candidate.normalizedTime}`;
    if (assignedCandKeys.has(candKey)) continue;

    // Este candidato tem o gap mais assertivo entre os restantes e se torna a análise geradora
    const dominantPrimary = candidate;
    const repTimestamp = candidate.normalizedTime;
    const repDate = new Date(repTimestamp);

    // Janela de confluência rigorosamente fixada em (m-1, m, m+1) a partir do horário gerado
    const clusterWindowStart = repTimestamp - 60_000;
    const clusterWindowEnd = repTimestamp + 60_000;

    // Coleta todas as análises geradoras vizinhas (horários m-1, m, m+1) para acompanhar este sinal
    const clusterPrimary: typeof normalizedPrimary = [];

    for (const other of unassignedPrimary) {
      const oKey = `${other.analysis}_${other.value}_${other.normalizedTime}`;
      if (assignedCandKeys.has(oKey)) continue;

      // Se for vizinho temporal (dentro de m-1, m, m+1 do horário gerado)
      if (other.normalizedTime >= clusterWindowStart && other.normalizedTime <= clusterWindowEnd) {
        clusterPrimary.push(other);
        assignedCandKeys.add(oKey);
      }
    }

    primaryClusters.push({
      dominantPrimary,
      repTimestamp,
      repDate,
      clusterPrimary,
      clusterWindowStart,
      clusterWindowEnd,
    });
  }

  // Ordena os clusters cronologicamente pelo horário gerado
  primaryClusters.sort((a, b) => a.repTimestamp - b.repTimestamp);

  // Atribuição EXCLUSIVA de tendências 3/3 para evitar que a MESMA tendência
  // seja associada a múltiplos sinais/clusters com diferença de 1 minuto
  const clusterTendencyAssignments = new Map<number, RawTendencyCandidate[]>();

  for (const tc of tendencyCandidates || []) {
    if (!tc || !tc.targetDate || tc.ratio !== "3/3") continue;
    const t = tc.targetDate.getTime();
    if (Number.isNaN(t)) continue;

    let bestClusterIdx = -1;
    let bestDist = Infinity;

    primaryClusters.forEach((c, idx) => {
      if (t >= c.clusterWindowStart && t <= c.clusterWindowEnd) {
        const dist = Math.abs(c.repTimestamp - t);
        if (dist < bestDist) {
          bestDist = dist;
          bestClusterIdx = idx;
        }
      }
    });

    if (bestClusterIdx !== -1) {
      const list = clusterTendencyAssignments.get(bestClusterIdx) || [];
      list.push(tc);
      clusterTendencyAssignments.set(bestClusterIdx, list);
    }
  }

  const signals: PredictiveSignal[] = [];

  for (let clusterIdx = 0; clusterIdx < primaryClusters.length; clusterIdx++) {
    const {
      dominantPrimary,
      repTimestamp,
      repDate,
      clusterPrimary,
      clusterWindowStart,
      clusterWindowEnd,
    } = primaryClusters[clusterIdx];

    if (clusterPrimary.length === 0) continue;

    // 1. Busca confluências das Demais Análises (Minutos 0..9)
    // As confluências apenas acompanham o horário (m-1, m, m+1) gerado pela análise geradora
    const matchingConfluenceAnalyses = confluenceCandidates.filter((ac) => {
      const t = ac.targetDate.getTime();
      return t >= clusterWindowStart && t <= clusterWindowEnd;
    });

    // 2. Busca confluências das Estratégias: TODAS AS ESTRATÉGIAS ATIVAS PARA SERVIR DE CONFLUÊNCIA
    // (B1, B2, B3, F2, Soma 19, Soma 17, E1-E15)
    const matchingSumProjections = (sumProjections || []).filter((sp) => {
      if (!sp || !sp.targetDate) return false;
      const t = sp.targetDate.getTime();
      return t >= clusterWindowStart && t <= clusterWindowEnd;
    });

    const matchingConfProjections = (confirmationProjections || []).filter((cp) => {
      if (!cp || !cp.targetDate) return false;
      const t = cp.targetDate.getTime();
      return t >= clusterWindowStart && t <= clusterWindowEnd;
    });

    const rawStrategyCodes: string[] = [];
    matchingSumProjections.forEach((sp) => {
      if (sp.code) rawStrategyCodes.push(sp.code);
    });
    matchingConfProjections.forEach((cp) => {
      if (cp.code) rawStrategyCodes.push(cp.code);
    });

    const distinctStrategies: string[] = [];
    const seenStrat = new Set<string>();
    rawStrategyCodes.forEach((st) => {
      const fmt = formatStrategyCode(st);
      if (fmt && !seenStrat.has(fmt)) {
        seenStrat.add(fmt);
        distinctStrategies.push(fmt);
      }
    });

    distinctStrategies.sort((a, b) => a.localeCompare(b));

    const hasStrategyConfluence = distinctStrategies.length > 0;
    const strategyCodesLabel = distinctStrategies.join("/");

    // REGRA DO USUÁRIO: Estratégias de soma =17&19 ativas como confluência Top 2/3
    const sumStrategyCount = distinctStrategies.length;

    // Regra do Usuário: Tendências 3/3 ("Em Alta") também servem de confluência para os outros grupos
    const matching3_3Tendencies = clusterTendencyAssignments.get(clusterIdx) || [];
    const hasTendencyConfluence = matching3_3Tendencies.length > 0;
    const tendencyConfluenceCount = matching3_3Tendencies.length;

    // Todas as análises ativas na janela (Primárias + Confluência)
    const allMatchingAnalyses = [...clusterPrimary, ...matchingConfluenceAnalyses];
    const top1Analyses = allMatchingAnalyses.filter((ac) => ac.isTop1);
    const top3Analyses = allMatchingAnalyses.filter((ac) => !ac.isTop1);

    const distinctTop1Analyses = Array.from(new Set(top1Analyses.map((s) => s.analysis)));
    const distinctTop3Analyses = Array.from(new Set(top3Analyses.map((s) => s.analysis)));
    const top1Count = distinctTop1Analyses.length;
    // top3Count soma as análises secundárias Top 2/3 (75-79%), as estratégias de soma =17&19 ativas E as tendências 3/3 ("Em Alta") atuando como confluência
    const top3Count = distinctTop3Analyses.length + sumStrategyCount + tendencyConfluenceCount;

    // Análises primárias que originaram o sinal
    const distinctPrimaryAnalyses = Array.from(new Set(clusterPrimary.map((p) => p.analysis)));
    const primaryCodesLabel = distinctPrimaryAnalyses.map(formatAnalysisCode).join("/");
    const primaryGroupName = getAnalysisGroupName(distinctPrimaryAnalyses[0]);

    // Avaliação da hierarquia e nível do sinal baseada nas confluências
    let evaluation: SignalLevelEvaluation;

    if (top1Count >= 4) {
      evaluation = {
        rank: SignalRank.ALAVANCAGEM,
        category: "alavancagem",
        groupName: "Alavancagem",
        label: `Alavancagem (${primaryCodesLabel})`,
        medal: `🚀 ALAVANCAGEM (${top1Count}x Top 1 · ${primaryGroupName})`,
        isAlavancagem: true,
        isSupreme: false,
        isRare: false,
        isTop1: true,
      };
    } else if (
      (top1Count === 2 || top1Count === 3) &&
      (top3Count >= 2 || hasStrategyConfluence || hasTendencyConfluence)
    ) {
      evaluation = {
        rank: SignalRank.SUPREME,
        category: "supreme",
        groupName: "Supremo",
        label: `Supremo (${primaryCodesLabel}${hasStrategyConfluence ? ` + ${strategyCodesLabel}` : ""}${hasTendencyConfluence ? " + Em Alta" : ""})`,
        medal: `👑 Supremo (${top1Count}x Top 1 · ${primaryGroupName})`,
        isAlavancagem: false,
        isSupreme: true,
        isRare: false,
        isTop1: true,
      };
    } else if (
      top1Count === 2 ||
      top1Count === 3 ||
      (top1Count === 1 && (hasStrategyConfluence || hasTendencyConfluence))
    ) {
      evaluation = {
        rank: SignalRank.RARE,
        category: "rare",
        groupName: "Raro",
        label: `Raro (${primaryCodesLabel}${hasStrategyConfluence ? ` + ${strategyCodesLabel}` : ""}${hasTendencyConfluence ? " + Em Alta" : ""})`,
        medal: `💎 Raro (${top1Count}x Top 1 · ${primaryGroupName})`,
        isAlavancagem: false,
        isSupreme: false,
        isRare: true,
        isTop1: true,
      };
    } else if (
      top1Count === 1 &&
      (top3Count >= 1 || matchingConfluenceAnalyses.length >= 1 || hasTendencyConfluence)
    ) {
      evaluation = {
        rank: SignalRank.TOP1_TOP3,
        category: "top1_top3",
        groupName: "Top 1 & Confluência",
        label: `Top 1 & Confluência (${primaryCodesLabel})`,
        medal: `⚡ Top 1 (${primaryCodesLabel} · ${primaryGroupName})`,
        isAlavancagem: false,
        isSupreme: false,
        isRare: false,
        isTop1: true,
      };
    } else {
      evaluation = {
        rank: SignalRank.TOP1_TOP3,
        category: "top1_top3",
        groupName: primaryGroupName,
        label: `${primaryGroupName} (${primaryCodesLabel})`,
        medal: `🥇 Ouro (${primaryCodesLabel} · ${primaryGroupName})`,
        isAlavancagem: false,
        isSupreme: false,
        isRare: false,
        isTop1: true,
      };
    }

    // Calcula assertividade teórica média
    const analysisPcts = allMatchingAnalyses
      .map((a) => a.pct)
      .filter((p) => typeof p === "number" && p > 0);
    const avgPct =
      analysisPcts.length > 0
        ? Math.round((analysisPcts.reduce((a, b) => a + b, 0) / analysisPcts.length) * 10) / 10
        : hasStrategyConfluence
          ? 80.0
          : 75.0;

    // Fontes consolidadas
    const allSources = allMatchingAnalyses.map((a) => ({
      analysis: a.analysis,
      value: a.value,
      pct: a.pct,
      top3: !a.isTop1,
      rank: a.rank,
      cycleKey: a.cycleKey,
    }));

    // Regra do Usuário: Estratégias "E" desativadas nas confluências.
    // Ativas as estratégias de soma =17&19 (Soma 17 e Soma 19) e a Estratégia F2 como confluência:
    matchingSumProjections.forEach((sp, sIdx) => {
      if (sp.code === "F2" || sp.sumType === "F2") {
        allSources.push({
          analysis: 202,
          value: (sp as any).pProx || 4,
          pct: 95.0,
          top3: true,
          rank: 1,
          cycleKey: sp.id || `F2_${sp.targetTimestamp}`,
        });
      } else {
        const numericCode = parseInt(formatStrategyCode(sp.code), 10) || sIdx + 1;
        const sumBase = sp.sumType === "Soma 17" ? 20000 : 30000;
        allSources.push({
          analysis: sumBase + numericCode,
          value: numericCode,
          pct: 78.0,
          top3: true,
          rank: 2,
          cycleKey: sp.id || `SUM_${sp.code}_T${sp.targetTimestamp}`,
        });
      }
    });

    // Estratégias confirmadas na janela:
    const clusterConfirmed: ConfirmedStrategyInfo[] = [];
    matchingConfProjections.forEach((cp, cIdx) => {
      clusterConfirmed.push({
        id: cp.id,
        code: cp.code,
        name: cp.name,
        type: cp.type,
      });
      allSources.push({
        analysis: 40000 + (cp.id || cIdx + 1),
        value: cp.id || cIdx + 1,
        pct: 85.0,
        top3: true,
        rank: 2,
        cycleKey: `CONF_${cp.code}_T${cp.targetTimestamp}`,
      });
    });

    // Formata textos de confluência
    const formattedAnalyses: string[] = [];
    const seenAnalyses = new Set<string>();
    allMatchingAnalyses.forEach((a) => {
      const code = formatAnalysisCode(a.analysis);
      const key = `${code}-${a.value}`;
      if (!seenAnalyses.has(key)) {
        seenAnalyses.add(key);
        const pctStr = typeof a.pct === "number" && a.pct > 0 ? ` ${Math.round(a.pct)}%` : "";
        formattedAnalyses.push(`${code}-${a.value}${pctStr}`);
      }
    });

    // Regra 3: As tendências com 100% de 3/3 atuam como confluência para os outros grupos
    // Exclusividade garantida: cada tendência é atribuída unicamente ao cluster temporalmente mais próximo
    if (matching3_3Tendencies.length > 0) {
      matching3_3Tendencies.forEach((tc) => {
        allSources.push({
          analysis: tc.analysis,
          value: tc.value,
          pct: 100,
          top3: false,
          rank: 1,
          cycleKey: tc.cycleKey,
        });
        const code = formatAnalysisCode(tc.analysis);
        const tKey = `T3/3·${code}-${tc.value}`;
        if (!seenAnalyses.has(tKey)) {
          seenAnalyses.add(tKey);
          formattedAnalyses.push(tKey);
        }
      });
    }

    const confluenceParts: string[] = [];
    if (distinctStrategies.length > 0) {
      confluenceParts.push(distinctStrategies.join(", "));
    }
    if (formattedAnalyses.length > 0) {
      confluenceParts.push(formattedAnalyses.join(", "));
    }

    const confluenceText =
      confluenceParts.length > 0
        ? confluenceParts.join(" · ")
        : `${primaryGroupName} (${primaryCodesLabel})`;

    const isHighTendency = allMatchingAnalyses.some((a) => a.isHighTendency);
    const isPossibleRec = Array.isArray(activeRecAlerts)
      ? activeRecAlerts.some((alert) => {
          const signalTime = repDate.getTime();
          return signalTime >= alert.start && signalTime <= alert.end;
        })
      : false;

    const canonicalKey = getCanonicalSignalKey(repDate);
    const computedStrategyKey =
      dominantPrimary.strategyKey || formatAnalysisCode(dominantPrimary.analysis) || "A2";

    const hasYellowSeal = clusterConfirmed.some((c) => c.type === "yellow");
    const hasBlueSeal = clusterConfirmed.some((c) => c.type === "blue");
    const isVerified = hasYellowSeal || hasBlueSeal || clusterConfirmed.length > 0;

    signals.push({
      key: canonicalKey,
      time: fmtClock(repDate),
      pct: avgPct,
      label: evaluation.label,
      confluence: confluenceText,
      strategies: distinctStrategies,
      medal: evaluation.medal,
      entryDate: repDate,
      outcome: "pending" as const,
      isHighTendency,
      isRecAlert: isPossibleRec,
      category: evaluation.category,
      groupName: evaluation.groupName,
      isTop1: evaluation.isTop1,
      isAlavancagem: evaluation.isAlavancagem,
      isRare: evaluation.isRare,
      isSupreme: evaluation.isSupreme,
      isNoConfluence: false,
      strategyKey: computedStrategyKey,
      primaryAnalyses: Array.from(new Set(clusterPrimary.map((p) => p.analysis))),
      sources: allSources,
      clusterTimestamps: Array.from(new Set(clusterPrimary.map((p) => p.normalizedTime))),
      allowsOscillation: false,
      isConsecutive: false,
      levelOffset: 0,
      confirmedStrategies: clusterConfirmed,
      hasYellowSeal,
      hasBlueSeal,
      isVerified,
      dominantGap: dominantPrimary.gap,
      gap: dominantPrimary.gap,
      generatorAnalysis: dominantPrimary.analysis,
      generatorPct: dominantPrimary.pct,
      generatorGap: dominantPrimary.gap,
    });
  }

  // Ordena cronologicamente (estratégias E desativadas nas confluências)
  return signals.sort((a, b) => {
    const tA =
      a.entryDate instanceof Date ? a.entryDate.getTime() : new Date(a.entryDate || 0).getTime();
    const tB =
      b.entryDate instanceof Date ? b.entryDate.getTime() : new Date(b.entryDate || 0).getTime();
    return tA - tB;
  });
}

/**
 * Grupo 'EM ALTA':
 * - Fica abaixo de todos os outros grupos (Alavancagem, Supremo, Raro, Top 1 & Top 3).
 * - Só recebe sinais da "TENDÊNCIA".
 * - Regra 3: Apenas tendências com 100% de 3/3 têm poder para enviar sinal no grupo 'EM ALTA'.
 * - Regra 3: Tendências acima de 60% e abaixo de 100% (2/3) só servem de confluência exclusivamente no grupo 'EM ALTA'.
 * - Regra 4: Se algum outro grupo mostrar o mesmo horário (sinal), o sinal do grupo 'EM ALTA' SOME.
 * - Regra 5: Confluência e painel de auditoria seguem a mesma lógica para esse novo grupo.
 */
export function buildEmAltaSignals(
  tendencyCandidates: RawTendencyCandidate[],
  higherTierSignals: PredictiveSignal[],
  now: number = Date.now(),
  options?: {
    activeAnalysisIds?: Set<number> | number[];
  },
): PredictiveSignal[] {
  // Grupo 'Em Alta' e cálculo de tendência pausados a pedido do usuário
  return [];

  const activeIds = options?.activeAnalysisIds
    ? options.activeAnalysisIds instanceof Set
      ? options.activeAnalysisIds
      : new Set<number>(options.activeAnalysisIds)
    : undefined;

  // 1. Horários já ocupados pelos grupos de maior hierarquia e rastreamento de tendências utilizadas
  const occupiedMinutes = new Set<number>();
  const occupiedClocks = new Set<string>();
  const usedTendencyKeysInHigherTier = new Set<string>();
  const higherTierTendencyAnalysesByMinute = new Map<number, Set<number>>();

  for (const sig of higherTierSignals || []) {
    const dt = sig.entryDate instanceof Date ? sig.entryDate : new Date(sig.entryDate || 0);
    const sigMs = dt.getTime();
    if (!Number.isNaN(sigMs)) {
      const minStart = Math.floor(sigMs / 60_000) * 60_000;
      occupiedMinutes.add(minStart);
      occupiedClocks.add(fmtClock(dt));

      for (const src of sig.sources || []) {
        if (src.cycleKey) {
          usedTendencyKeysInHigherTier.add(src.cycleKey);
        }
        if (
          src.cycleKey?.startsWith("TEND_") ||
          src.cycleKey?.startsWith("T3/3") ||
          (src.rank === 1 && src.pct === 100)
        ) {
          const set = higherTierTendencyAnalysesByMinute.get(minStart) || new Set<number>();
          set.add(src.analysis);
          higherTierTendencyAnalysesByMinute.set(minStart, set);
        }
      }
    }
  }

  // 2. Tendências com 100% (3/3):
  // REGRAS DEFINITIVAS:
  // - ANÁLISE LIGADA = pode gerar sinal primário.
  // - ANÁLISE DESLIGADA = NÃO pode gerar sinal primário.
  // - TENDÊNCIA de uma análise desligada = NÃO pode gerar sinal por conta própria.
  // - TENDÊNCIA de uma análise desligada = pode participar de CONFLUÊNCIA de uma análise ligada.
  const valid3_3 = (tendencyCandidates || []).filter((tc) => {
    if (!tc || !tc.targetDate) return false;
    // Análises Q (60 a 114): conforme a regra de segurança, a tendência de Quebra de Recuperação sozinha NÃO gera sinal!
    if (tc.analysis >= 60 && tc.analysis <= 114) return false;
    if (tc.ratio !== "3/3" || tc.pct < 100) return false;
    // Se a análise estiver DESLIGADA, NÃO tem poder de gerar sinal por conta própria!
    if (activeIds && !activeIds.has(tc.analysis)) return false;
    const t = tc.targetDate.getTime();
    if (Number.isNaN(t) || t < now - 60_000) return false;

    const tcKey =
      tc.cycleKey ||
      `TEND_A${tc.analysis}_V${tc.value}_T${tc.triggerAt?.getTime?.() || tc.targetDate.getTime()}`;

    // A mesma tendência já foi utilizada por um grupo de maior hierarquia
    if (usedTendencyKeysInHigherTier.has(tcKey)) return false;

    const candMin = Math.floor(t / 60_000) * 60_000;
    const clockStr = fmtClock(tc.targetDate);

    // Regra 4: se algum outro grupo mostrar mesmo horário (sinal), o sinal do grupo 'em alta' some
    if (occupiedMinutes.has(candMin) || occupiedClocks.has(clockStr)) {
      return false;
    }

    // Regra de Não Duplicação a 1 minuto:
    // Se um sinal de maior hierarquia a 1 minuto de diferença utilizou essa mesma análise de tendência, bloqueia
    for (let offset = -60_000; offset <= 60_000; offset += 60_000) {
      const neighborMin = candMin + offset;
      const analyses = higherTierTendencyAnalysesByMinute.get(neighborMin);
      if (analyses && analyses.has(tc.analysis)) {
        return false;
      }
    }

    return true;
  });

  if (valid3_3.length === 0) return [];

  // Tendências 3/3 de análises DESLIGADAS: NÃO podem gerar sinal por conta própria,
  // mas PODEM participar de confluência de uma análise ligada que gerou sinal no mesmo minuto!
  const inactive3_3ForConfluence = (tendencyCandidates || []).filter((tc) => {
    if (!tc || !tc.targetDate) return false;
    if (tc.analysis >= 60 && tc.analysis <= 114) return false;
    if (tc.ratio !== "3/3" || tc.pct < 100) return false;
    // Só entram aqui se a análise estiver DESLIGADA
    if (!activeIds || activeIds.has(tc.analysis)) return false;
    const t = tc.targetDate.getTime();
    if (Number.isNaN(t) || t < now - 60_000) return false;
    const tcKey =
      tc.cycleKey ||
      `TEND_A${tc.analysis}_V${tc.value}_T${tc.triggerAt?.getTime?.() || tc.targetDate.getTime()}`;
    if (usedTendencyKeysInHigherTier.has(tcKey)) return false;
    return true;
  });

  // 3. Tendências acima de 60% e abaixo de 100% (2/3): confluência exclusiva no grupo 'EM ALTA'
  const valid2_3 = (tendencyCandidates || []).filter((tc) => {
    if (!tc || !tc.targetDate) return false;
    if (tc.ratio !== "2/3") return false;
    const t = tc.targetDate.getTime();
    return !Number.isNaN(t) && t >= now - 60_000;
  });

  // Agrupa tendências 3/3 ativas por minuto
  const minuteMap = new Map<number, RawTendencyCandidate[]>();
  for (const cand of valid3_3) {
    const minStart = Math.floor(cand.targetDate.getTime() / 60_000) * 60_000;
    const list = minuteMap.get(minStart) || [];
    list.push(cand);
    minuteMap.set(minStart, list);
  }

  // Ordena os minutos candidatos
  const sortedMinutes = Array.from(minuteMap.keys()).sort((a, b) => a - b);

  // Exclusividade de tendências da mesma análise com 1 minuto de diferença entre sinais do próprio grupo 'EM ALTA'
  const emAltaEmittedAnalysesByMinute = new Map<number, Set<number>>();
  const filteredMinuteMap = new Map<number, RawTendencyCandidate[]>();

  for (const minStart of sortedMinutes) {
    const tendencies = minuteMap.get(minStart) || [];
    const validForThisMinute: RawTendencyCandidate[] = [];

    for (const cand of tendencies) {
      // Verifica se a mesma análise já foi aceita em minStart - 60_000 (1 minuto antes)
      const prevMin = minStart - 60_000;
      const prevAnalyses = emAltaEmittedAnalysesByMinute.get(prevMin);
      if (prevAnalyses && prevAnalyses.has(cand.analysis)) {
        // Já foi enviado um sinal da mesma análise 1 minuto antes! Ignora neste minuto.
        continue;
      }
      validForThisMinute.push(cand);
    }

    if (validForThisMinute.length > 0) {
      filteredMinuteMap.set(minStart, validForThisMinute);
      const set = emAltaEmittedAnalysesByMinute.get(minStart) || new Set<number>();
      validForThisMinute.forEach((c) => set.add(c.analysis));
      emAltaEmittedAnalysesByMinute.set(minStart, set);
    }
  }

  // Atribuição de confluências 2/3 e 3/3 (de análises desligadas) ao minuto de 'EM ALTA'
  const conf2_3Map = new Map<number, RawTendencyCandidate[]>();
  const activeMinutes = Array.from(filteredMinuteMap.keys());

  for (const tc of valid2_3) {
    const t = tc.targetDate.getTime();
    let bestMin = -1;
    let bestDist = Infinity;

    for (const m of activeMinutes) {
      if (t >= m - 60_000 && t <= m + 60_000) {
        const dist = Math.abs(m - t);
        if (dist < bestDist) {
          bestDist = dist;
          bestMin = m;
        }
      }
    }

    if (bestMin !== -1) {
      const list = conf2_3Map.get(bestMin) || [];
      list.push(tc);
      conf2_3Map.set(bestMin, list);
    }
  }

  const emAltaSignals: PredictiveSignal[] = [];

  for (const [minStart, primaryTendencies] of filteredMinuteMap.entries()) {
    if (primaryTendencies.length === 0) continue;

    const repDate = new Date(minStart);
    const conf2_3 = conf2_3Map.get(minStart) || [];

    // Inclui tendências 3/3 de análises desligadas no mesmo minuto estritamente como confluência
    const inactiveSameMin = inactive3_3ForConfluence.filter(
      (tc) => Math.floor(tc.targetDate.getTime() / 60_000) * 60_000 === minStart,
    );

    const allClusterTendencies = [...primaryTendencies, ...inactiveSameMin, ...conf2_3];

    const primaryCodes = Array.from(
      new Set(primaryTendencies.map((t) => formatAnalysisCode(t.analysis))),
    );
    const confCodes = Array.from(
      new Set([
        ...inactiveSameMin.map((t) => `${formatAnalysisCode(t.analysis)} (3/3 conf)`),
        ...conf2_3.map((t) => `${formatAnalysisCode(t.analysis)} (2/3)`),
      ]),
    );

    const sources = allClusterTendencies.map((t) => ({
      analysis: t.analysis,
      value: t.value,
      pct: t.pct,
      top3: t.ratio === "2/3" || inactiveSameMin.includes(t),
      rank: primaryTendencies.includes(t) ? 1 : 2,
      cycleKey: t.cycleKey,
    }));

    const confluenceItems = allClusterTendencies.map(
      (t) => `${formatAnalysisCode(t.analysis)}-${t.value} (${t.ratio} · Gap ${t.gap}m)`,
    );

    const canonicalKey = getCanonicalSignalKey(repDate);

    emAltaSignals.push({
      key: canonicalKey,
      time: fmtClock(repDate),
      pct: 100.0,
      label: `Tendência 3/3 (${primaryCodes.join("/")})${confCodes.length > 0 ? ` + ${confCodes.join(", ")}` : ""}`,
      confluence: confluenceItems.join(" · "),
      strategies: [],
      medal: `🥈 EM ALTA (${primaryTendencies.length}x Tendência 3/3)`,
      entryDate: repDate,
      outcome: "pending" as const,
      isHighTendency: true,
      category: "em_alta",
      groupName: "Em Alta",
      isEmAlta: true,
      isTop1: false,
      isAlavancagem: false,
      isRare: false,
      isSupreme: false,
      isNoConfluence: false,
      strategyKey: primaryCodes[0] || "A",
      primaryAnalyses: primaryTendencies.map((t) => t.analysis),
      sources,
      clusterTimestamps: [minStart],
      allowsOscillation: false,
      isConsecutive: false,
      levelOffset: 0,
      confirmedStrategies: [],
      hasYellowSeal: false,
      hasBlueSeal: false,
      isVerified: false,
    });
  }

  return emAltaSignals.sort((a, b) => {
    const tA =
      a.entryDate instanceof Date ? a.entryDate.getTime() : new Date(a.entryDate || 0).getTime();
    const tB =
      b.entryDate instanceof Date ? b.entryDate.getTime() : new Date(b.entryDate || 0).getTime();
    return tA - tB;
  });
}

/**
 * Mescla sinais existentes com novos candidatos gerados garantindo:
 * 1. Congelamento estrito em (sinal - 1 minuto): ao atingir targetTime - 1 min, o sinal não pode mais ser atualizado por novas análises/gerações.
 * 2. Aguarda a verificação de win/loss acontecer.
 * 3. Após a resolução de win/loss, aguarda o período estabelecido (3 minutos) e sai da tela.
 * 4. Sinais PENDING NUNCA desaparecem prematuramente.
 * 5. Promoção monotônica de nível antes do congelamento (novo rank > rank atual).
 * 6. Downgrade é estritamente proibido.
 * 7. Bloqueio de publicação se já houver branco em M-1.
 * 8. Sinais concluídos (WIN/LOSS) permanecem imutáveis.
 */
export function mergeSignalsLifecycle(
  existingSignals: PredictiveSignal[],
  newCandidates: PredictiveSignal[],
  results: ResultItemInput[],
  now: number = Date.now(),
  options?: {
    allowHistorical?: boolean;
    maxPastWindowMs?: number;
  },
): PredictiveSignal[] {
  const resultMap = new Map<string, PredictiveSignal>();
  const maxPastMs = options?.maxPastWindowMs ?? 5 * 3600_000;

  // 1. Carrega todos os sinais existentes
  for (const sig of existingSignals || []) {
    if (!sig || !sig.entryDate) continue;
    const canonicalKey = getCanonicalSignalKey(sig.entryDate);
    const sigTime =
      sig.entryDate instanceof Date
        ? sig.entryDate.getTime()
        : parseUtcDate(sig.entryDate as any).getTime();

    // Sinais concluídos que já passaram da janela de 3 minutos de exibição são descartados da tela ao vivo
    if (!options?.allowHistorical && sig.outcome && sig.outcome !== "pending") {
      const compTime = sig.completedAt || sigTime;
      if (now - compTime > 180_000) {
        continue;
      }
      // Sinais concluídos válidos na janela de 3 minutos são mantidos 100% intactos e imutáveis
      resultMap.set(canonicalKey, {
        ...sig,
        key: sig.key || canonicalKey,
        isLocked: true,
      });
      continue;
    }

    // Sinais pendentes com horário no passado (> 5 minutos após o minuto alvo) são descartados (sem limite futuro de 60 min)
    const pastLimit = options?.allowHistorical ? maxPastMs : 300_000;
    if (sig.outcome === "pending" && !Number.isNaN(sigTime) && now - sigTime > pastLimit) {
      continue;
    }

    // Se for sinal pendente de categoria descontinuada (Top 1 isolado ou Apenas Top 3), remove
    const cat = (sig.category || "").toLowerCase();
    if (
      sig.outcome === "pending" &&
      (cat === "top1_isolated" ||
        cat === "top3_only" ||
        cat === "top5_only" ||
        (!sig.isAlavancagem &&
          !sig.isSupreme &&
          !sig.isRare &&
          !sig.isEmAlta &&
          cat !== "em_alta" &&
          cat !== "top1_top3" &&
          !sig.isNoConfluence &&
          cat !== "no_confluence"))
    ) {
      continue;
    }

    // Se o sinal está pendente e foi gerado por análises primárias desativadas pelo usuário, descarta
    const activeIds = options?.activeAnalysisIds ?? getActiveSignalAnalysisIds();
    if (sig.outcome === "pending" && activeIds) {
      if (cat === "em_alta" || sig.isEmAlta) {
        const primaryTendencies = (sig.sources || []).filter(
          (s: any) => !s.top3 && (s.pct ?? 0) >= 100,
        );
        const primaryList =
          primaryTendencies.length > 0
            ? primaryTendencies.map((s: any) => s.analysis)
            : sig.primaryAnalyses && sig.primaryAnalyses.length > 0
              ? sig.primaryAnalyses
              : [];

        if (primaryList.length > 0 && !primaryList.some((aId: number) => activeIds.has(aId))) {
          // Nenhuma análise primária de tendência do sinal Em Alta está ativa -> remove
          continue;
        }
      } else {
        const primaryList =
          sig.primaryAnalyses && sig.primaryAnalyses.length > 0
            ? sig.primaryAnalyses
            : (sig.sources || [])
                .filter((s) => !s.top3 && s.rank === 1 && (s.pct ?? 0) >= 80)
                .map((s) => s.analysis);

        if (primaryList.length > 0 && !primaryList.some((aId) => activeIds.has(aId))) {
          // Nenhuma análise primária do sinal está ativa no momento -> remove da exibição
          continue;
        }
      }
    }

    // Se o horário (sinal - 1 minuto) já chegou, o sinal é congelado (isLocked)
    // Janela: 1 minuto antes do minuto alvo (sigTime - 60_000 ms)
    const isLocked = sig.isLocked || (!Number.isNaN(sigTime) && now >= sigTime - 60_000);

    const normalizedSig: PredictiveSignal = {
      ...sig,
      key: sig.key || canonicalKey,
      isLocked,
    };

    // Se já existe um sinal no mapa para este mesmo minuto canônico, preserva o de maior hierarquia
    const prevInMap = resultMap.get(canonicalKey);
    if (prevInMap) {
      const prevRank = getSignalRank(prevInMap);
      const currRank = getSignalRank(sig);
      if (prevRank > currRank) {
        continue;
      }
    }

    resultMap.set(canonicalKey, normalizedSig);
  }

  // 2. Processa cada novo candidato consolidado
  for (const cand of newCandidates || []) {
    if (!cand || !cand.entryDate) continue;
    const canonicalKey = getCanonicalSignalKey(cand.entryDate);
    const candTime =
      cand.entryDate instanceof Date
        ? cand.entryDate.getTime()
        : parseUtcDate(cand.entryDate as any).getTime();

    // Procura sinal existente correspondente:
    // Primeiro por chave canônica exata; se não houver, por confluência temporal ou compartilhamento de fontes
    let existingKey: string | undefined = undefined;
    let existing: PredictiveSignal | undefined = undefined;

    if (resultMap.has(canonicalKey)) {
      existingKey = canonicalKey;
      existing = resultMap.get(canonicalKey);
    } else {
      // Coleta análises primárias do novo candidato
      const candPrimaryAnalyses = new Set<number>();
      if (Array.isArray(cand.primaryAnalyses)) {
        cand.primaryAnalyses.forEach((id) => candPrimaryAnalyses.add(id));
      }
      (cand.sources || []).forEach((s: any) => {
        if (!s.top3 && s.analysis) candPrimaryAnalyses.add(s.analysis);
      });

      // Busca QUALQUER sinal existente na janela de confluência (±2 minutos) ou que compartilhe fontes validadas
      for (const [k, s] of resultMap.entries()) {
        if (!s || !s.entryDate) continue;
        const sTime =
          s.entryDate instanceof Date
            ? s.entryDate.getTime()
            : parseUtcDate(s.entryDate as any).getTime();
        const timeDiff = Math.abs(candTime - sTime);

        // Regra do Usuário: "As análises quando agrupadas em uma confluência gerando o horário do sinal,
        // não devem ser separadas quando esse sinal for validado (win/loss), após essa validação esse sinal deve apenas aguardar o tempo para sair da tela."
        if (s.outcome && s.outcome !== "pending") {
          const sAnalyses = new Set<number>();
          if (Array.isArray(s.primaryAnalyses)) {
            s.primaryAnalyses.forEach((id) => sAnalyses.add(id));
          }
          (s.sources || []).forEach((src: any) => {
            if (src.analysis) sAnalyses.add(src.analysis);
          });

          // Se compartilha qualquer análise da confluência validada dentro da janela de execução (M-1 a M+2 / 3 minutos):
          const sharesAnalysis = Array.from(candPrimaryAnalyses).some((id) => sAnalyses.has(id));
          const inExecutionWindow = candTime >= sTime - 60_000 && candTime <= sTime + 180_000;
          const inCluster =
            Array.isArray(s.clusterTimestamps) &&
            s.clusterTimestamps.some((ct: number) => Math.abs(candTime - ct) <= 60_000);

          if ((sharesAnalysis && inExecutionWindow) || inCluster || timeDiff <= 120_000) {
            existingKey = k;
            existing = s;
            break;
          }
        } else {
          // Sinal pendente: confluência por proximidade de até 2 minutos (120.000 ms) ou pertencimento ao cluster
          const inCluster =
            Array.isArray(s.clusterTimestamps) &&
            s.clusterTimestamps.some((ct: number) => Math.abs(candTime - ct) <= 60_000);
          if (timeDiff <= 120_000 || inCluster) {
            existingKey = k;
            existing = s;
            break;
          }
        }
      }
    }

    const candRank = getSignalRank(cand);
    const whiteInM1 = hasWhiteInPreviousMinute(cand.entryDate, results);

    if (!existing) {
      // Verifica se a análise primária do candidato está ativa
      const activeIds = options?.activeAnalysisIds ?? getActiveSignalAnalysisIds();
      if (activeIds) {
        const isCandEmAlta = cand.category === "em_alta" || cand.isEmAlta;
        if (isCandEmAlta) {
          const primaryTendencies = (cand.sources || []).filter(
            (s: any) => !s.top3 && (s.pct ?? 0) >= 100,
          );
          const primaryList =
            primaryTendencies.length > 0
              ? primaryTendencies.map((s: any) => s.analysis)
              : cand.primaryAnalyses && cand.primaryAnalyses.length > 0
                ? cand.primaryAnalyses
                : [];
          if (primaryList.length > 0 && !primaryList.some((aId: number) => activeIds.has(aId))) {
            continue;
          }
        } else {
          const primaryList =
            cand.primaryAnalyses && cand.primaryAnalyses.length > 0
              ? cand.primaryAnalyses
              : (cand.sources || [])
                  .filter((s: any) => !s.top3 && s.rank === 1 && (s.pct ?? 0) >= 80)
                  .map((s: any) => s.analysis);
          if (primaryList.length > 0 && !primaryList.some((aId: number) => activeIds.has(aId))) {
            continue;
          }
        }
      }

      // Novo candidato:
      // Se o horário (sinal - 1) já passou para esse novo candidato, não publica novo sinal de última hora
      // (a menos que seja o motor autônomo auditando sinais históricos recentes)
      if (!options?.allowHistorical && !Number.isNaN(candTime) && now >= candTime - 60_000) {
        continue;
      }

      // Se já houve branco em M-1, bloqueia a publicação!
      if (whiteInM1) {
        continue;
      }

      // Bloqueio de 1 minuto: a mesma tendência NÃO pode ser utilizada para enviar sinais com diferença de um minuto
      let hasTendencyConflictWithNeighbor = false;
      const candSources = cand.sources || [];
      const candTendencyCycleKeys = new Set(
        candSources
          .filter(
            (s: any) =>
              (s.cycleKey && (s.cycleKey.startsWith("TEND_") || s.cycleKey.startsWith("T3/3"))) ||
              cand.isEmAlta,
          )
          .map((s: any) => s.cycleKey)
          .filter(Boolean),
      );
      const candTendencyAnalyses = new Set(
        candSources
          .filter(
            (s: any) =>
              (s.cycleKey && (s.cycleKey.startsWith("TEND_") || s.cycleKey.startsWith("T3/3"))) ||
              cand.isEmAlta,
          )
          .map((s: any) => s.analysis),
      );

      if (candTendencyCycleKeys.size > 0 || candTendencyAnalyses.size > 0) {
        for (const s of resultMap.values()) {
          if (!s || !s.entryDate) continue;
          const sTime =
            s.entryDate instanceof Date
              ? s.entryDate.getTime()
              : parseUtcDate(s.entryDate as any).getTime();
          if (Math.abs(candTime - sTime) <= 60_000) {
            for (const src of s.sources || []) {
              if (src.cycleKey && candTendencyCycleKeys.has(src.cycleKey)) {
                hasTendencyConflictWithNeighbor = true;
                break;
              }
              if (
                (src.cycleKey?.startsWith("TEND_") ||
                  src.cycleKey?.startsWith("T3/3") ||
                  s.isEmAlta) &&
                candTendencyAnalyses.has(src.analysis)
              ) {
                hasTendencyConflictWithNeighbor = true;
                break;
              }
            }
            if (hasTendencyConflictWithNeighbor) break;
          }
        }
      }

      if (hasTendencyConflictWithNeighbor) {
        continue;
      }

      // Verifica proximidade estrita: se já existe QUALQUER sinal a <= 60s, não cria novo sinal avulso
      let hasProximityConflict = false;
      for (const s of resultMap.values()) {
        if (!s || !s.entryDate) continue;
        const sTime =
          s.entryDate instanceof Date
            ? s.entryDate.getTime()
            : parseUtcDate(s.entryDate as any).getTime();
        if (Math.abs(candTime - sTime) <= 60_000) {
          hasProximityConflict = true;
          break;
        }
      }
      if (hasProximityConflict) {
        continue;
      }

      resultMap.set(canonicalKey, {
        ...cand,
        key: canonicalKey,
        strategies: cand.strategies || extractSignalStrategies(cand),
        outcome: "pending",
        isLocked: options?.allowHistorical ? true : false,
      });
    } else {
      // Sinal já existente:
      // A. Se já está concluído (WIN ou LOSS), é estritamente imutável! Candidatos adjacentes são descartados!
      if (existing.outcome && existing.outcome !== "pending") {
        continue;
      }

      const existingTime =
        existing.entryDate instanceof Date
          ? existing.entryDate.getTime()
          : parseUtcDate(existing.entryDate as any).getTime();

      // B. Regra Fundamental: Quando o horário sinal - 1 chegar, o sinal NÃO PODE MAIS SER ATUALIZADO.
      // Apenas aguarda a verificação do win/loss acontecer.
      if (existing.isLocked || (!Number.isNaN(existingTime) && now >= existingTime - 60_000)) {
        // Assegura que o sinal esteja marcado como locked e permanece 100% inalterado
        if (!existing.isLocked) {
          resultMap.set(existingKey || canonicalKey, {
            ...existing,
            isLocked: true,
          });
        }
        continue;
      }

      const existingRank = getSignalRank(existing);

      // Se a chave mudou devido a novo horário representativo, remove a chave anterior para não duplicar cards
      if (existingKey && existingKey !== canonicalKey) {
        resultMap.delete(existingKey);
      }

      // Combina fontes sem perder histórico (usando cycleKey para manter ciclos diferentes separados)
      const mergedSourcesMap = new Map<string, any>();
      for (const s of existing.sources || []) {
        if (s && s.analysis) {
          mergedSourcesMap.set(getSourceCycleKey(s), s);
        }
      }
      for (const s of cand.sources || []) {
        if (s && s.analysis) {
          mergedSourcesMap.set(getSourceCycleKey(s), s);
        }
      }
      const combinedSources = Array.from(mergedSourcesMap.values());

      // O sinal segue o gap da análise geradora; confluências apenas acompanham o horário (m-1, m, m+1)
      let targetEntryDate: Date | string = existing.entryDate || cand.entryDate || new Date();
      const candGenPct = (cand as any).generatorPct ?? (cand as any).pct ?? 0;
      const existGenPct = (existing as any).generatorPct ?? (existing as any).pct ?? 0;

      // Quando mais de uma análise geradora tiver horários vizinhos, verifica qual gap é mais assertivo
      if (candGenPct > existGenPct && cand.entryDate) {
        targetEntryDate = cand.entryDate;
      }

      const targetTime =
        targetEntryDate instanceof Date ? fmtClock(targetEntryDate) : cand.time || existing.time;
      const targetKey = getCanonicalSignalKey(targetEntryDate);

      // Se a chave mudou devido à análise geradora com gap mais assertivo, remove a chave antiga
      if (existingKey && existingKey !== targetKey) {
        resultMap.delete(existingKey);
      }

      const finalDominantGap =
        candGenPct > existGenPct
          ? (cand as any).dominantGap || (cand as any).generatorGap
          : (existing as any).dominantGap || (existing as any).generatorGap;
      const finalGenAnalysis =
        candGenPct > existGenPct
          ? (cand as any).generatorAnalysis
          : (existing as any).generatorAnalysis;
      const finalGenPct = Math.max(candGenPct, existGenPct);

      const mergedConfirmed = mergeConfirmedStrategies(
        existing.confirmedStrategies || [],
        cand.confirmedStrategies || [],
      );
      const hasYellow =
        cand.hasYellowSeal ||
        existing.hasYellowSeal ||
        mergedConfirmed.some((c) => c.type === "yellow");
      const hasBlue =
        cand.hasBlueSeal || existing.hasBlueSeal || mergedConfirmed.some((c) => c.type === "blue");
      const isVerified = hasYellow || hasBlue || cand.isVerified || existing.isVerified;

      const mergedStrategies = Array.from(
        new Set([
          ...(existing.strategies || extractSignalStrategies(existing)),
          ...(cand.strategies || extractSignalStrategies(cand)),
        ]),
      );
      mergedStrategies.sort((a, b) => {
        const aIsE = /^E\d+$/i.test(a);
        const bIsE = /^E\d+$/i.test(b);
        if (aIsE && !bIsE) return -1;
        if (!aIsE && bIsE) return 1;
        if (aIsE && bIsE) return parseInt(a.substring(1), 10) - parseInt(b.substring(1), 10);
        return a.localeCompare(b);
      });

      // Promoção de nível se o novo rank for superior E não houver branco em M-1 (antes do lock)
      if (candRank > existingRank && !whiteInM1) {
        resultMap.set(targetKey, {
          ...existing,
          key: targetKey,
          time: targetTime,
          entryDate: targetEntryDate,
          dominantGap: finalDominantGap,
          gap: finalDominantGap,
          generatorAnalysis: finalGenAnalysis,
          generatorPct: finalGenPct,
          pct: Math.max(existing.pct, cand.pct),
          label: cand.label || existing.label,
          medal: cand.medal || existing.medal,
          confluence: cand.confluence || existing.confluence,
          strategies: mergedStrategies,
          category: cand.category || existing.category,
          groupName: cand.groupName || existing.groupName,
          isAlavancagem: cand.isAlavancagem || existing.isAlavancagem,
          isSupreme: cand.isSupreme || existing.isSupreme,
          isRare: cand.isRare || existing.isRare,
          isTop1: cand.isTop1 ?? existing.isTop1,
          isNoConfluence: cand.isNoConfluence ?? false,
          strategyKey: cand.strategyKey || existing.strategyKey,
          sources: cand.sources && cand.sources.length > 0 ? cand.sources : combinedSources,
          clusterTimestamps: cand.clusterTimestamps || existing.clusterTimestamps,
          allowsOscillation: false,
          isHighTendency: cand.isHighTendency || existing.isHighTendency,
          isRecAlert: cand.isRecAlert || existing.isRecAlert,
          isVerified,
          hasYellowSeal: hasYellow,
          hasBlueSeal: hasBlue,
          confirmedStrategies: mergedConfirmed,
          isConsecutive: cand.isConsecutive || existing.isConsecutive,
          levelOffset: cand.levelOffset || existing.levelOffset,
          isLocked: false,
        });
      } else {
        // Novo rank é igual ou inferior: NUNCA REBAIXAR! Mantém nível e apenas enriquece metadados/fontes (antes do lock)
        resultMap.set(targetKey, {
          ...existing,
          key: targetKey,
          time: targetTime,
          entryDate: targetEntryDate,
          dominantGap: finalDominantGap,
          gap: finalDominantGap,
          generatorAnalysis: finalGenAnalysis,
          generatorPct: finalGenPct,
          pct: Math.max(existing.pct, cand.pct),
          strategies: mergedStrategies,
          isNoConfluence: (existing.isNoConfluence ?? false) && (cand.isNoConfluence ?? false),
          sources: combinedSources.length > 0 ? combinedSources : existing.sources,
          clusterTimestamps: cand.clusterTimestamps || existing.clusterTimestamps,
          allowsOscillation: false,
          isHighTendency: existing.isHighTendency || cand.isHighTendency,
          isRecAlert: existing.isRecAlert || cand.isRecAlert,
          isVerified,
          hasYellowSeal: hasYellow,
          hasBlueSeal: hasBlue,
          confirmedStrategies: mergedConfirmed,
          isLocked: false,
        });
      }
    }
  }

  // 3. Regra de Exclusividade por Ciclo/Gatilho específico (cycleKey):
  // O mesmo ciclo não pode participar de múltiplos sinais pendentes simultâneos.
  // Ciclos diferentes da mesma análise são totalmente independentes e podem gerar novos sinais!
  // Sinais com resultado WIN ou LOSS liberam imediatamente seus ciclos.
  // Ordena os sinais pendentes do MAIS FORTE para o MAIS FRACO (usando a hierarquia estrita de rank).
  const pendingSignals = Array.from(resultMap.values())
    .filter((s) => s && s.outcome === "pending")
    .sort((a, b) => {
      // 1. Sinais travados (isLocked) têm prioridade de preservação
      if (a.isLocked && !b.isLocked) return -1;
      if (!a.isLocked && b.isLocked) return 1;

      // 2. Rank da Hierarquia (Alavancagem > Supremo > Raro > Top 1 & Top 3)
      const rankA = getSignalRank(a);
      const rankB = getSignalRank(b);
      if (rankB !== rankA) return rankB - rankA;

      // 3. Quantidade de fontes Top 1 distintas
      const top1CountA = new Set(
        (a.sources || []).filter((s: any) => !s.top3 && !s.top5).map((s: any) => s.analysis),
      ).size;
      const top1CountB = new Set(
        (b.sources || []).filter((s: any) => !s.top3 && !s.top5).map((s: any) => s.analysis),
      ).size;
      if (top1CountB !== top1CountA) return top1CountB - top1CountA;

      // 4. Total de fontes/análises distintas
      const totalAnalysesA = new Set((a.sources || []).map((s: any) => s.analysis)).size;
      const totalAnalysesB = new Set((b.sources || []).map((s: any) => s.analysis)).size;
      if (totalAnalysesB !== totalAnalysesA) return totalAnalysesB - totalAnalysesA;

      // 5. Assertividade
      if (Math.abs((b.pct || 0) - (a.pct || 0)) >= 0.01) return (b.pct || 0) - (a.pct || 0);

      // 6. Horário (mais cedo primeiro se empatado em tudo)
      const tA =
        a.entryDate instanceof Date
          ? a.entryDate.getTime()
          : parseUtcDate(a.entryDate as any).getTime();
      const tB =
        b.entryDate instanceof Date
          ? b.entryDate.getTime()
          : parseUtcDate(b.entryDate as any).getTime();
      return (tA || 0) - (tB || 0);
    });

  const claimedCycleKeys = new Set<string>();
  const completedAnalysesInWindow = new Map<number, number>(); // analysisId -> timestamp

  // Regra do Usuário: "As análises quando agrupadas em uma confluência gerando o horário do sinal,
  // não devem ser separadas quando esse sinal for validado (win/loss), após essa validação esse sinal deve apenas aguardar o tempo para sair da tela."
  // 1. Sinais concluídos (WIN/LOSS) que aguardam para sair da tela reivindicam 100% de suas fontes e ciclos
  for (const sig of resultMap.values()) {
    if (sig && sig.outcome && sig.outcome !== "pending") {
      const sTime =
        sig.entryDate instanceof Date
          ? sig.entryDate.getTime()
          : parseUtcDate(sig.entryDate as any).getTime();
      for (const src of sig.sources || []) {
        claimedCycleKeys.add(getSourceCycleKey(src));
        if (src.analysis) completedAnalysesInWindow.set(src.analysis, sTime);
      }
      if (Array.isArray(sig.primaryAnalyses)) {
        sig.primaryAnalyses.forEach((aId) => completedAnalysesInWindow.set(aId, sTime));
      }
    }
  }

  for (const sig of pendingSignals) {
    const sigKey = sig.key || getCanonicalSignalKey(sig.entryDate || new Date());
    const currentSources = sig.sources || [];
    const sourceCycleKeys = currentSources.map((s) => getSourceCycleKey(s));
    const sigTime =
      sig.entryDate instanceof Date
        ? sig.entryDate.getTime()
        : parseUtcDate(sig.entryDate as any).getTime();

    if (sig.isLocked) {
      // Sinais travados em M-1 mantêm todas as suas fontes e reivindicam seus ciclos
      for (const ck of sourceCycleKeys) {
        claimedCycleKeys.add(ck);
      }
      continue;
    }

    // Se algum cycleKey já foi reivindicado por sinal concluído ou sinal mais forte, ou pertence a análise de sinal concluído recente:
    const hasConflict = currentSources.some((src) => {
      const ck = getSourceCycleKey(src);
      if (claimedCycleKeys.has(ck)) return true;
      if (src.analysis && completedAnalysesInWindow.has(src.analysis)) {
        const completedTime = completedAnalysesInWindow.get(src.analysis)!;
        if (Math.abs(sigTime - completedTime) <= 180_000) return true;
      }
      return false;
    });

    if (hasConflict) {
      // Filtra fontes exclusivas (cujo cycleKey não foi reivindicado e não conflita com sinal concluído)
      const exclusiveSources = currentSources.filter((src) => {
        const ck = getSourceCycleKey(src);
        if (claimedCycleKeys.has(ck)) return false;
        if (src.analysis && completedAnalysesInWindow.has(src.analysis)) {
          const completedTime = completedAnalysesInWindow.get(src.analysis)!;
          if (Math.abs(sigTime - completedTime) <= 180_000) return false;
        }
        return true;
      });

      // Tratamento especial para sinais 'Em Alta': eles são exclusivos de tendências
      // e NUNCA devem ser convertidos em Alavancagem, Supremo ou Raro
      const isEmAltaSignal =
        sig.isEmAlta ||
        (sig.category || "").toLowerCase() === "em_alta" ||
        (sig.groupName || "").toLowerCase() === "em alta" ||
        (typeof sig.key === "string" && sig.key.startsWith("EM_ALTA_"));

      if (isEmAltaSignal) {
        const remaining3_3 = exclusiveSources.filter(
          (s: any) =>
            (s.rank === 1 && s.pct === 100) ||
            (s.cycleKey && (s.cycleKey.startsWith("TEND_") || s.cycleKey.startsWith("T3/3"))),
        );
        if (remaining3_3.length === 0) {
          resultMap.delete(sigKey);
        } else {
          for (const src of exclusiveSources) {
            claimedCycleKeys.add(getSourceCycleKey(src));
          }
          const primaryCodes = Array.from(
            new Set(remaining3_3.map((t: any) => formatAnalysisCode(t.analysis))),
          );
          const confItems = exclusiveSources.map(
            (t: any) => `${formatAnalysisCode(t.analysis)}-${t.value}`,
          );
          resultMap.set(sigKey, {
            ...sig,
            sources: exclusiveSources,
            label: `Tendência 3/3 (${primaryCodes.join("/")})`,
            confluence: confItems.join(" · "),
            category: "em_alta",
            groupName: "Em Alta",
            isEmAlta: true,
            isAlavancagem: false,
            isSupreme: false,
            isRare: false,
            isTop1: false,
          });
        }
        continue;
      }

      const top1Sources = exclusiveSources.filter((s: any) => !s.top3 && !s.top5);
      const top3Sources = exclusiveSources.filter((s: any) => s.top3 || s.top5);

      const evalLevel = evaluateSignalLevel(top1Sources, top3Sources, {
        isConsecutive: sig.isConsecutive,
        levelOffset: sig.levelOffset,
      });

      if (!evalLevel || top1Sources.length === 0) {
        resultMap.delete(sigKey);
      } else {
        // Reivindica os cycleKeys exclusivos
        for (const src of exclusiveSources) {
          claimedCycleKeys.add(getSourceCycleKey(src));
        }

        const confText = exclusiveSources.map((s) => `A${s.analysis}·${s.value}`).join(", ");
        const avgPct =
          exclusiveSources.length > 0
            ? Math.round(
                (exclusiveSources.reduce((acc, s) => acc + (s.pct || 0), 0) /
                  exclusiveSources.length) *
                  10,
              ) / 10
            : sig.pct;

        resultMap.set(sigKey, {
          ...sig,
          sources: exclusiveSources,
          label: evalLevel.label,
          medal: evalLevel.medal,
          confluence: confText,
          category: evalLevel.category,
          groupName: evalLevel.groupName,
          isAlavancagem: evalLevel.isAlavancagem,
          isSupreme: evalLevel.isSupreme,
          isRare: evalLevel.isRare,
          isTop1: evalLevel.isTop1,
          pct: avgPct,
        });
      }
    } else {
      // Sem conflito: reivindica todos os cycleKeys deste sinal
      for (const ck of sourceCycleKeys) {
        claimedCycleKeys.add(ck);
      }
    }
  }

  // 3.1. Garantia Estrita de Exclusividade Temporal de Tendências (Prevenção de sinais a 1 minuto com a mesma tendência)
  const allSignalsList = Array.from(resultMap.values()).filter((s) => s && s.entryDate);
  allSignalsList.sort((a, b) => {
    const tA =
      a.entryDate instanceof Date
        ? a.entryDate.getTime()
        : parseUtcDate(a.entryDate as any).getTime();
    const tB =
      b.entryDate instanceof Date
        ? b.entryDate.getTime()
        : parseUtcDate(b.entryDate as any).getTime();
    return tA - tB;
  });

  for (let i = 0; i < allSignalsList.length; i++) {
    for (let j = i + 1; j < allSignalsList.length; j++) {
      const s1 = allSignalsList[i];
      const s2 = allSignalsList[j];
      const t1 =
        s1.entryDate instanceof Date
          ? s1.entryDate.getTime()
          : parseUtcDate(s1.entryDate as any).getTime();
      const t2 =
        s2.entryDate instanceof Date
          ? s2.entryDate.getTime()
          : parseUtcDate(s2.entryDate as any).getTime();

      if (Math.abs(t2 - t1) > 60_000) break;

      const s1TendencyKeys = new Set(
        (s1.sources || [])
          .filter((s: any) => s.cycleKey?.startsWith("TEND_") || s.cycleKey?.startsWith("T3/3"))
          .map((s: any) => s.cycleKey),
      );
      const s2TendencyKeys = new Set(
        (s2.sources || [])
          .filter((s: any) => s.cycleKey?.startsWith("TEND_") || s.cycleKey?.startsWith("T3/3"))
          .map((s: any) => s.cycleKey),
      );

      const s1TendencyAnalyses = new Set(
        (s1.sources || [])
          .filter(
            (s: any) =>
              s.cycleKey?.startsWith("TEND_") || s.cycleKey?.startsWith("T3/3") || s1.isEmAlta,
          )
          .map((s: any) => s.analysis),
      );
      const s2TendencyAnalyses = new Set(
        (s2.sources || [])
          .filter(
            (s: any) =>
              s.cycleKey?.startsWith("TEND_") || s.cycleKey?.startsWith("T3/3") || s2.isEmAlta,
          )
          .map((s: any) => s.analysis),
      );

      let sharedKey = "";
      for (const k of s1TendencyKeys) {
        if (s2TendencyKeys.has(k)) {
          sharedKey = k;
          break;
        }
      }

      let sharedAnalysis = -1;
      if (!sharedKey && (s1.isEmAlta || s2.isEmAlta)) {
        for (const a of s1TendencyAnalyses) {
          if (s2TendencyAnalyses.has(a)) {
            sharedAnalysis = a;
            break;
          }
        }
      }

      if (sharedKey || sharedAnalysis !== -1) {
        const rank1 = getSignalRank(s1);
        const rank2 = getSignalRank(s2);

        let keeper = s1;
        let looser = s2;

        if (s2.outcome && s2.outcome !== "pending" && s1.outcome === "pending") {
          keeper = s2;
          looser = s1;
        } else if (s2.isLocked && !s1.isLocked) {
          keeper = s2;
          looser = s1;
        } else if (rank2 > rank1 && !s1.isLocked) {
          keeper = s2;
          looser = s1;
        }

        const looserKey = looser.key || getCanonicalSignalKey(looser.entryDate || new Date());

        if (looser.isEmAlta || (looser.category || "").toLowerCase() === "em_alta") {
          resultMap.delete(looserKey);
        } else if (looser.outcome === "pending" && !looser.isLocked) {
          const cleanSources = (looser.sources || []).filter((s: any) => {
            if (sharedKey && s.cycleKey === sharedKey) return false;
            if (
              sharedAnalysis !== -1 &&
              s.analysis === sharedAnalysis &&
              (s.cycleKey?.startsWith("TEND_") || s.cycleKey?.startsWith("T3/3"))
            ) {
              return false;
            }
            return true;
          });
          looser.sources = cleanSources;
          resultMap.set(looserKey, looser);
        }
      }
    }
  }

  // 4. Auditoria e captura automática de resultado (WIN/LOSS) de todos os sinais com base nas rodadas reais
  for (const sig of resultMap.values()) {
    if (!sig || !sig.entryDate) continue;

    // Apenas sinais pendentes ou sem outcome definitivo são auditados
    if (sig.outcome === "pending" || !sig.outcome) {
      const auditRes = auditSignalWithRounds(sig, results as any, now);
      if (auditRes.outcome === "green" || auditRes.outcome === "red") {
        sig.outcome = auditRes.outcome;
        sig.label = auditRes.outcome === "green" ? "WIN" : "LOSS";
        sig.resultTime = auditRes.resultTime || sig.resultTime;
        sig.winningResultId = auditRes.winningResultId || sig.winningResultId;
        sig.completedAt = sig.completedAt || auditRes.completedAt || now;
        sig.audit = auditRes.audit || sig.audit;
      }
    }
  }

  // Retorna a lista ordenada por horário de entrada com estratégias de confirmação aplicadas
  const sortedList = Array.from(resultMap.values()).sort((a, b) => {
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

  // Retorna a lista ordenada por horário de entrada (estratégias E desativadas nas confluências)
  return sortedList;
}
