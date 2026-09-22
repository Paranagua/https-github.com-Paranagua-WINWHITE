import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { type Cycle, MAX_ZEROS, TIMEOUT_MINUTES } from "@/lib/predictive";

export type PersistedCycleRecord = {
  id?: string;
  cycle_key: string;
  analysis: number;
  analysis_code?: string | null;
  analysis_name?: string | null;
  value: number;
  trigger_at: string;
  gaps: number[];
  total_whites: number;
  first_white_gap: number | null;
  status: "aberto" | "concluido" | "timeout";
  created_at?: string;
  updated_at?: string;
};

// Cache em memória para acesso síncrono rápido e resiliência offline
const memoryCyclesCache = new Map<string, Cycle>();

// Chave unívoca padronizada para identificar cada ciclo sem duplicações
export function getCycleKey(
  analysis: number,
  value: number,
  triggerAt: Date | string | number,
): string {
  const time = triggerAt instanceof Date ? triggerAt.getTime() : new Date(triggerAt).getTime();
  return `A${analysis}_V${value}_T${time}`;
}

// Determina o status do ciclo conforme as regras de negócio
export function computeCycleStatus(
  gaps: number[],
  triggerAt: Date | string | number,
): "aberto" | "concluido" | "timeout" {
  if (Array.isArray(gaps) && gaps.length >= MAX_ZEROS) {
    return "concluido";
  }
  const time = triggerAt instanceof Date ? triggerAt.getTime() : new Date(triggerAt).getTime();
  const elapsedMinutes = (Date.now() - time) / 60000;
  if (elapsedMinutes > TIMEOUT_MINUTES && (!gaps || gaps.length === 0)) {
    return "timeout";
  }
  return "aberto";
}

// Garante que gaps contenham apenas valores numéricos positivos (> 0) e estritamente cronológicos (sem loop-backs de bugs legados)
export function sanitizeMonotonicGaps(rawGaps?: number[]): number[] {
  if (!Array.isArray(rawGaps)) return [];
  const clean: number[] = [];
  let prev = 0;
  for (const g of rawGaps) {
    if (typeof g === "number" && !Number.isNaN(g) && g > 0) {
      if (g >= prev) {
        clean.push(g);
        prev = g;
      } else {
        // Corta duplicações que voltaram no tempo em registros antigos
        break;
      }
    }
  }
  return clean.slice(0, MAX_ZEROS);
}

// Converte um Cycle em memória para o formato persistível no banco
export function cycleToRecord(
  cycle: Cycle,
  analysisCode?: string,
  analysisName?: string,
): PersistedCycleRecord {
  const triggerDate = cycle.triggerAt instanceof Date ? cycle.triggerAt : new Date(cycle.triggerAt);
  // Garante que gaps contenham apenas valores numéricos positivos (> 0); valores 0 ou inválidos são deixados em branco
  const gaps = sanitizeMonotonicGaps(cycle.gaps);
  const status = computeCycleStatus(gaps, triggerDate);

  const isRecoveryBreak = cycle.analysis >= 60 && cycle.analysis <= 114;
  const defCode = `A${cycle.analysis}`;
  const defName =
    cycle.analysis === 37
      ? "Pedra Anterior ao 0"
      : cycle.analysis === 38
        ? "Pedra Posterior ao 0"
        : isRecoveryBreak
          ? `Quebra de Recuperação (Giro ${cycle.analysis - 34})`
          : `Análise ${cycle.analysis}`;

  return {
    cycle_key: getCycleKey(cycle.analysis, cycle.value, triggerDate),
    analysis: cycle.analysis,
    analysis_code: analysisCode || defCode,
    analysis_name: analysisName || defName,
    value: cycle.value,
    trigger_at: triggerDate.toISOString(),
    gaps,
    total_whites: gaps.length,
    first_white_gap: cycle.firstWhiteGap ?? (gaps.length > 0 ? gaps[0] : null),
    status,
    updated_at: new Date().toISOString(),
  };
}

// Converte um registro do banco de volta para o tipo Cycle do motor preditivo
export function recordToCycle(record: PersistedCycleRecord): Cycle {
  const gaps = sanitizeMonotonicGaps(record.gaps);
  return {
    analysis: record.analysis,
    value: record.value,
    triggerAt: new Date(record.trigger_at),
    gaps,
    firstWhiteGap:
      typeof record.first_white_gap === "number" && record.first_white_gap > 0
        ? record.first_white_gap
        : gaps.length > 0
          ? gaps[0]
          : undefined,
  };
}

// Assinaturas de ciclos já persistidos com sucesso (cycle_key -> signature)
const persistedSignatures = new Map<string, string>();

/**
 * Persiste um lote de ciclos no Supabase e no cache local.
 * Utiliza chave de idempotência (cycle_key) para atualizar gaps de ciclos existentes sem duplicar.
 * Descarta automaticamente ciclos cujo estado (gaps e status) não sofreu alteração.
 */
export async function persistCyclesBatch(
  cycles: Cycle[],
  metadataMap?: Record<number, { code: string; name: string }>,
): Promise<number> {
  if (!cycles || cycles.length === 0) return 0;

  // 1. Atualiza o cache em memória imediatamente
  const payloadMap = new Map<string, PersistedCycleRecord>();
  for (const c of cycles) {
    if (!c.triggerAt) continue;
    const meta = metadataMap?.[c.analysis];
    const rec = cycleToRecord(c, meta?.code, meta?.name);

    // Assinatura do estado do ciclo: chave + total de gaps + status
    const sig = `${rec.cycle_key}_${rec.gaps.length}_${rec.status}`;
    if (persistedSignatures.get(rec.cycle_key) === sig) {
      continue; // Ciclo inalterado já salvo, pula persistência redundante
    }

    // Se já vimos este ciclo no lote, mantemos a versão com mais gaps
    const existing = payloadMap.get(rec.cycle_key);
    if (!existing || rec.gaps.length >= existing.gaps.length) {
      payloadMap.set(rec.cycle_key, rec);
    }

    // Atualiza cache em memória
    memoryCyclesCache.set(rec.cycle_key, {
      analysis: c.analysis,
      value: c.value,
      triggerAt: new Date(c.triggerAt),
      gaps: [...rec.gaps],
    });
  }

  const records = Array.from(payloadMap.values());
  if (records.length === 0) return 0;

  // 2. Persistência em lotes (batching) para evitar payloads gigantes e timeout
  let savedCount = 0;
  const isNode = typeof window === "undefined";
  const apiUrl = isNode
    ? "http://localhost:3000/api/public/predictive-cycles"
    : "/api/public/predictive-cycles";
  const BATCH_SIZE = 100;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    let batchSaved = false;

    // Tenta persistência via API do servidor (bypassa RLS com segurança e persiste no backend)
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: batch }),
      });
      if (res.ok) {
        const data = await res.json();
        savedCount += data.saved ?? batch.length;
        batchSaved = true;
      }
    } catch {
      // Continua para tentativa direta no Supabase
    }

    if (!batchSaved) {
      // 3. Fallback: Tentativa direta no Supabase via client em chunks de 50
      try {
        const CHUNK_SIZE = 50;
        for (let j = 0; j < batch.length; j += CHUNK_SIZE) {
          const chunk = batch.slice(j, j + CHUNK_SIZE);
          const { error } = await (supabase as any)
            .from("predictive_cycles")
            .upsert(chunk, { onConflict: "cycle_key" });

          if (!error) {
            savedCount += chunk.length;
          }
        }
      } catch {
        // Falha silenciosa tolerada (cache em memória e fallback já retêm os dados)
      }
    }

    for (const rec of batch) {
      persistedSignatures.set(rec.cycle_key, `${rec.cycle_key}_${rec.gaps.length}_${rec.status}`);
    }
  }

  return savedCount;
}

/**
 * Busca ciclos persistidos para uma análise ou globalmente.
 */
export async function fetchPersistedCycles(options?: {
  analysis?: number;
  analyses?: number[];
  value?: number;
  limit?: number;
}): Promise<Cycle[]> {
  const limit = options?.limit ?? 200;

  try {
    // 1. Tenta buscar da API do servidor
    const isNode = typeof window === "undefined";
    const base = isNode ? "http://localhost:3000" : "";
    const params = new URLSearchParams();
    if (options?.analysis !== undefined) params.set("analysis", String(options.analysis));
    if (options?.analyses && options.analyses.length > 0)
      params.set("analyses", options.analyses.join(","));
    if (options?.value !== undefined) params.set("value", String(options.value));
    params.set("limit", String(limit));

    const res = await fetch(`${base}/api/public/predictive-cycles?${params.toString()}`);
    if (res.ok) {
      const data: PersistedCycleRecord[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map(recordToCycle);
      }
    }
  } catch {
    // Fallback para Supabase direto
  }

  try {
    let offset = 0;
    const PAGE_SIZE = 1000;
    const allFetched: PersistedCycleRecord[] = [];

    while (allFetched.length < limit) {
      const pageSize = Math.min(PAGE_SIZE, limit - allFetched.length);
      let query = (supabase as any)
        .from("predictive_cycles")
        .select("*")
        .order("trigger_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (options?.analysis !== undefined) {
        query = query.eq("analysis", options.analysis);
      } else if (options?.analyses && options.analyses.length > 0) {
        query = query.in("analysis", options.analyses);
      }
      if (options?.value !== undefined) {
        query = query.eq("value", options.value);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) break;
      allFetched.push(...(data as PersistedCycleRecord[]));
      offset += data.length;
      if (data.length < pageSize) break;
    }

    if (allFetched.length > 0) {
      return allFetched.map(recordToCycle);
    }
  } catch {
    // Retorna do cache em memória se disponível
  }

  // Fallback: filtra do cache em memória
  const fromCache: Cycle[] = [];
  memoryCyclesCache.forEach((c) => {
    if (options?.analysis !== undefined && c.analysis !== options.analysis) return;
    if (options?.analyses && options.analyses.length > 0 && !options.analyses.includes(c.analysis))
      return;
    if (options?.value !== undefined && c.value !== options.value) return;
    fromCache.push(c);
  });
  return fromCache.sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime()).slice(-limit);
}

/**
 * Busca e mapeia ciclos persistidos para múltiplas análises.
 */
export async function fetchPersistedCyclesMap(
  analysisIds: number[],
  limitPerAnalysis = 100,
): Promise<Record<number, Cycle[]>> {
  const result: Record<number, Cycle[]> = {};
  for (const id of analysisIds) {
    result[id] = [];
  }

  try {
    const list = await fetchPersistedCycles({
      analyses: analysisIds,
      limit: Math.max(5000, analysisIds.length * limitPerAnalysis),
    });
    for (const c of list) {
      if (result[c.analysis]) {
        result[c.analysis].push(c);
      }
    }
    // Ordena cada grupo cronologicamente
    for (const id of analysisIds) {
      result[id].sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
    }
  } catch {
    // Sem quebra
  }

  return result;
}

/**
 * Mescla ciclos persistidos com os ciclos calculados da janela recente em memória.
 * - Evita duplicações pela chave do ciclo.
 * - Mantém a versão mais recente/com mais gaps de cada ciclo.
 * - Preserva ciclos mais antigos que já saíram da janela recente de rodadas.
 * - Mantém ordenação cronológica ascendente (mais antigo -> mais recente).
 */
export function mergePersistedWithLiveCycles(persisted: Cycle[] = [], live: Cycle[] = []): Cycle[] {
  const mergedMap = new Map<string, Cycle>();

  // 1. Adiciona os ciclos persistidos sanitizados
  for (const c of persisted) {
    if (!c.triggerAt) continue;
    const key = getCycleKey(c.analysis, c.value, c.triggerAt);
    mergedMap.set(key, { ...c, gaps: sanitizeMonotonicGaps(c.gaps) });
  }

  // 2. Adiciona ou atualiza com os ciclos calculados da janela viva sanitizados
  for (const c of live) {
    if (!c.triggerAt) continue;
    const key = getCycleKey(c.analysis, c.value, c.triggerAt);
    const cleanLiveGaps = sanitizeMonotonicGaps(c.gaps);
    const existing = mergedMap.get(key);
    if (!existing) {
      mergedMap.set(key, { ...c, gaps: cleanLiveGaps });
    } else {
      // Se o ciclo vivo tem mais ou iguais gaps ou foi reavaliado, atualiza
      if (cleanLiveGaps.length >= existing.gaps.length) {
        mergedMap.set(key, { ...c, gaps: cleanLiveGaps });
      }
    }
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => a.triggerAt.getTime() - b.triggerAt.getTime(),
  );
}
