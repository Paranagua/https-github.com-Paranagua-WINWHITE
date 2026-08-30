import { fmtClock } from "@/lib/predictive";
import { parseUtcDate } from "@/lib/utils";
import type { PredictiveSignal, StoredSignal } from "@/lib/signalsStore";
import type { AuditResultItem } from "@/lib/signalAuditEngine";

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
  TOP1_TOP3 = 1,
  RARE = 2,
  SUPREME = 3,
  ALAVANCAGEM = 4,
}

export type SignalCategory = "top1_top3" | "rare" | "supreme" | "alavancagem";

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
 * Obtém o ranking numérico (1 a 4) de um sinal ou categoria.
 */
export function getSignalRank(sig?: Partial<PredictiveSignal> | string | null): SignalRank {
  if (!sig) return SignalRank.TOP1_TOP3;

  if (typeof sig === "string") {
    const cat = sig.toLowerCase();
    if (cat.includes("alavanc")) return SignalRank.ALAVANCAGEM;
    if (cat.includes("suprem") || cat.includes("winn")) return SignalRank.SUPREME;
    if (cat.includes("rare") || cat.includes("raro")) return SignalRank.RARE;
    return SignalRank.TOP1_TOP3;
  }

  const cat = (sig.category || "").toLowerCase();
  const label = (sig.label || "").toUpperCase();
  const medal = (sig.medal || "").toUpperCase();
  const conf = (sig.confluence || "").toUpperCase();

  const top1Sources = (sig.sources || []).filter((s: any) => !s.top3 && !s.top5);
  const top3Sources = (sig.sources || []).filter((s: any) => s.top3 || s.top5);
  const distinctTop1 = new Set(top1Sources.map((s: any) => s.analysis));
  const distinctTop3 = new Set(top3Sources.map((s: any) => s.analysis));

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
  }

  // Fallback por flags/tags
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

  return SignalRank.TOP1_TOP3;
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
}

export interface ConfluenceGroup {
  representativeDate: Date;
  clusterDates: Date[];
  top1Sources: Array<{ analysis: number; value: number; pct: number; top3: false }>;
  top3Sources: Array<{ analysis: number; value: number; pct: number; top3: true; rank?: number }>;
  allSources: Array<{ analysis: number; value: number; pct: number; top3: boolean; rank?: number }>;
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
 * Agrupa candidatos gerados pelas análises em grupos de confluência com base na proximidade de horário (janela primária de até 3 minutos).
 * Regras de negócio:
 * 1. Vizinhos primários com o do meio faltando (ex: 13:55 + 13:57) -> horário do meio (13:56) é o horário oficial de referência.
 * 2. Cada análise só pode participar de UMA única confluência (exclusividade estrita).
 * 3. O sinal só pode oscilar (+1/-1) quando a confluência for formada por exatamente 2 vizinhos seguidos (ex: 12:34 e 12:35).
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

  // 5. Para cada cluster, determina o horário representativo, consolida fontes e avalia nível
  const groups: ConfluenceGroup[] = [];
  const usedAnalyses = new Set<number>();

  for (const cluster of clusters) {
    // Coleta candidatos apenas de análises que AINDA NÃO participam de outra confluência (Regra 2: exclusividade de análise)
    const clusterCandidates: RawCandidate[] = [];
    for (const m of cluster) {
      const cList = minuteMap.get(m) || [];
      for (const c of cList) {
        if (!usedAnalyses.has(c.analysis)) {
          clusterCandidates.push(c);
        }
      }
    }

    if (clusterCandidates.length === 0) continue;

    // A. Determina horário representativo e se permite oscilação:
    let representativeTimestamp: number;
    let allowsOscillation = false;
    let isConsecutive = false;

    if (cluster.length >= 3) {
      // 3 minutos consecutivos [m-1, m, m+1] -> Centro m (cluster[1]), fixo sem oscilação
      representativeTimestamp = cluster[1];
      allowsOscillation = false;
      isConsecutive = true;
    } else if (cluster.length === 2) {
      const m1 = cluster[0];
      const m2 = cluster[1];
      const span = m2 - m1;

      if (span >= 120_000) {
        // Regra 1: Vizinhos com o do meio faltando (ex: 13:55 + 13:57) -> Horário faltante do meio (13:56) como referência, fixo sem oscilação
        representativeTimestamp = m1 + 60_000;
        allowsOscillation = false;
        isConsecutive = true;
      } else {
        // Regra 3: Dois vizinhos seguidos (ex: 12:34 + 12:35) -> Escolhe por assertividade/peso e PERMITE OSCILAÇÃO (+1/-1)
        allowsOscillation = true;
        isConsecutive = false;

        const c1 = clusterCandidates.filter((c) => c.targetDate.getTime() === m1);
        const c2 = clusterCandidates.filter((c) => c.targetDate.getTime() === m2);

        const top1_c1 = c1.filter((c) => c.isTop1);
        const top1_c2 = c2.filter((c) => c.isTop1);

        const bestPct1 =
          top1_c1.length > 0
            ? Math.max(...top1_c1.map((c) => c.pct))
            : c1.length > 0
              ? Math.max(...c1.map((c) => c.pct))
              : 0;
        const bestPct2 =
          top1_c2.length > 0
            ? Math.max(...top1_c2.map((c) => c.pct))
            : c2.length > 0
              ? Math.max(...c2.map((c) => c.pct))
              : 0;

        if (bestPct2 > bestPct1) {
          representativeTimestamp = m2;
        } else if (bestPct1 > bestPct2) {
          representativeTimestamp = m1;
        } else {
          // Empate de assertividade: quem tiver mais Top 1
          if (top1_c2.length > top1_c1.length) {
            representativeTimestamp = m2;
          } else if (top1_c1.length > top1_c2.length) {
            representativeTimestamp = m1;
          } else {
            representativeTimestamp = m1; // Padrão estável
          }
        }
      }
    } else {
      // 1 minuto único -> próprio minuto, fixo sem oscilação
      representativeTimestamp = cluster[0];
      allowsOscillation = false;
      isConsecutive = false;
    }

    const representativeDate = new Date(representativeTimestamp);

    // B. Consolida fontes Top 1
    const top1Map = new Map<
      string,
      { analysis: number; value: number; pct: number; top3: false }
    >();
    for (const c of clusterCandidates.filter((c) => c.isTop1)) {
      const key = `A${c.analysis}_V${c.value}`;
      const existing = top1Map.get(key);
      if (!existing || c.pct > existing.pct) {
        top1Map.set(key, {
          analysis: c.analysis,
          value: c.value,
          pct: c.pct,
          top3: false,
        });
      }
    }
    const top1Sources = Array.from(top1Map.values()).sort((a, b) => b.pct - a.pct);
    const distinctTop1Analyses = Array.from(new Set(top1Sources.map((s) => s.analysis)));

    // C. Consolida fontes Top 3 (secundárias de análises que não sejam Top 1 neste cluster)
    const top3Map = new Map<
      string,
      { analysis: number; value: number; pct: number; top3: true; rank?: number }
    >();
    for (const c of clusterCandidates.filter((c) => !c.isTop1)) {
      if (distinctTop1Analyses.includes(c.analysis)) continue;
      const key = `A${c.analysis}_V${c.value}`;
      const existing = top3Map.get(key);
      if (!existing || c.pct > existing.pct) {
        top3Map.set(key, {
          analysis: c.analysis,
          value: c.value,
          pct: c.pct,
          top3: true,
          rank: c.rank,
        });
      }
    }
    const top3Sources = Array.from(top3Map.values()).sort((a, b) => b.pct - a.pct);

    const allSources = [...top1Sources, ...top3Sources];
    const distinctAnalyses = Array.from(new Set(allSources.map((s) => s.analysis)));

    // Se não há nenhum Top 1, não gera sinal (coincidências Top 3 não enviam mais sinais)
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

    // Se for Top 1 isolado ou não atingir critério de confluência, não envia sinal!
    if (!evaluation) {
      continue;
    }

    // Regra 2: Marca todas as análises participantes como usadas para que não participem de outra confluência
    for (const an of distinctAnalyses) {
      usedAnalyses.add(an);
    }

    const strategyKey =
      top1Sources.length > 0
        ? `A${top1Sources[0].analysis}`
        : top3Sources.length > 0
          ? `A${top3Sources[0].analysis}`
          : undefined;

    groups.push({
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

  return groups;
}

/**
 * Constrói sinais preditivos a partir dos candidatos brutos já agrupados por confluência.
 */
export function buildSignalConfluences(rawCandidates: RawCandidate[]): PredictiveSignal[] {
  const groups = groupCandidatesByTimeProximity(rawCandidates);

  return groups.map((g) => {
    const canonicalKey = getCanonicalSignalKey(g.representativeDate);
    const confluenceText = g.allSources.map((s) => `A${s.analysis}·${s.value}`).join(", ");
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
): PredictiveSignal[] {
  const resultMap = new Map<string, PredictiveSignal>();

  // 1. Carrega todos os sinais existentes
  for (const sig of existingSignals || []) {
    if (!sig || !sig.entryDate) continue;
    const canonicalKey = getCanonicalSignalKey(sig.entryDate);
    const sigTime =
      sig.entryDate instanceof Date
        ? sig.entryDate.getTime()
        : parseUtcDate(sig.entryDate as any).getTime();

    // Sinais concluídos que já passaram da janela de 3 minutos de exibição são descartados
    if (
      sig.outcome &&
      sig.outcome !== "pending" &&
      sig.completedAt &&
      now - sig.completedAt > 180_000
    ) {
      continue;
    }

    // Se for sinal pendente de categoria descontinuada (Top 1 isolado ou Apenas Top 3), remove
    const cat = (sig.category || "").toLowerCase();
    if (
      sig.outcome === "pending" &&
      (cat === "top1_isolated" ||
        cat === "top3_only" ||
        cat === "top5_only" ||
        (!sig.isAlavancagem && !sig.isSupreme && !sig.isRare && cat !== "top1_top3"))
    ) {
      continue;
    }

    // Se o horário (sinal - 1 minuto) já chegou, o sinal é congelado (isLocked)
    // Janela: 1 minuto antes do minuto alvo (sigTime - 60_000 ms)
    const isLocked = sig.isLocked || (!Number.isNaN(sigTime) && now >= sigTime - 60_000);

    const normalizedSig: PredictiveSignal = {
      ...sig,
      key: sig.key || canonicalKey,
      isLocked,
    };

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
    // Primeiro por chave canônica exata; se não houver, por proximidade de ±1 minuto (60.000 ms) entre sinais pendentes
    let existingKey: string | undefined = undefined;
    let existing: PredictiveSignal | undefined = undefined;

    if (resultMap.has(canonicalKey)) {
      existingKey = canonicalKey;
      existing = resultMap.get(canonicalKey);
    } else {
      // Busca sinal pendente existente em janela de ±1 minuto (confluência temporal)
      for (const [k, s] of resultMap.entries()) {
        if (!s || !s.entryDate) continue;
        const sTime =
          s.entryDate instanceof Date
            ? s.entryDate.getTime()
            : parseUtcDate(s.entryDate as any).getTime();
        if (Math.abs(candTime - sTime) <= 60_000 && s.outcome === "pending") {
          existingKey = k;
          existing = s;
          break;
        }
      }
    }

    const candRank = getSignalRank(cand);
    const whiteInM1 = hasWhiteInPreviousMinute(cand.entryDate, results);

    if (!existing) {
      // Novo candidato:
      // Se o horário (sinal - 1) já passou para esse novo candidato, não publica novo sinal de última hora
      if (!Number.isNaN(candTime) && now >= candTime - 60_000) {
        continue;
      }

      // Se já houve branco em M-1, bloqueia a publicação!
      if (whiteInM1) {
        continue;
      }

      resultMap.set(canonicalKey, {
        ...cand,
        key: canonicalKey,
        outcome: "pending",
        isLocked: false,
      });
    } else {
      // Sinal já existente:
      // A. Se já está concluído (WIN ou LOSS), é estritamente imutável!
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

      // Combina fontes sem perder histórico
      const mergedSourcesMap = new Map<string, any>();
      for (const s of existing.sources || []) {
        if (s && s.analysis) {
          mergedSourcesMap.set(`A${s.analysis}_V${s.value}`, s);
        }
      }
      for (const s of cand.sources || []) {
        if (s && s.analysis) {
          mergedSourcesMap.set(`A${s.analysis}_V${s.value}`, s);
        }
      }
      const combinedSources = Array.from(mergedSourcesMap.values());

      // Regra de Oscilação de Horários da Confluência:
      // - 3 horários vizinhos primários (ex: 12:33, 12:34, 12:35): centro fixo (12:34), NÃO oscila (+1/-1).
      // - 2 vizinhos com o do meio faltando (ex: 13:55 + 13:57): centro faltante fixo (13:56), NÃO oscila (+1/-1).
      // - 2 horários vizinhos seguidos (ex: 12:34 e 12:35): pode oscilar (+1/-1) entre esses 2 horários específicos conforme assertividade.
      // - 1 horário único: horário fixo.
      const allowsOscillation = cand.allowsOscillation ?? existing.allowsOscillation ?? false;

      const targetEntryDate: Date | string = allowsOscillation
        ? cand.entryDate || existing.entryDate
        : existing.entryDate || cand.entryDate;

      const targetTime =
        targetEntryDate instanceof Date ? fmtClock(targetEntryDate) : cand.time || existing.time;
      const targetKey = getCanonicalSignalKey(targetEntryDate);

      // Se a chave mudou devido a oscilação válida de 2 horários, remove a chave antiga
      if (existingKey && existingKey !== targetKey) {
        resultMap.delete(existingKey);
      }

      // Promoção de nível se o novo rank for superior E não houver branco em M-1 (antes do lock)
      if (candRank > existingRank && !whiteInM1) {
        resultMap.set(targetKey, {
          ...existing,
          key: targetKey,
          time: targetTime,
          entryDate: targetEntryDate,
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
          sources: cand.sources && cand.sources.length > 0 ? cand.sources : combinedSources,
          clusterTimestamps: cand.clusterTimestamps || existing.clusterTimestamps,
          allowsOscillation: cand.allowsOscillation ?? existing.allowsOscillation,
          isHighTendency: cand.isHighTendency || existing.isHighTendency,
          isRecAlert: cand.isRecAlert || existing.isRecAlert,
          isVerified: cand.isVerified || existing.isVerified,
          isConsecutive: cand.isConsecutive || existing.isConsecutive,
          levelOffset: cand.levelOffset || existing.levelOffset,
          isLocked: false,
        });
      } else {
        // Novo rank é igual ou inferior: NUNCA REBAIXAR! Mantém nível e apenas enriquece metadados/fontes (antes do lock)
        resultMap.set(targetKey, {
          ...existing,
          key: targetKey,
          time: allowsOscillation ? targetTime : existing.time || targetTime,
          entryDate: allowsOscillation ? targetEntryDate : existing.entryDate || targetEntryDate,
          pct: Math.max(existing.pct, cand.pct),
          sources: combinedSources.length > 0 ? combinedSources : existing.sources,
          clusterTimestamps: cand.clusterTimestamps || existing.clusterTimestamps,
          allowsOscillation: cand.allowsOscillation ?? existing.allowsOscillation,
          isHighTendency: existing.isHighTendency || cand.isHighTendency,
          isRecAlert: existing.isRecAlert || cand.isRecAlert,
          isLocked: false,
        });
      }
    }
  }

  // 3. Regra de Exclusividade Estrita: Nenhuma análise pode participar de múltiplos sinais pendentes simultâneos!
  // Processa todos os sinais pendentes em ordem cronológica (sinais mais próximos no tempo têm prioridade sobre as análises).
  const pendingSignals = Array.from(resultMap.values())
    .filter((s) => s && s.outcome === "pending")
    .sort((a, b) => {
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

  const claimedAnalyses = new Set<number>();

  for (const sig of pendingSignals) {
    const sigKey = sig.key || getCanonicalSignalKey(sig.entryDate);
    const currentSources = sig.sources || [];

    // Filtra apenas as análises que ainda não foram reivindicadas por um sinal pendente anterior
    const exclusiveSources = currentSources.filter((src) => {
      if (!src || !src.analysis) return false;
      if (claimedAnalyses.has(src.analysis)) {
        return false;
      }
      return true;
    });

    const top1Sources = exclusiveSources.filter((s: any) => !s.top3 && !s.top5);
    const top3Sources = exclusiveSources.filter((s: any) => s.top3 || s.top5);

    // Se após a remoção de análises duplicadas o sinal não tiver pelo menos 1 Top 1 ou não formar confluência válida:
    const evalLevel = evaluateSignalLevel(top1Sources, top3Sources, {
      isConsecutive: sig.isConsecutive,
      levelOffset: sig.levelOffset,
    });

    if (!evalLevel || top1Sources.length === 0) {
      // Se não tem fontes suficientes, descarta este sinal pendente duplicado
      resultMap.delete(sigKey);
    } else {
      // Marca as análises exclusivas como reivindicadas por este sinal
      for (const src of exclusiveSources) {
        claimedAnalyses.add(src.analysis);
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
