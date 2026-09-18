/**
 * Módulo de Análise Q — Quebra de Recuperação (A60 a A114)
 *
 * REGRA OFICIAL E ESTRITA:
 * O intervalo entre dois resultados "0" (Branco) deve conter ESTRITAMENTE de 26 a 80 giros
 * consecutivos sem nenhum "0" (Branco) entre eles.
 *
 * Exemplos:
 * 0 - 26 giros sem aparecer o "0" - 0 = A60
 * 0 - 27 giros sem aparecer o "0" - 0 = A61
 * ...
 * 0 - 80 giros sem aparecer o "0" - 0 = A114
 *
 * O gatilho é disparado no segundo Branco (roll === 0) que encerra o intervalo.
 * A partir desse segundo Branco, computam-se até 14 tempos de latência (gaps)
 * de Brancos subsequentes dentro da janela de 120 minutos.
 */

import { parseUtcDate } from "@/lib/utils";
import { type Row, type Cycle, MAX_ZEROS, TIMEOUT_MINUTES } from "@/lib/predictive";

export const RECOVERY_BREAK_START_SPIN = 26;
export const RECOVERY_BREAK_END_SPIN = 80;
export const RECOVERY_BREAK_START_ANALYSIS = 60;
export const RECOVERY_BREAK_END_ANALYSIS = 114;

export function getRecoveryBreakAnalysisId(spinIndex: number): number {
  return 60 + (spinIndex - 26);
}

export function getRecoveryBreakSpin(analysisId: number): number {
  return analysisId - 34; // 60 -> 26, 114 -> 80
}

export function isRecoveryBreakAnalysis(analysisId: number): boolean {
  return analysisId >= 60 && analysisId <= 114;
}

export function getRecoveryBreakCode(analysisId: number): string {
  return `A${analysisId}`;
}

export function getRecoveryBreakName(analysisId: number): string {
  const spin = getRecoveryBreakSpin(analysisId);
  return `Quebra de Recuperação (Giro ${spin})`;
}

/**
 * Detecta todos os ciclos de Quebra de Recuperação (A60 a A114) em um histórico de resultados da Blaze.
 *
 * Garante 100% de precisão matemática com base em pares consecutivos de Brancos (0):
 * - spinsBetweenWhites = w_curr - w_prev - 1
 * - Exige estritamente spinsBetweenWhites >= 26 && spinsBetweenWhites <= 80
 * - O gatilho ocorre exatamente no segundo Branco (roll === 0)
 */
export function detectAllRecoveryBreaks(rows: Row[]): Record<number, Cycle[]> {
  const result: Record<number, Cycle[]> = {};
  for (let a = RECOVERY_BREAK_START_ANALYSIS; a <= RECOVERY_BREAK_END_ANALYSIS; a++) {
    result[a] = [];
  }

  if (!rows || rows.length < 2) {
    return result;
  }

  // Ordenação cronológica estrita (mais antigo para mais recente)
  const sorted = rows.slice().sort((a, b) => {
    const tA = parseUtcDate(a.created_at).getTime();
    const tB = parseUtcDate(b.created_at).getTime();
    if (tA !== tB) return tA - tB;
    return (a.id || 0) - (b.id || 0);
  });

  // Localiza todos os índices onde a pedra é Branco (0)
  const whiteIndices: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (Number(sorted[i].roll) === 0) {
      whiteIndices.push(i);
    }
  }

  if (whiteIndices.length < 2) {
    return result;
  }

  const timeoutMs = TIMEOUT_MINUTES * 60000;

  // Analisa cada par consecutivo de Brancos
  for (let j = 1; j < whiteIndices.length; j++) {
    const prevWhiteIdx = whiteIndices[j - 1];
    const currWhiteIdx = whiteIndices[j];
    const spinsBetweenWhites = currWhiteIdx - prevWhiteIdx - 1;

    // Regra oficial: intervalo entre dois "0" de 26 a 80 giros sem nenhum "0" entre eles
    if (
      spinsBetweenWhites >= RECOVERY_BREAK_START_SPIN &&
      spinsBetweenWhites <= RECOVERY_BREAK_END_SPIN
    ) {
      const analysisId = getRecoveryBreakAnalysisId(spinsBetweenWhites);
      const triggerRow = sorted[currWhiteIdx];
      const triggerAt = parseUtcDate(triggerRow.created_at);

      if (Number.isNaN(triggerAt.getTime())) continue;

      // Coleta os gaps de Brancos subsequentes a este gatilho
      const gaps: number[] = [];
      const seenTimes = new Set<number>();
      let prevGap = 0;

      for (let k = j + 1; k < whiteIndices.length; k++) {
        if (gaps.length >= MAX_ZEROS) break;

        const subRow = sorted[whiteIndices[k]];
        const subDate = parseUtcDate(subRow.created_at);
        if (Number.isNaN(subDate.getTime())) continue;

        const diffMs = subDate.getTime() - triggerAt.getTime();
        if (diffMs <= 0) continue;
        if (diffMs > timeoutMs) break;

        const gapMinutes = Math.max(1, Math.floor(diffMs / 60000));
        if (gapMinutes >= prevGap && !seenTimes.has(gapMinutes)) {
          seenTimes.add(gapMinutes);
          gaps.push(gapMinutes);
          prevGap = gapMinutes;
        }
      }

      result[analysisId].push({
        analysis: analysisId,
        value: 0,
        triggerAt,
        gaps,
      });
    }
  }

  return result;
}
