/**
 * Motor Preditivo Incremental FreitasWhite
 *
 * Processa resultados da Blaze de forma orientada a eventos e incremental:
 * - Mantém somente ciclos abertos em memória (gaps.length < 14 e dentro de 120 minutos).
 * - Identifica novos gatilhos observando apenas as últimas pedras necessárias (1 a 9).
 * - Adiciona gaps aos ciclos abertos exclusivamente quando a nova pedra for Branco (0).
 * - Marca para persistência APENAS ciclos que foram criados ou receberam novo gap.
 * - Garante 100% de equivalência matemática com o método em lote (collectGaps e buildA*).
 */

import { parseUtcDate } from "@/lib/utils";
import { type Row, type Cycle, MAX_ZEROS, TIMEOUT_MINUTES, isValidCycle } from "@/lib/predictive";
import {
  COLOR_PATTERNS,
  detectAllColorPatternBreaks,
  type ColorBreakResult,
} from "@/lib/colorPatternBreaks";
import { getCycleKey, computeCycleStatus, type PersistedCycleRecord } from "@/lib/cyclePersistence";

export interface IncrementalCycle extends Cycle {
  cycleKey: string;
  status: "aberto" | "concluido" | "timeout";
  isDirty?: boolean;
}

export interface TriggerDefinition {
  analysisId: number;
  value: number;
  triggerAt: Date;
}

const FIRST_STONE_ANALYSIS: Record<number, number> = {
  0: 4, // A4: 1ª do Minuto 0
  1: 22, // A22: 1ª do Minuto 1
  2: 24, // A24: 1ª do Minuto 2
  3: 26, // A26: 1ª do Minuto 3
  4: 28, // A28: 1ª do Minuto 4
  5: 17, // A17: 1ª do Minuto 5
  6: 30, // A30: 1ª do Minuto 6
  7: 32, // A32: 1ª do Minuto 7
  8: 34, // A34: 1ª do Minuto 8
  9: 36, // A36: 1ª do Minuto 9
};

const SECOND_STONE_ANALYSIS: Record<number, number> = {
  0: 5, // A5: 2ª do Minuto 0
  1: 23, // A23: 2ª do Minuto 1
  2: 25, // A25: 2ª do Minuto 2
  3: 27, // A27: 2ª do Minuto 3
  4: 29, // A29: 2ª do Minuto 4
  5: 18, // A18: 2ª do Minuto 5
  6: 31, // A31: 2ª do Minuto 6
  7: 33, // A33: 2ª do Minuto 7
  8: 35, // A35: 2ª do Minuto 8
  9: 3, // A3: 2ª do Minuto 9
};

function diffMinutes(a: Date, b: Date): number {
  const minA = Math.floor(a.getTime() / 60000);
  const minB = Math.floor(b.getTime() / 60000);
  return Math.max(0, minB - minA);
}

export class IncrementalPredictiveEngine {
  // Ciclos abertos ativos (aguardando brancos ou timeout de 120 min)
  private openCycles = new Map<string, IncrementalCycle>();

  // Armazenamento em memória de todos os ciclos conhecidos (abertos e concluídos)
  // Indexados por cycleKey para consultas rápidas e ordenadas
  private allCyclesByKey = new Map<string, IncrementalCycle>();

  // Buffer deslizante de linhas recentes para detecção de gatilhos (últimas 60 rodadas)
  private recentRowsBuffer: Row[] = [];
  private readonly maxBufferSize = 60;

  // Controle de unicidade por minuto para análises de 1ª e 2ª pedras
  private processedFirstMinuteKeys = new Set<string>();
  private processedSecondMinuteKeys = new Set<string>();
  private minuteStoneCounts = new Map<string, number>();

  // Rastreamento de quebras de cores já processadas para evitar re-disparo
  private processedColorBreakKeys = new Set<string>();

  // Conjunto de IDs de rodadas já processadas para garantir idempotência
  private processedRowIds = new Set<number>();

  /**
   * Limpa todo o estado em memória (útil para testes ou reinicialização).
   */
  public reset(): void {
    this.openCycles.clear();
    this.allCyclesByKey.clear();
    this.recentRowsBuffer = [];
    this.processedFirstMinuteKeys.clear();
    this.processedSecondMinuteKeys.clear();
    this.minuteStoneCounts.clear();
    this.processedColorBreakKeys.clear();
    this.processedRowIds.clear();
  }

  /**
   * Carrega ciclos persistidos previamente (do Supabase ou cache).
   */
  public loadPersistedCycles(cycles: Cycle[]): void {
    for (const c of cycles) {
      if (!c || !c.triggerAt) continue;
      const key = getCycleKey(c.analysis, c.value, c.triggerAt);
      const triggerDate = c.triggerAt instanceof Date ? c.triggerAt : new Date(c.triggerAt);
      const gaps = Array.isArray(c.gaps) ? [...c.gaps] : [];
      const status = computeCycleStatus(gaps, triggerDate);

      const incCycle: IncrementalCycle = {
        analysis: c.analysis,
        value: c.value,
        triggerAt: triggerDate,
        gaps,
        cycleKey: key,
        status,
        isSecondary: c.isSecondary,
        isDirty: false,
      };

      this.allCyclesByKey.set(key, incCycle);
      if (status === "aberto") {
        this.openCycles.set(key, incCycle);
      }
    }
  }

  /**
   * Processa uma única linha (novo resultado de giro da Blaze) incrementalmente.
   * Retorna os ciclos que sofreram alteração nesta rodada (novos ou com novos gaps).
   */
  public processRow(row: Row): {
    newCycles: IncrementalCycle[];
    updatedCycles: IncrementalCycle[];
    dirtyCycles: IncrementalCycle[];
  } {
    if (this.processedRowIds.has(row.id)) {
      return { newCycles: [], updatedCycles: [], dirtyCycles: [] };
    }
    this.processedRowIds.add(row.id);

    const currentDate = parseUtcDate(row.created_at);
    if (Number.isNaN(currentDate.getTime())) {
      return { newCycles: [], updatedCycles: [], dirtyCycles: [] };
    }

    const currentRoll = Number(row.roll);
    const isWhite = currentRoll === 0;

    const newCycles: IncrementalCycle[] = [];
    const updatedCycles: IncrementalCycle[] = [];
    const dirtyCycles: IncrementalCycle[] = [];

    // 1. Atualizar ciclos abertos com a chegada do novo resultado
    const timeoutMs = TIMEOUT_MINUTES * 60000;
    const closedKeys: string[] = [];

    this.openCycles.forEach((cycle, key) => {
      const elapsedMs = currentDate.getTime() - cycle.triggerAt.getTime();

      // Checa se o ciclo ultrapassou a janela de timeout de 120 minutos
      if (elapsedMs > timeoutMs) {
        cycle.status = cycle.gaps.length === 0 ? "timeout" : "concluido";
        cycle.isDirty = true;
        dirtyCycles.push(cycle);
        closedKeys.push(key);
        return;
      }

      // Se a nova pedra for BRANCO (0), computa o gap em minutos
      if (isWhite) {
        if (cycle.gaps.length < MAX_ZEROS) {
          const gap = diffMinutes(cycle.triggerAt, currentDate);
          cycle.gaps.push(gap);
          cycle.isDirty = true;
          updatedCycles.push(cycle);
          dirtyCycles.push(cycle);

          // Se atingiu o limite de 14 brancos, conclui o ciclo
          if (cycle.gaps.length >= MAX_ZEROS) {
            cycle.status = "concluido";
            closedKeys.push(key);
          }
        }
      }
    });

    // Remove do mapa de abertos os ciclos que foram concluídos ou sofreram timeout
    for (const k of closedKeys) {
      this.openCycles.delete(k);
    }

    // 2. Adiciona a linha ao buffer deslizante
    this.recentRowsBuffer.push(row);
    if (this.recentRowsBuffer.length > this.maxBufferSize) {
      this.recentRowsBuffer.shift();
    }

    // 3. Detecta novos gatilhos disparados por esta linha
    const triggers = this.detectTriggersForCurrentRow(this.recentRowsBuffer);

    for (const trig of triggers) {
      const key = getCycleKey(trig.analysisId, trig.value, trig.triggerAt);

      // Evita duplicar se por algum motivo já existir
      if (this.allCyclesByKey.has(key)) continue;

      const newCycle: IncrementalCycle = {
        analysis: trig.analysisId,
        value: trig.value,
        triggerAt: trig.triggerAt,
        gaps: [],
        cycleKey: key,
        status: "aberto",
        isSecondary: trig.analysisId >= 100,
        isDirty: true,
      };

      this.openCycles.set(key, newCycle);
      this.allCyclesByKey.set(key, newCycle);
      newCycles.push(newCycle);
      dirtyCycles.push(newCycle);
    }

    return { newCycles, updatedCycles, dirtyCycles };
  }

  /**
   * Processa uma lista ordenada de linhas sequencialmente.
   */
  public processBatch(rows: Row[]): {
    newCycles: IncrementalCycle[];
    updatedCycles: IncrementalCycle[];
    dirtyCycles: IncrementalCycle[];
  } {
    const allNew: IncrementalCycle[] = [];
    const allUpdated: IncrementalCycle[] = [];
    const allDirtyMap = new Map<string, IncrementalCycle>();

    for (const r of rows) {
      const res = this.processRow(r);
      allNew.push(...res.newCycles);
      allUpdated.push(...res.updatedCycles);
      for (const d of res.dirtyCycles) {
        allDirtyMap.set(d.cycleKey, d);
      }
    }

    return {
      newCycles: allNew,
      updatedCycles: allUpdated,
      dirtyCycles: Array.from(allDirtyMap.values()),
    };
  }

  /**
   * Identifica todos os gatilhos das análises que foram acionados pela última linha do buffer.
   */
  private detectTriggersForCurrentRow(buffer: Row[]): TriggerDefinition[] {
    const triggers: TriggerDefinition[] = [];
    const len = buffer.length;
    if (len === 0) return triggers;

    const currentRow = buffer[len - 1];
    const currentDate = parseUtcDate(currentRow.created_at);
    if (Number.isNaN(currentDate.getTime())) return triggers;

    const currentRoll = Number(currentRow.roll);
    if (!Number.isFinite(currentRoll) || currentRoll < 0 || currentRoll > 14) return triggers;

    // --- Análises de Minuto (1ª e 2ª Pedras do Minuto de final 0..9) ---
    const minutes = currentDate.getMinutes();
    const minUnit = minutes % 10;
    const minKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}-${currentDate.getHours()}-${minutes}`;

    const count = (this.minuteStoneCounts.get(minKey) || 0) + 1;
    this.minuteStoneCounts.set(minKey, count);

    // 1ª Pedra do Minuto
    if (count === 1) {
      if (!this.processedFirstMinuteKeys.has(minKey)) {
        this.processedFirstMinuteKeys.add(minKey);
        const analysisId = FIRST_STONE_ANALYSIS[minUnit];
        if (analysisId !== undefined) {
          triggers.push({
            analysisId,
            value: currentRoll,
            triggerAt: currentDate,
          });
        }
      }
    }

    // 2ª Pedra do Minuto
    if (count === 2) {
      if (!this.processedSecondMinuteKeys.has(minKey)) {
        this.processedSecondMinuteKeys.add(minKey);
        const analysisId = SECOND_STONE_ANALYSIS[minUnit];
        if (analysisId !== undefined) {
          triggers.push({
            analysisId,
            value: currentRoll,
            triggerAt: currentDate,
          });
        }
      }
    }

    // --- Análise 2: Repetição Simples (P1 == P2) ---
    if (len >= 2) {
      const prevRow = buffer[len - 2];
      const prevRoll = Number(prevRow.roll);
      if (Number.isFinite(prevRoll) && prevRoll >= 0 && prevRoll <= 14) {
        if (currentRoll === prevRoll) {
          triggers.push({
            analysisId: 2,
            value: currentRoll,
            triggerAt: currentDate,
          });
        }
      }
    }

    // --- Análises de Gatilho de 2 Pedras (requerem len >= 3: prevPrev, prev, current) ---
    if (len >= 3) {
      const prevPrevRow = buffer[len - 3];
      const prevRow = buffer[len - 2];
      const prevPrevRoll = Number(prevPrevRow.roll);
      const prevRoll = Number(prevRow.roll);

      if (
        Number.isFinite(prevPrevRoll) &&
        prevPrevRoll >= 0 &&
        prevPrevRoll <= 14 &&
        Number.isFinite(prevRoll) &&
        prevRoll >= 0 &&
        prevRoll <= 14
      ) {
        // A10: 8 -> 11
        if (prevRoll === 8 && currentRoll === 11) {
          triggers.push({
            analysisId: 10,
            value: prevPrevRoll,
            triggerAt: currentDate,
          });
        }

        // A11: 11 -> 11
        if (prevRoll === 11 && currentRoll === 11) {
          triggers.push({
            analysisId: 11,
            value: prevPrevRoll,
            triggerAt: currentDate,
          });
        }

        // A12: 4 -> 11
        if (prevRoll === 4 && currentRoll === 11) {
          triggers.push({
            analysisId: 12,
            value: prevPrevRoll,
            triggerAt: currentDate,
          });
        }

        // A13: 4 -> 14 ou 14 -> 4
        if ((prevRoll === 4 && currentRoll === 14) || (prevRoll === 14 && currentRoll === 4)) {
          triggers.push({
            analysisId: 13,
            value: prevPrevRoll,
            triggerAt: currentDate,
          });
        }

        // A21: 7 -> 11 ou 11 -> 7
        if ((prevRoll === 7 && currentRoll === 11) || (prevRoll === 11 && currentRoll === 7)) {
          triggers.push({
            analysisId: 21,
            value: prevPrevRoll,
            triggerAt: currentDate,
          });
        }

        // Somas consecutivas no mesmo minuto (dtPrev e dtCurrent no mesmo minuto)
        const prevDate = parseUtcDate(prevRow.created_at);
        if (
          !Number.isNaN(prevDate.getTime()) &&
          Math.floor(prevDate.getTime() / 60000) === Math.floor(currentDate.getTime() / 60000)
        ) {
          const sum = prevRoll + currentRoll;
          if (sum === 17) {
            triggers.push({
              analysisId: 14,
              value: prevPrevRoll,
              triggerAt: currentDate,
            });
          }
          if (sum === 19) {
            triggers.push({
              analysisId: 15,
              value: prevPrevRoll,
              triggerAt: currentDate,
            });
          }
          if (sum === 21) {
            triggers.push({
              analysisId: 16,
              value: prevPrevRoll,
              triggerAt: currentDate,
            });
          }
        }

        // Análise 19 & 20: Sandwich (P1 - P2 - P1 com P2 != P1)
        // prevPrev = P1, prev = P2, current = P1
        if (prevPrevRoll === currentRoll && prevRoll !== currentRoll) {
          // A19: Sandwich Pontas (value = P1 = currentRoll)
          triggers.push({
            analysisId: 19,
            value: currentRoll,
            triggerAt: currentDate,
          });
          // A20: Sandwich Meio (value = P2 = prevRoll)
          triggers.push({
            analysisId: 20,
            value: prevRoll,
            triggerAt: currentDate,
          });
        }
      }
    }

    // --- Análises Secundárias (offset 1..9) ---
    for (let offset = 1; offset <= 9; offset++) {
      if (len > offset) {
        const targetRow = buffer[len - 1 - offset];
        const n = Number(targetRow.roll);
        if (Number.isFinite(n) && n >= 0 && n <= 9) {
          if (currentDate.getMinutes() % 10 === n) {
            triggers.push({
              analysisId: 100 + offset,
              value: n,
              triggerAt: currentDate,
            });
          }
        }
      }
    }

    // --- Quebra de Padrões de Cores (Análises 50..56) ---
    // Avaliadas sobre o buffer recente. Verificamos se alguma quebra ocorreu EXATAMENTE na pedra atual.
    if (len >= 6) {
      const colorBreaksMap = detectAllColorPatternBreaks(buffer);
      COLOR_PATTERNS.forEach((p) => {
        const brks = colorBreaksMap[p.id] || [];
        for (const b of brks) {
          // A quebra pertence a esta rodada se a pedra da quebra tiver o created_at da linha atual
          if (b.breakStone.createdAt === currentRow.created_at) {
            const breakKey = `COLOR_${p.analysisId}_${b.breakStone.roll}_${b.breakStone.date.getTime()}`;
            if (!this.processedColorBreakKeys.has(breakKey)) {
              this.processedColorBreakKeys.add(breakKey);
              triggers.push({
                analysisId: p.analysisId,
                value: b.breakStone.roll,
                triggerAt: b.breakStone.date,
              });
            }
          }
        }
      });
    }

    return triggers;
  }

  /**
   * Retorna todos os ciclos armazenados para uma análise específica, ordenados cronologicamente.
   */
  public getCyclesForAnalysis(analysisId: number, value?: number): Cycle[] {
    const list: Cycle[] = [];
    this.allCyclesByKey.forEach((c) => {
      if (c.analysis === analysisId && (value === undefined || c.value === value)) {
        list.push({
          analysis: c.analysis,
          value: c.value,
          triggerAt: c.triggerAt,
          gaps: [...c.gaps],
          isSecondary: c.isSecondary,
        });
      }
    });
    return list.sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
  }

  /**
   * Retorna um mapa completo de todas as análises para alimentação imediata dos componentes.
   */
  public getAllCyclesMap(): Record<number, Cycle[]> {
    const map: Record<number, Cycle[]> = {};
    const mainIds = [
      2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56,
    ];
    for (let i = 1; i <= 9; i++) mainIds.push(100 + i);

    for (const id of mainIds) {
      map[id] = [];
    }

    this.allCyclesByKey.forEach((c) => {
      if (map[c.analysis]) {
        map[c.analysis].push({
          analysis: c.analysis,
          value: c.value,
          triggerAt: c.triggerAt,
          gaps: [...c.gaps],
          isSecondary: c.isSecondary,
        });
      }
    });

    for (const id of mainIds) {
      map[id].sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime());
    }

    return map;
  }

  /**
   * Retorna apenas os ciclos que estão atualmente abertos.
   */
  public getOpenCycles(): IncrementalCycle[] {
    return Array.from(this.openCycles.values());
  }

  /**
   * Retorna a contagem de ciclos em memória.
   */
  public getCounts(): { total: number; open: number } {
    return {
      total: this.allCyclesByKey.size,
      open: this.openCycles.size,
    };
  }
}
