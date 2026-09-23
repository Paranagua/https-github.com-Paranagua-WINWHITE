import { useState, useEffect, useCallback } from "react";

export interface AnalysisDefinition {
  id: number;
  code: string;
  name: string;
  category:
    | "patterns"
    | "sequences"
    | "sums"
    | "color_breaks"
    | "minutes"
    | "recovery_breaks"
    | "strategies"
    | "white_neighbors";
  categoryLabel: string;
  defaultActive: boolean;
  spin?: number;
}

export const DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS = new Set<number>([
  // Padrões de Pedra
  2, 19, 20,
  // Gatilhos de Sequência
  10, 11, 12, 13, 21,
  // Somas Consecutivas
  14, 15, 16,
  // Quebra de Padrões de Cores
  50, 51, 52, 53, 54, 55, 56,
  // Estratégia F2
  202,
  // Pedras do Branco (0)
  37, 38,
]);

// Catálogo estruturado de todas as análises do sistema
export const ALL_ANALYSIS_DEFINITIONS: AnalysisDefinition[] = [
  // 1. Padrões de Pedra
  {
    id: 2,
    code: "A2",
    name: "Repetição Simples (X → X)",
    category: "patterns",
    categoryLabel: "Padrões de Pedra",
    defaultActive: true,
  },
  {
    id: 19,
    code: "A19",
    name: "Sanduíche (Pontas Iguais)",
    category: "patterns",
    categoryLabel: "Padrões de Pedra",
    defaultActive: true,
  },
  {
    id: 20,
    code: "A20",
    name: "Sanduíche (Pedra Central)",
    category: "patterns",
    categoryLabel: "Padrões de Pedra",
    defaultActive: true,
  },

  // 2. Gatilhos de Sequência
  {
    id: 10,
    code: "A10",
    name: "Gatilho 8 → 11",
    category: "sequences",
    categoryLabel: "Gatilhos de Sequência",
    defaultActive: true,
  },
  {
    id: 11,
    code: "A11",
    name: "Gatilho 11 → 11",
    category: "sequences",
    categoryLabel: "Gatilhos de Sequência",
    defaultActive: true,
  },
  {
    id: 12,
    code: "A12",
    name: "Gatilho 4 → 11",
    category: "sequences",
    categoryLabel: "Gatilhos de Sequência",
    defaultActive: true,
  },
  {
    id: 13,
    code: "A13",
    name: "Gatilho 4 ↔ 14",
    category: "sequences",
    categoryLabel: "Gatilhos de Sequência",
    defaultActive: true,
  },
  {
    id: 21,
    code: "A21",
    name: "Gatilho 7 ↔ 11",
    category: "sequences",
    categoryLabel: "Gatilhos de Sequência",
    defaultActive: true,
  },

  // 3. Somas Consecutivas
  {
    id: 14,
    code: "A14",
    name: "Soma 17 Consecutiva",
    category: "sums",
    categoryLabel: "Somas Consecutivas",
    defaultActive: true,
  },
  {
    id: 15,
    code: "A15",
    name: "Soma 19 Consecutiva",
    category: "sums",
    categoryLabel: "Somas Consecutivas",
    defaultActive: true,
  },
  {
    id: 16,
    code: "A16",
    name: "Soma 21 Consecutiva",
    category: "sums",
    categoryLabel: "Somas Consecutivas",
    defaultActive: true,
  },

  // 4. Quebra de Padrões de Cores
  {
    id: 50,
    code: "Q1",
    name: "Alternados (A50)",
    category: "color_breaks",
    categoryLabel: "Quebra de Padrões de Cores",
    defaultActive: true,
  },
  {
    id: 51,
    code: "Q2",
    name: "Alt. Contínuos 2x2 (A51)",
    category: "color_breaks",
    categoryLabel: "Quebra de Padrões de Cores",
    defaultActive: true,
  },
  {
    id: 52,
    code: "Q3",
    name: "1N 3x3 (A52)",
    category: "color_breaks",
    categoryLabel: "Quebra de Padrões de Cores",
    defaultActive: true,
  },
  {
    id: 53,
    code: "Q4",
    name: "2N 4x4 (A53)",
    category: "color_breaks",
    categoryLabel: "Quebra de Padrões de Cores",
    defaultActive: true,
  },
  {
    id: 54,
    code: "Q5",
    name: "Contínuos 5x (A54)",
    category: "color_breaks",
    categoryLabel: "Quebra de Padrões de Cores",
    defaultActive: true,
  },
  {
    id: 55,
    code: "Q6",
    name: "Contínuos N1 6x (A55)",
    category: "color_breaks",
    categoryLabel: "Quebra de Padrões de Cores",
    defaultActive: true,
  },
  {
    id: 56,
    code: "Q7",
    name: "Contínuos N2 7x+ (A56)",
    category: "color_breaks",
    categoryLabel: "Quebra de Padrões de Cores",
    defaultActive: true,
  },

  // 5. Minutos 0 a 9
  {
    id: 4,
    code: "A4",
    name: "Minuto 0 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 5,
    code: "A5",
    name: "Minuto 0 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 22,
    code: "A22",
    name: "Minuto 1 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 23,
    code: "A23",
    name: "Minuto 1 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 24,
    code: "A24",
    name: "Minuto 2 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 25,
    code: "A25",
    name: "Minuto 2 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 26,
    code: "A26",
    name: "Minuto 3 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 27,
    code: "A27",
    name: "Minuto 3 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 28,
    code: "A28",
    name: "Minuto 4 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 29,
    code: "A29",
    name: "Minuto 4 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 17,
    code: "A17",
    name: "Minuto 5 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 18,
    code: "A18",
    name: "Minuto 5 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 30,
    code: "A30",
    name: "Minuto 6 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 31,
    code: "A31",
    name: "Minuto 6 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 32,
    code: "A32",
    name: "Minuto 7 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 33,
    code: "A33",
    name: "Minuto 7 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 34,
    code: "A34",
    name: "Minuto 8 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 35,
    code: "A35",
    name: "Minuto 8 (2ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 36,
    code: "A36",
    name: "Minuto 9 (1ª Pedra)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },
  {
    id: 3,
    code: "A3",
    name: "Minuto 9 (2ª Pedra / Geral)",
    category: "minutes",
    categoryLabel: "Minutos (0 a 9)",
    defaultActive: false,
  },

  // 6. Quebra de Recuperação (Giros 26 ao 80 - A60 a A114)
  ...Array.from({ length: 55 }, (_, i) => {
    const spin = 26 + i;
    const id = 60 + i;
    return {
      id,
      code: `A${id}`,
      name: `Quebra Giro ${spin} (A${id})`,
      category: "recovery_breaks" as const,
      categoryLabel: "Quebra de Recuperação",
      defaultActive: false,
      spin,
    };
  }),

  // 7. Estratégia F2
  {
    id: 202,
    code: "F2",
    name: "Estratégia F2 (Virada de Cor)",
    category: "strategies",
    categoryLabel: "Estratégias",
    defaultActive: true,
  },

  // 8. Pedras do Branco (0) — Anterior e Posterior
  {
    id: 37,
    code: "A37",
    name: "Pedra Anterior ao 0",
    category: "white_neighbors",
    categoryLabel: "Pedras do Branco",
    defaultActive: true,
  },
  {
    id: 38,
    code: "A38",
    name: "Pedra Posterior ao 0",
    category: "white_neighbors",
    categoryLabel: "Pedras do Branco",
    defaultActive: true,
  },
];

const STORAGE_KEY = "freitas_active_signal_analyses_v1";
const STORAGE_KEY_STONES = "freitas_active_signal_analysis_stones_v1";
export const STORAGE_KEY_AUTO = "freitas_auto_audit_filter_active_v1";
const EVENT_NAME = "freitas_signal_analysis_config_changed";
const EVENT_NAME_STONES = "freitas_signal_analysis_stones_changed";
export const EVENT_NAME_AUTO = "freitas_auto_audit_filter_changed";

export const ALL_BLAZE_STONES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export const RED_STONES = [1, 2, 3, 4, 5, 6, 7] as const;
export const BLACK_STONES = [8, 9, 10, 11, 12, 13, 14] as const;
export const WHITE_STONES = [0] as const;

/**
 * Compara dois Sets numéricos para igualdade de elementos.
 */
export function areSetsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Compara dois mapas de pedras para igualdade de conteúdo.
 */
export function areStonesMapsEqual(
  a: Record<number, number[]>,
  b: Record<number, number[]>,
): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    const listA = a[Number(k)] || [];
    const listB = b[Number(k)] || [];
    if (listA.length !== listB.length) return false;
    for (let i = 0; i < listA.length; i++) {
      if (listA[i] !== listB[i]) return false;
    }
  }
  return true;
}

/**
 * Retorna se o Modo Auto (auditoria autônoma de assertividade >= 50%) está ativo.
 */
export function isAutoAuditFilterActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_AUTO) === "true";
  } catch {
    return false;
  }
}

/**
 * Define o estado do Modo Auto no localStorage, dispara evento reativo e sincroniza com o servidor.
 */
export function setAutoAuditFilterActive(active: boolean): void {
  const current = isAutoAuditFilterActive();
  if (current === active) return;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY_AUTO, active ? "true" : "false");
      window.dispatchEvent(new CustomEvent(EVENT_NAME_AUTO, { detail: active }));
    } catch (err) {
      console.warn("[AnalysisSignalConfig] Erro ao salvar auto audit:", err);
    }
  }
  syncWithServer(undefined, undefined, active);
}

/**
 * Alterna o estado do Modo Auto (liga/desliga).
 */
export function toggleAutoAuditFilter(): boolean {
  const next = !isAutoAuditFilterActive();
  setAutoAuditFilterActive(next);
  return next;
}

/**
 * Retorna true se a análise utiliza pedras (0 a 14) como parte do gatilho
 * e portanto suporta seleção minuciosa de pedras.
 */
export function analysisSupportsStoneFilter(analysisId: number): boolean {
  const def = ALL_ANALYSIS_DEFINITIONS.find((a) => a.id === analysisId);
  if (!def) return false;
  return ["minutes", "patterns", "sequences", "sums", "color_breaks", "white_neighbors"].includes(
    def.category,
  );
}

/**
 * Lê do localStorage o conjunto de IDs ativos para envio de sinais.
 * Se não houver configuração salva, retorna o padrão do sistema.
 */
export function getActiveSignalAnalysisIds(): Set<number> {
  if (typeof window === "undefined") {
    return new Set(DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set(DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS);
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(Number));
    }
  } catch (err) {
    console.warn("[AnalysisSignalConfig] Erro ao ler do localStorage:", err);
  }
  return new Set(DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS);
}

/**
 * Lê do localStorage o mapa de pedras autorizadas por análise.
 * Se uma análise não estiver mapeada, todas as pedras (0..14) são consideradas ativas.
 */
export function getActiveAnalysisStonesMap(): Record<number, number[]> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_STONES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<number, number[]> = {};
      Object.entries(parsed).forEach(([key, val]) => {
        const id = Number(key);
        if (Number.isFinite(id) && Array.isArray(val)) {
          out[id] = val.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 14);
        }
      });
      return out;
    }
  } catch (err) {
    console.warn("[AnalysisSignalConfig] Erro ao ler pedras do localStorage:", err);
  }
  return {};
}

/**
 * Retorna a lista de pedras ativas para uma análise específica.
 * Se não configurada explicitamente, retorna todas as pedras (0 a 14).
 */
export function getActiveStonesForAnalysis(
  analysisId: number,
  customStonesMap?: Record<number, number[]> | null,
): number[] {
  const map = customStonesMap ?? getActiveAnalysisStonesMap();
  const configured = map[analysisId];
  if (configured && Array.isArray(configured)) {
    return configured;
  }
  return [...ALL_BLAZE_STONES];
}

/**
 * Sincroniza configurações (IDs, Pedras e Modo Auto) com o servidor.
 */
function syncWithServer(
  activeAnalysisIds?: number[],
  activeAnalysisStones?: Record<number, number[]>,
  autoAuditMode?: boolean,
) {
  if (typeof window === "undefined") return;
  const ids = activeAnalysisIds ?? Array.from(getActiveSignalAnalysisIds());
  const stones = activeAnalysisStones ?? getActiveAnalysisStonesMap();
  const isAuto = autoAuditMode !== undefined ? autoAuditMode : isAutoAuditFilterActive();

  fetch("/api/public/analysis-signal-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activeAnalysisIds: ids,
      activeAnalysisStones: stones,
      autoAuditMode: isAuto,
    }),
  }).catch(() => {
    // Falha silenciosa no cliente; localStorage é a fonte primária de verdade
  });
}

/**
 * Salva o conjunto de IDs ativos no localStorage, despacha evento reativo
 * e sincroniza com o servidor em segundo plano.
 */
export function setActiveSignalAnalysisIds(ids: number[] | Set<number>): void {
  const newSet = new Set(ids);
  const currentSet = getActiveSignalAnalysisIds();
  if (areSetsEqual(currentSet, newSet)) {
    return;
  }
  const arr = Array.from(newSet);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: arr }));
    } catch (err) {
      console.warn("[AnalysisSignalConfig] Erro ao salvar no localStorage:", err);
    }
    syncWithServer(arr);
  }
}

/**
 * Salva o mapa de pedras ativas no localStorage, despacha evento reativo
 * e sincroniza com o servidor em segundo plano.
 */
export function setActiveAnalysisStonesMap(map: Record<number, number[]>): void {
  const currentMap = getActiveAnalysisStonesMap();
  if (areStonesMapsEqual(currentMap, map)) {
    return;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY_STONES, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent(EVENT_NAME_STONES, { detail: map }));
    } catch (err) {
      console.warn("[AnalysisSignalConfig] Erro ao salvar pedras no localStorage:", err);
    }
    syncWithServer(undefined, map);
  }
}

/**
 * Define a lista de pedras ativas para uma análise específica.
 */
export function setAnalysisStones(analysisId: number, stones: number[]): void {
  const map = getActiveAnalysisStonesMap();
  // Se contiver todas as 15 pedras (0..14), podemos limpar a chave para economizar espaço
  const uniqueStones = Array.from(new Set(stones.filter((n) => n >= 0 && n <= 14))).sort(
    (a, b) => a - b,
  );
  if (uniqueStones.length === ALL_BLAZE_STONES.length) {
    delete map[analysisId];
  } else {
    map[analysisId] = uniqueStones;
  }
  setActiveAnalysisStonesMap(map);
}

/**
 * Alterna (liga/desliga) uma pedra específica para uma análise.
 */
export function toggleAnalysisStone(analysisId: number, stone: number): boolean {
  const currentStones = getActiveStonesForAnalysis(analysisId);
  let nextStones: number[];
  let isActiveNext = false;
  if (currentStones.includes(stone)) {
    nextStones = currentStones.filter((s) => s !== stone);
    isActiveNext = false;
  } else {
    nextStones = [...currentStones, stone].sort((a, b) => a - b);
    isActiveNext = true;
  }
  setAnalysisStones(analysisId, nextStones);
  return isActiveNext;
}

/**
 * Restaura todas as pedras como ativas para uma análise.
 */
export function resetAnalysisStones(analysisId: number): void {
  const map = getActiveAnalysisStonesMap();
  delete map[analysisId];
  setActiveAnalysisStonesMap(map);
}

/**
 * Restaura todas as pedras de todas as análises para o padrão (todas ativas).
 */
export function resetAllAnalysisStones(): void {
  setActiveAnalysisStonesMap({});
}

/**
 * Alterna (liga/desliga) uma análise específica para envio de sinais.
 */
export function toggleAnalysisSignal(analysisId: number): boolean {
  const current = getActiveSignalAnalysisIds();
  let nextState = false;
  if (current.has(analysisId)) {
    current.delete(analysisId);
    nextState = false;
  } else {
    current.add(analysisId);
    nextState = true;
  }
  setActiveSignalAnalysisIds(current);
  return nextState;
}

/**
 * Verifica se uma análise está ativa para gerar sinais primários.
 */
export function isAnalysisActiveForSignals(
  analysisId: number,
  customSet?: Set<number> | null,
): boolean {
  if (customSet) {
    return customSet.has(analysisId);
  }
  return getActiveSignalAnalysisIds().has(analysisId);
}

/**
 * Verifica se uma pedra específica de uma análise está autorizada a gerar sinais primários.
 * Leva em conta se a análise pai está ativa E se a pedra específica está marcada.
 */
export function isAnalysisStoneActive(
  analysisId: number,
  stone: number,
  customActiveIds?: Set<number> | null,
  customStonesMap?: Record<number, number[]> | null,
): boolean {
  // 1. Verifica se a análise pai está ativa para sinais
  if (!isAnalysisActiveForSignals(analysisId, customActiveIds)) {
    return false;
  }
  // 2. Se a análise não tem suporte a pedras de gatilho, considera ativa
  if (!analysisSupportsStoneFilter(analysisId)) {
    return true;
  }
  // 3. Verifica o filtro específico de pedras
  const stonesMap = customStonesMap ?? getActiveAnalysisStonesMap();
  const configured = stonesMap[analysisId];
  if (!configured || !Array.isArray(configured)) {
    // Padrão: todas as pedras ativas
    return true;
  }
  return configured.includes(stone);
}

export interface StoneAuditMetric {
  wins: number;
  losses: number;
  total: number;
  assertividade: number | null;
  isValid: boolean; // assertividade >= 50%
}

export interface AnalysisAuditMetric {
  analysisId: number;
  code: string;
  name: string;
  category: string;
  overallWins: number;
  overallLosses: number;
  overallTotal: number;
  overallAssertividade: number | null;
  isValidOverall: boolean;
  stones: Record<number, StoneAuditMetric>;
  validStones: number[];
}

export interface AutoAuditValidationResult {
  validAnalysisIds: number[];
  validStonesMap: Record<number, number[]>;
  metrics: Record<number, AnalysisAuditMetric>;
}

/**
 * Computa de forma matemática a assertividade do Painel de Auditoria para cada análise e pedra.
 * Regra do Modo Auto: Apenas valida análises (por pedra) para envio de sinais se tiver assertividade a partir de 50%.
 */
export function computeAutoAuditValidationMap(
  recentSignals: any[] = [],
  stats: Record<string, { green: number; red: number }> = {},
): AutoAuditValidationResult {
  const validAnalysisIds: number[] = [];
  const validStonesMap: Record<number, number[]> = {};
  const metrics: Record<number, AnalysisAuditMetric> = {};

  const auditable = (recentSignals || []).filter((sig) => {
    if (!sig || !sig.time) return false;
    if (sig.outcome !== "green" && sig.outcome !== "red") return false;
    if (
      sig.isNoConfluence ||
      sig.category === "no_confluence" ||
      (typeof sig.confluence === "string" && sig.confluence.includes("Sem Confluência"))
    ) {
      return false;
    }
    return true;
  });

  for (const def of ALL_ANALYSIS_DEFINITIONS) {
    const analysisId = def.id;
    const code = def.code;
    const supportsStones = analysisSupportsStoneFilter(analysisId);

    // Contadores por pedra (0 a 14)
    const countsByStone: Record<number, { wins: number; losses: number }> = {};
    for (let s = 0; s <= 14; s++) {
      countsByStone[s] = { wins: 0, losses: 0 };
    }
    let directAnalysisWins = 0;
    let directAnalysisLosses = 0;

    // 1. Processa os sinais reais auditados
    for (const sig of auditable) {
      const isWin = sig.outcome === "green";
      let matchedStone: number | null = null;
      let matchedAnalysis = false;

      // Correspondência via sig.sources (ID numérico de análise e pedra)
      if (Array.isArray(sig.sources) && sig.sources.length > 0) {
        const src = sig.sources.find((s: any) => {
          if (!s) return false;
          if (s.analysis === analysisId) return true;
          if (def.category === "color_breaks" && s.analysis === analysisId) return true;
          return false;
        });
        if (src) {
          matchedAnalysis = true;
          if (typeof src.value === "number" && src.value >= 0 && src.value <= 14) {
            matchedStone = src.value;
          }
        }
      }

      // Correspondência via strategyKey / primaryStone
      if (!matchedAnalysis && sig.strategyKey) {
        const sk = String(sig.strategyKey).toUpperCase();
        if (sk === code.toUpperCase() || sk === `A${analysisId}`) {
          matchedAnalysis = true;
          if (
            typeof sig.primaryStone === "number" &&
            sig.primaryStone >= 0 &&
            sig.primaryStone <= 14
          ) {
            matchedStone = sig.primaryStone;
          }
        }
      }

      // Correspondência especial para Estratégia F2 (id 202)
      if (analysisId === 202) {
        if (
          sig.strategyKey === "F2" ||
          (Array.isArray(sig.strategies) &&
            sig.strategies.some((s: string) => String(s).toUpperCase().startsWith("F2")))
        ) {
          matchedAnalysis = true;
          if (typeof sig.pProx === "number" && sig.pProx >= 0 && sig.pProx <= 14) {
            matchedStone = sig.pProx;
          } else {
            const f2Src = (sig.sources || []).find((s: any) => s.analysis === 202);
            if (f2Src && typeof f2Src.value === "number" && f2Src.value >= 0 && f2Src.value <= 14) {
              matchedStone = f2Src.value;
            }
          }
        }
      }

      if (matchedAnalysis) {
        if (isWin) directAnalysisWins++;
        else directAnalysisLosses++;

        if (matchedStone !== null && matchedStone >= 0 && matchedStone <= 14) {
          if (isWin) countsByStone[matchedStone].wins++;
          else countsByStone[matchedStone].losses++;
        }
      }
    }

    // 2. Mescla com stats acumuladas do store de auditoria
    const sAll1 = stats[code];
    const sAll2 = stats[`A${analysisId}`];
    const sAllQ = analysisId >= 50 && analysisId <= 56 ? stats[`Q${analysisId - 49}`] : undefined;
    const sAllF2 = analysisId === 202 ? stats["F2"] : undefined;

    const storeAllWins = Math.max(
      sAll1?.green || 0,
      sAll2?.green || 0,
      sAllQ?.green || 0,
      sAllF2?.green || 0,
    );
    const storeAllLosses = Math.max(
      sAll1?.red || 0,
      sAll2?.red || 0,
      sAllQ?.red || 0,
      sAllF2?.red || 0,
    );

    const overallWins = Math.max(directAnalysisWins, storeAllWins);
    const overallLosses = Math.max(directAnalysisLosses, storeAllLosses);
    const overallTotal = overallWins + overallLosses;
    const overallAssertividade = overallTotal > 0 ? (overallWins / overallTotal) * 100 : null;
    const isValidOverall =
      overallTotal > 0 && overallAssertividade !== null && overallAssertividade >= 50;

    // Constrói métricas detalhadas por pedra (0 a 14)
    const stoneMetrics: Record<number, StoneAuditMetric> = {};
    const validStonesForAnalysis: number[] = [];

    for (let s = 0; s <= 14; s++) {
      const s1 = stats[`${code}_${s}`];
      const s2 = stats[`A${analysisId}_${s}`];
      const sQ =
        analysisId >= 50 && analysisId <= 56 ? stats[`Q${analysisId - 49}_${s}`] : undefined;
      const sF2 = analysisId === 202 ? stats[`F2-${s}`] : undefined;

      const storeStoneWins = Math.max(
        s1?.green || 0,
        s2?.green || 0,
        sQ?.green || 0,
        sF2?.green || 0,
      );
      const storeStoneLosses = Math.max(s1?.red || 0, s2?.red || 0, sQ?.red || 0, sF2?.red || 0);

      const sWins = Math.max(countsByStone[s].wins, storeStoneWins);
      const sLosses = Math.max(countsByStone[s].losses, storeStoneLosses);
      const sTotal = sWins + sLosses;
      const sAssert = sTotal > 0 ? (sWins / sTotal) * 100 : null;

      // Validação por pedra:
      // Se a pedra tiver sinais auditados, requer assertividade >= 50%.
      // Se a pedra não tiver sinais específicos (sTotal === 0), recorre à assertividade geral da análise (>= 50%).
      let isStoneValid = false;
      if (sTotal > 0) {
        isStoneValid = sAssert !== null && sAssert >= 50;
      } else if (overallTotal > 0 && overallAssertividade !== null) {
        isStoneValid = overallAssertividade >= 50;
      } else {
        isStoneValid = false;
      }

      stoneMetrics[s] = {
        wins: sWins,
        losses: sLosses,
        total: sTotal,
        assertividade: sAssert,
        isValid: isStoneValid,
      };

      if (isStoneValid) {
        validStonesForAnalysis.push(s);
      }
    }

    metrics[analysisId] = {
      analysisId,
      code,
      name: def.name,
      category: def.category,
      overallWins,
      overallLosses,
      overallTotal,
      overallAssertividade,
      isValidOverall,
      stones: stoneMetrics,
      validStones: validStonesForAnalysis,
    };

    if (supportsStones) {
      if (validStonesForAnalysis.length > 0) {
        validAnalysisIds.push(analysisId);
        validStonesMap[analysisId] = validStonesForAnalysis;
      } else {
        validStonesMap[analysisId] = [];
      }
    } else {
      if (isValidOverall) {
        validAnalysisIds.push(analysisId);
      }
    }
  }

  return {
    validAnalysisIds,
    validStonesMap,
    metrics,
  };
}

let latestAuditMetrics: Record<number, AnalysisAuditMetric> = {};

export function getLatestAuditMetrics(): Record<number, AnalysisAuditMetric> {
  return latestAuditMetrics;
}

/**
 * Aplica o filtro de auditoria autônomo e salva os IDs e pedras autorizados.
 */
export function applyAutoAuditFilter(
  recentSignals?: any[],
  stats?: Record<string, { green: number; red: number }>,
): AutoAuditValidationResult {
  let rec = recentSignals;
  let st = stats;
  if (!rec || !st) {
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem("freitas-signal-stats-v4")
          : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        rec = rec || parsed?.state?.recentSignals || [];
        st = st || parsed?.state?.stats || {};
      }
    } catch {
      // ignore
    }
  }

  const result = computeAutoAuditValidationMap(rec || [], st || {});
  latestAuditMetrics = result.metrics;
  setActiveSignalAnalysisIds(result.validAnalysisIds);
  setActiveAnalysisStonesMap(result.validStonesMap);
  return result;
}

/**
 * Hook React reativo para ler e manipular as análises e pedras ativas para envio de sinais.
 */
export function useAnalysisSignalConfig() {
  const [activeSet, setActiveSetState] = useState<Set<number>>(() => getActiveSignalAnalysisIds());
  const [stonesMap, setStonesMapState] = useState<Record<number, number[]>>(() =>
    getActiveAnalysisStonesMap(),
  );
  const [isAutoAuditActive, setIsAutoAuditActive] = useState<boolean>(() =>
    isAutoAuditFilterActive(),
  );

  useEffect(() => {
    const handleUpdateIds = () => {
      const next = getActiveSignalAnalysisIds();
      setActiveSetState((prev) => (areSetsEqual(prev, next) ? prev : next));
    };
    const handleUpdateStones = () => {
      const next = getActiveAnalysisStonesMap();
      setStonesMapState((prev) => (areStonesMapsEqual(prev, next) ? prev : next));
    };
    const handleUpdateAuto = () => {
      setIsAutoAuditActive(isAutoAuditFilterActive());
    };

    if (typeof window !== "undefined") {
      window.addEventListener(EVENT_NAME, handleUpdateIds);
      window.addEventListener(EVENT_NAME_STONES, handleUpdateStones);
      window.addEventListener(EVENT_NAME_AUTO, handleUpdateAuto);
      window.addEventListener("storage", handleUpdateIds);
      window.addEventListener("storage", handleUpdateStones);
      window.addEventListener("storage", handleUpdateAuto);
      return () => {
        window.removeEventListener(EVENT_NAME, handleUpdateIds);
        window.removeEventListener(EVENT_NAME_STONES, handleUpdateStones);
        window.removeEventListener(EVENT_NAME_AUTO, handleUpdateAuto);
        window.removeEventListener("storage", handleUpdateIds);
        window.removeEventListener("storage", handleUpdateStones);
        window.removeEventListener("storage", handleUpdateAuto);
      };
    }
  }, []);

  const toggle = useCallback((id: number) => {
    toggleAnalysisSignal(id);
    const next = getActiveSignalAnalysisIds();
    setActiveSetState((prev) => (areSetsEqual(prev, next) ? prev : next));
  }, []);

  const setAll = useCallback((ids: number[]) => {
    setActiveSignalAnalysisIds(ids);
    const next = new Set(ids);
    setActiveSetState((prev) => (areSetsEqual(prev, next) ? prev : next));
  }, []);

  const activateAll = useCallback(() => {
    const allIds = ALL_ANALYSIS_DEFINITIONS.map((a) => a.id);
    setAll(allIds);
  }, [setAll]);

  const deactivateAll = useCallback(() => {
    setAll([]);
  }, [setAll]);

  const resetToDefault = useCallback(() => {
    const defIds = Array.from(DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS);
    setAll(defIds);
    resetAllAnalysisStones();
    setStonesMapState({});
  }, [setAll]);

  const toggleStone = useCallback((analysisId: number, stone: number) => {
    toggleAnalysisStone(analysisId, stone);
    const next = getActiveAnalysisStonesMap();
    setStonesMapState((prev) => (areStonesMapsEqual(prev, next) ? prev : next));
  }, []);

  const setStonesForAnalysis = useCallback((analysisId: number, stones: number[]) => {
    setAnalysisStones(analysisId, stones);
    const next = getActiveAnalysisStonesMap();
    setStonesMapState((prev) => (areStonesMapsEqual(prev, next) ? prev : next));
  }, []);

  const selectAllStonesForAnalysis = useCallback((analysisId: number) => {
    resetAnalysisStones(analysisId);
    const next = getActiveAnalysisStonesMap();
    setStonesMapState((prev) => (areStonesMapsEqual(prev, next) ? prev : next));
  }, []);

  const deselectAllStonesForAnalysis = useCallback((analysisId: number) => {
    setAnalysisStones(analysisId, []);
    const next = getActiveAnalysisStonesMap();
    setStonesMapState((prev) => (areStonesMapsEqual(prev, next) ? prev : next));
  }, []);

  const selectColorStonesForAnalysis = useCallback(
    (analysisId: number, color: "white" | "red" | "black") => {
      const current = getActiveStonesForAnalysis(analysisId, stonesMap);
      let targetStones: readonly number[];
      if (color === "white") targetStones = WHITE_STONES;
      else if (color === "red") targetStones = RED_STONES;
      else targetStones = BLACK_STONES;

      const hasAllColor = targetStones.every((s) => current.includes(s));
      let next: number[];
      if (hasAllColor) {
        next = current.filter((s) => !targetStones.includes(s));
      } else {
        next = Array.from(new Set([...current, ...targetStones])).sort((a, b) => a - b);
      }
      setAnalysisStones(analysisId, next);
      const nextMap = getActiveAnalysisStonesMap();
      setStonesMapState((prev) => (areStonesMapsEqual(prev, nextMap) ? prev : nextMap));
    },
    [stonesMap],
  );

  const resetStonesForAnalysis = useCallback((id: number) => {
    resetAnalysisStones(id);
    const next = getActiveAnalysisStonesMap();
    setStonesMapState((prev) => (areStonesMapsEqual(prev, next) ? prev : next));
  }, []);

  const isStoneActive = useCallback(
    (analysisId: number, stone: number): boolean => {
      return isAnalysisStoneActive(analysisId, stone, activeSet, stonesMap);
    },
    [activeSet, stonesMap],
  );

  const getActiveStonesCount = useCallback(
    (analysisId: number): number => {
      if (!analysisSupportsStoneFilter(analysisId)) return ALL_BLAZE_STONES.length;
      return getActiveStonesForAnalysis(analysisId, stonesMap).length;
    },
    [stonesMap],
  );

  const toggleAutoAuditMode = useCallback((): boolean => {
    const next = toggleAutoAuditFilter();
    setIsAutoAuditActive(next);
    if (next) {
      const res = applyAutoAuditFilter();
      const nextSet = new Set(res.validAnalysisIds);
      setActiveSetState((prev) => (areSetsEqual(prev, nextSet) ? prev : nextSet));
      setStonesMapState((prev) =>
        areStonesMapsEqual(prev, res.validStonesMap) ? prev : res.validStonesMap,
      );
    }
    return next;
  }, []);

  const setAutoAuditMode = useCallback((active: boolean): void => {
    setAutoAuditFilterActive(active);
    setIsAutoAuditActive(active);
    if (active) {
      const res = applyAutoAuditFilter();
      const nextSet = new Set(res.validAnalysisIds);
      setActiveSetState((prev) => (areSetsEqual(prev, nextSet) ? prev : nextSet));
      setStonesMapState((prev) =>
        areStonesMapsEqual(prev, res.validStonesMap) ? prev : res.validStonesMap,
      );
    }
  }, []);

  const applyAutoAudit = useCallback(
    (recentSignals?: any[], stats?: Record<string, { green: number; red: number }>) => {
      const res = applyAutoAuditFilter(recentSignals, stats);
      const nextSet = new Set(res.validAnalysisIds);
      setActiveSetState((prev) => (areSetsEqual(prev, nextSet) ? prev : nextSet));
      setStonesMapState((prev) =>
        areStonesMapsEqual(prev, res.validStonesMap) ? prev : res.validStonesMap,
      );
      return res;
    },
    [],
  );

  const getAnalysisAuditMetric = useCallback((analysisId: number) => {
    return latestAuditMetrics[analysisId];
  }, []);

  const getStoneAuditMetric = useCallback((analysisId: number, stone: number) => {
    return latestAuditMetrics[analysisId]?.stones?.[stone];
  }, []);

  return {
    activeSet,
    stonesMap,
    isActive: (id: number) => activeSet.has(id),
    isStoneActive,
    getActiveStonesCount,
    getActiveStonesForAnalysis: (id: number) => getActiveStonesForAnalysis(id, stonesMap),
    toggle,
    toggleStone,
    setStonesForAnalysis,
    selectAllStonesForAnalysis,
    deselectAllStonesForAnalysis,
    selectColorStonesForAnalysis,
    resetStonesForAnalysis,
    setAll,
    activateAll,
    deactivateAll,
    resetToDefault,
    countActive: activeSet.size,
    totalCount: ALL_ANALYSIS_DEFINITIONS.length,
    supportsStoneFilter: analysisSupportsStoneFilter,

    // Modo Auto
    isAutoAuditActive,
    toggleAutoAuditMode,
    setAutoAuditMode,
    applyAutoAuditFilter: applyAutoAudit,
    getAnalysisAuditMetric,
    getStoneAuditMetric,
  };
}
