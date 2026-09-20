/**
 * Tipos e interfaces para a infraestrutura de Laboratório e Backtesting.
 * Código estritamente isolado para comparação científica dos modelos estatísticos.
 * Nenhuma dependência com o fluxo funcional de produção.
 */

export type BacktestModelName =
  | "Top Atual"
  | "Top 3 Experimental"
  | "Tendência Atual"
  | "TOP-2"
  | "TOP-3"
  | "TOP-4"
  | "TOP-5"
  | "TOP-6"
  | "TOP-3 Consistência 3/3"
  | "TOP-3 Consistência 2/3"
  | "TOP-3 Preferência Exata"
  | "Tendência Benchmark";

export type SampleSizeCategory = "Grande" | "Média" | "Pequena";

export interface CandidateConsistencyDetail {
  m: number;
  label: string;
  count: number;
  pct: number;
  directHits: number;
  cycleHits: boolean[]; // Presença no ciclo [c1, c2, c3]
  cycleExactHits: boolean[]; // Presença exata m no ciclo [c1, c2, c3]
  cycleGaps: number[][]; // Gaps em cada ciclo
  cyclesHitCount: number; // 1, 2 ou 3
  exactHitsCount: number; // 0, 1, 2 ou 3
  dispersion: number; // Dispersão (max - min dos gaps mais próximos de m)
  classification: "3/3" | "2/3" | "1/3";
}

export interface BlockPerformance {
  blockIndex: number; // 1 a 5
  blockLabel: string; // "B1 (0-20%)" etc.
  totalCycles: number;
  predictionsCount: number;
  winCount: number;
  lossCount: number;
  winRate: number; // %
  exactWinRate: number;
}

export interface ModelStabilityStats {
  model: BacktestModelName;
  meanWinRate: number;
  minWinRate: number;
  maxWinRate: number;
  amplitude: number; // max - min
  stdDev: number; // desvio padrão
  blocks: BlockPerformance[];
}

export interface IntersectionStats {
  analysis: number;
  analysisCode: string;
  totalEvaluated: number;
  commonCount: number;
  exclusiveTopCount: number;
  exclusiveTendenciaCount: number;
  commonWinCount: number;
  commonLossCount: number;
  commonWinRate: number;
  exclusiveTopWinRate: number;
  exclusiveTendenciaWinRate: number;
}

export interface ConfluenceStats {
  totalEvaluated: number;
  exactConfluenceCount: number;
  exactConfluenceWinRate: number;
  toleranceConfluenceCount: number; // dentro de +- 1 min
  toleranceConfluenceWinRate: number;
  noConfluenceCount: number;
  noConfluenceWinRate: number;
}

export interface CycleGapsRecord {
  id?: string;
  cycleKey: string;
  analysis: number;
  analysisCode: string;
  analysisName?: string;
  value: number;
  triggerAt: Date;
  gaps: number[];
  status: "aberto" | "concluido" | "timeout";
  totalWhites: number;
  firstWhiteGap: number | null;
}

export type PredictionOutcome = "WIN" | "LOSS" | "PENDING" | "NO_PREDICTION";

export type WinType = "EXACT" | "WINDOW_TOLERANCE" | "NONE";

export interface CyclePredictionEvaluation {
  cycleKey: string;
  analysis: number;
  analysisCode: string;
  value: number;
  triggerAt: Date;
  model: BacktestModelName;
  cyclesUsedCount: number;
  pastCycleKeys: string[];
  predictedGap: number | null;
  predictedDate: Date | null;
  pct: number;
  outcome: PredictionOutcome;
  winType: WinType;
  actualGaps: number[];
  firstWhiteGap: number | null;
  directHits?: number;
  ratioLabel?: string;
  details?: Record<string, any>;
}

export interface ModelPerformanceStats {
  analysis: number;
  analysisCode: string;
  model: BacktestModelName;
  totalCyclesAvailable: number;
  cyclesEvaluated: number;
  cyclesDiscardedLackHistory: number;
  predictionsCount: number;
  winCount: number;
  lossCount: number;
  pendingCount: number;
  exactWinCount: number;
  toleranceWinCount: number;
  winRate: number; // % sobre (WIN + LOSS)
  exactWinRate: number; // % acerto estrito no minuto M
  predictionsByGap: Record<number, number>;
  actualGapFrequency: Record<number, number>;
  hourlyStats: Record<
    number,
    { predictions: number; wins: number; losses: number; winRate: number }
  >;
}

export interface GlobalModelSummary {
  model: BacktestModelName;
  totalAnalyses: number;
  totalCyclesAvailable: number;
  totalPredictions: number;
  totalWins: number;
  totalLosses: number;
  totalExactWins: number;
  winRate: number;
  exactWinRate: number;
  coverageRate: number; // % dos ciclos avaliados que geraram previsão
}

export interface BacktestComparisonResult {
  generatedAt: string;
  datasetCyclesCount: number;
  analysesCompared: string[];
  tableRows: ModelPerformanceStats[];
  summary: GlobalModelSummary[];
  inconsistencies: string[];
}
