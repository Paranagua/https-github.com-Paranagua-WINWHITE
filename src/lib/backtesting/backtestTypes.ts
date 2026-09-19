/**
 * Tipos e interfaces para a infraestrutura de Laboratório e Backtesting.
 * Código estritamente isolado para comparação científica dos modelos estatísticos.
 * Nenhuma dependência com o fluxo funcional de produção.
 */

export type BacktestModelName = "Top Atual" | "Top 3 Experimental" | "Tendência Atual";

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
