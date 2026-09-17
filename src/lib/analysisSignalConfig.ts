import { useState, useEffect } from "react";

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
    | "strategies";
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
];

const STORAGE_KEY = "freitas_active_signal_analyses_v1";
const EVENT_NAME = "freitas_signal_analysis_config_changed";

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
    if (Array.isArray(parsed) && parsed.length > 0) {
      return new Set(parsed.map(Number));
    }
  } catch (err) {
    console.warn("[AnalysisSignalConfig] Erro ao ler do localStorage:", err);
  }
  return new Set(DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS);
}

/**
 * Salva o conjunto de IDs ativos no localStorage, despacha evento reativo
 * e sincroniza com o servidor em segundo plano.
 */
export function setActiveSignalAnalysisIds(ids: number[] | Set<number>): void {
  const arr = Array.from(ids);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: arr }));
    } catch (err) {
      console.warn("[AnalysisSignalConfig] Erro ao salvar no localStorage:", err);
    }

    // Sincroniza com o servidor (se endpoint existir)
    fetch("/api/public/analysis-signal-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeAnalysisIds: arr }),
    }).catch(() => {
      // Falha silenciosa no cliente; localStorage é a fonte primária de verdade
    });
  }
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
 * Hook React reativo para ler e manipular as análises ativas para envio de sinais.
 */
export function useAnalysisSignalConfig() {
  const [activeSet, setActiveSetState] = useState<Set<number>>(() => getActiveSignalAnalysisIds());

  useEffect(() => {
    const handleUpdate = () => {
      setActiveSetState(getActiveSignalAnalysisIds());
    };

    if (typeof window !== "undefined") {
      window.addEventListener(EVENT_NAME, handleUpdate);
      window.addEventListener("storage", handleUpdate);
      return () => {
        window.removeEventListener(EVENT_NAME, handleUpdate);
        window.removeEventListener("storage", handleUpdate);
      };
    }
  }, []);

  const toggle = (id: number) => {
    toggleAnalysisSignal(id);
    setActiveSetState(getActiveSignalAnalysisIds());
  };

  const setAll = (ids: number[]) => {
    setActiveSignalAnalysisIds(ids);
    setActiveSetState(new Set(ids));
  };

  const activateAll = () => {
    const allIds = ALL_ANALYSIS_DEFINITIONS.map((a) => a.id);
    setAll(allIds);
  };

  const deactivateAll = () => {
    setAll([]);
  };

  const resetToDefault = () => {
    const defIds = Array.from(DEFAULT_PRIMARY_SIGNAL_ANALYSIS_IDS);
    setAll(defIds);
  };

  return {
    activeSet,
    isActive: (id: number) => activeSet.has(id),
    toggle,
    setAll,
    activateAll,
    deactivateAll,
    resetToDefault,
    countActive: activeSet.size,
    countTotal: ALL_ANALYSIS_DEFINITIONS.length,
  };
}
