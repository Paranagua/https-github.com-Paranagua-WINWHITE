/**
 * Módulo de Detecção e Auditoria: Quebra de Padrões de Cores
 *
 * Cores da Blaze:
 * 🔴 Vermelho = 1, 2, 3, 4, 5, 6, 7
 * ⚫ Preto = 8, 9, 10, 11, 12, 13, 14
 * ⚪ Branco = 0
 *
 * Regras mandatórias:
 * 1. Mínimo de 6 casas/resultados consecutivos para validação do padrão. Padrões com menos de 6 casas são estritamente ignorados.
 * 2. O 0 (Branco) sempre quebra qualquer padrão (alternância ou continuidade) e é registrado como a pedra da quebra.
 * 3. Após uma quebra, inicia-se nova avaliação utilizando os resultados seguintes.
 * 4. Lógica genérica que funciona nos dois sentidos (vermelho quebrando preto, preto quebrando vermelho, e branco quebrando qualquer padrão).
 * 5. Reutilização integral da estrutura de ciclos (Cycle, collectGaps, MIN_CYCLES = 5) das análises existentes.
 */

import { parseUtcDate } from "@/lib/utils";
import {
  collectGaps,
  isValidCycle,
  getValidCycles,
  type Cycle,
  type Row,
  MIN_CYCLES,
} from "@/lib/predictive";

export type PatternColor = "red" | "black" | "white";

export type ColorPatternType =
  | "alternados"
  | "alternados_continuos"
  | "alternados_continuos_1n"
  | "alternados_continuos_2n"
  | "continuos"
  | "continuos_n1"
  | "continuos_n2";

export interface ColorPatternDefinition {
  id: ColorPatternType;
  analysisId: number;
  name: string;
  shortName: string;
  categoryName: string;
  description: string;
  minCasasParaAnalise: number;
}

export const COLOR_PATTERNS: ColorPatternDefinition[] = [
  {
    id: "alternados",
    analysisId: 50,
    name: "Alternados (1 em 1)",
    shortName: "Alternados (1x1)",
    categoryName: "Alternância Simples",
    description:
      "Alternância de cor a cada rodada (P-V-P-V-P-V...). Identifica a pedra que quebrar a alternância com no mínimo 6 casas.",
    minCasasParaAnalise: 6,
  },
  {
    id: "alternados_continuos",
    analysisId: 51,
    name: "Alternados Contínuos (Blocos de 2)",
    shortName: "Alt. Contínuos (2x2)",
    categoryName: "Alternância em Blocos",
    description:
      "Alternância em blocos de 2 rodadas da mesma cor (PP-VV-PP...). Mínimo de 6 casas de padrão e verificação na 7ª casa (ex: VV-PP-VV-V).",
    minCasasParaAnalise: 7,
  },
  {
    id: "alternados_continuos_1n",
    analysisId: 52,
    name: "Alternados Contínuos 1N (Blocos de 3)",
    shortName: "Alt. Contínuos 1N (3x3)",
    categoryName: "Alternância em Blocos",
    description:
      "Alternância em blocos de 3 rodadas da mesma cor (PPP-VVV...). Mínimo de 6 casas de padrão e verificação na 7ª casa (ex: VVV-PPP-P).",
    minCasasParaAnalise: 7,
  },
  {
    id: "alternados_continuos_2n",
    analysisId: 53,
    name: "Alternados Contínuos 2N (Blocos de 4)",
    shortName: "Alt. Contínuos 2N (4x4)",
    categoryName: "Alternância em Blocos",
    description:
      "Alternância em blocos de 4 rodadas da mesma cor (PPPP-VVVV...). Mínimo de 8 casas de padrão e verificação na 9ª casa (ex: VVVV-PPPP-P).",
    minCasasParaAnalise: 9,
  },
  {
    id: "continuos",
    analysisId: 54,
    name: "Contínuos (5 consecutivas)",
    shortName: "Contínuos (5x)",
    categoryName: "Sequência da Mesma Cor",
    description:
      "Mesma cor durante 5 rodadas consecutivas (P-P-P-P-P ou V-V-V-V-V) quebrada na 6ª casa disponível.",
    minCasasParaAnalise: 6,
  },
  {
    id: "continuos_n1",
    analysisId: 55,
    name: "Contínuos N1 (6 consecutivas)",
    shortName: "Contínuos N1 (6x)",
    categoryName: "Sequência da Mesma Cor",
    description: "Mesma cor durante 6 rodadas consecutivas quebrada na 7ª rodada.",
    minCasasParaAnalise: 6,
  },
  {
    id: "continuos_n2",
    analysisId: 56,
    name: "Contínuos N2 (7+ consecutivas)",
    shortName: "Contínuos N2 (7x+)",
    categoryName: "Sequência da Mesma Cor",
    description: "Mesma cor durante 7 ou mais rodadas consecutivas quebrada na rodada seguinte.",
    minCasasParaAnalise: 6,
  },
];

/**
 * Retorna a cor de acordo com a regra oficial da Blaze:
 * 🔴 Vermelho: 1..7
 * ⚫ Preto: 8..14
 * ⚪ Branco: 0
 */
export function getPatternColor(roll: number | string): PatternColor {
  const n = Number(roll);
  if (!Number.isFinite(n) || n === 0) return "white";
  if (n >= 1 && n <= 7) return "red";
  if (n >= 8 && n <= 14) return "black";
  return "white";
}

export function getOppositeColor(c: PatternColor): PatternColor {
  if (c === "red") return "black";
  if (c === "black") return "red";
  return "white";
}

export function getColorSymbol(c: PatternColor, roll?: number): string {
  if (c === "red") return "V";
  if (c === "black") return "P";
  return "0";
}

export function getColorLabelPt(c: PatternColor): string {
  if (c === "red") return "Vermelho";
  if (c === "black") return "Preto";
  return "Branco (0)";
}

/**
 * Estrutura registrada para cada quebra de padrão identificada
 */
export interface ColorBreakResult {
  patternId: ColorPatternType;
  analysisId: number;
  patternName: string;
  // Sequência analisada
  sequence: Array<{
    roll: number;
    color: PatternColor;
    id?: number;
    createdAt?: string;
    isBreakStone: boolean;
  }>;
  sequenceString: string; // Ex: "P-P-P-P-P-V(2)" ou "P-V-P-V-P-V-P(0)"
  sequenceLength: number; // Mínimo de 6 casas
  // Cores
  predominantColor: PatternColor; // Cor do padrão
  expectedColor: PatternColor; // Cor que era esperada na posição da quebra
  // Pedra que fez a quebra
  breakStone: {
    roll: number;
    color: PatternColor;
    createdAt: string;
    date: Date;
    rowIndex: number;
  };
}

/**
 * Formata a string legível da sequência, destacando a pedra da quebra
 * Ex: P-P-P-P-P-V(2) ou V-P-V-P-V-0
 */
export function formatSequenceString(
  sequence: Array<{ roll: number; color: PatternColor; isBreakStone: boolean }>,
): string {
  return sequence
    .map((item) => {
      const sym = getColorSymbol(item.color);
      if (item.isBreakStone) {
        if (item.roll === 0) return `0`;
        return `${sym}(${item.roll})`;
      }
      return sym;
    })
    .join("-");
}

/**
 * 1 — ALTERNADOS (1 em 1)
 * Alternância de cor a cada rodada.
 * Requisito mínimo de 6 casas para análise.
 * P-V-P-V-P-V... Identifica a pedra que quebrar a alternância.
 * Também atende ao exemplo do Branco: P-V-P-V-P-0 onde há 6 casas e o 0 faz a quebra.
 */
export function detectAlternados(rows: Row[]): ColorBreakResult[] {
  const breaks: ColorBreakResult[] = [];
  const def = COLOR_PATTERNS.find((p) => p.id === "alternados")!;
  const len = rows.length;
  let i = 0;

  while (i < len) {
    const cStart = getPatternColor(rows[i].roll);
    if (cStart === "white") {
      i++;
      continue;
    }

    // Esperado na posição pos relativa a i:
    // pos 0: cStart, pos 1: oposta(cStart), pos 2: cStart, etc.
    const expectedAt = (pos: number): PatternColor => {
      return pos % 2 === 0 ? cStart : getOppositeColor(cStart);
    };

    let k = i;
    while (k < len) {
      const cCurrent = getPatternColor(rows[k].roll);
      const expected = expectedAt(k - i);
      if (cCurrent === expected && cCurrent !== "white") {
        k++;
      } else {
        break;
      }
    }

    // k é a posição da quebra (ou fim do array)
    const patternCasas = k - i; // quantidade de casas que seguiram a alternância estrita
    if (k < len) {
      const totalCasas = k - i + 1; // total de casas incluindo a pedra de quebra
      // Para ser válido:
      // Ou tivemos >= 6 casas de alternância válida e a pedra k quebrou (total >= 7),
      // ou tivemos 5 casas de alternância e a 6ª pedra (total 6) quebrou (ex: P-V-P-V-P-0).
      if (totalCasas >= 6 && patternCasas >= 5) {
        const breakRow = rows[k];
        const breakDate = parseUtcDate(breakRow.created_at);
        const breakRoll = Number(breakRow.roll);
        const breakColor = getPatternColor(breakRoll);
        const expected = expectedAt(k - i);

        const seqItems = [];
        for (let s = i; s <= k; s++) {
          const r = rows[s];
          const rollNum = Number(r.roll);
          seqItems.push({
            roll: rollNum,
            color: getPatternColor(rollNum),
            id: r.id,
            createdAt: r.created_at,
            isBreakStone: s === k,
          });
        }

        breaks.push({
          patternId: "alternados",
          analysisId: def.analysisId,
          patternName: def.name,
          sequence: seqItems,
          sequenceString: formatSequenceString(seqItems),
          sequenceLength: totalCasas,
          predominantColor: cStart,
          expectedColor: expected,
          breakStone: {
            roll: breakRoll,
            color: breakColor,
            createdAt: breakRow.created_at,
            date: breakDate,
            rowIndex: k,
          },
        });

        // Após uma quebra, iniciar uma nova avaliação utilizando os resultados seguintes
        i = k + 1;
        continue;
      }
    }

    i = Math.max(i + 1, k);
  }

  return breaks;
}

/**
 * 2 — ALTERNADOS CONTÍNUOS (Blocos de 2)
 * Alternância em blocos de 2 rodadas da mesma cor: PP-VV-PP-VV...
 * Com no mínimo 6 casas, identificar a primeira pedra que fugir do padrão esperado.
 */
export function detectAlternadosContinuos(rows: Row[]): ColorBreakResult[] {
  const breaks: ColorBreakResult[] = [];
  const def = COLOR_PATTERNS.find((p) => p.id === "alternados_continuos")!;
  const len = rows.length;
  let i = 0;

  while (i < len) {
    const cStart = getPatternColor(rows[i].roll);
    if (cStart === "white") {
      i++;
      continue;
    }

    const cOpposite = getOppositeColor(cStart);
    // Posições: 0,1 -> cStart; 2,3 -> cOpposite; 4,5 -> cStart; 6,7 -> cOpposite...
    const expectedAt = (pos: number): PatternColor => {
      const block = Math.floor(pos / 2);
      return block % 2 === 0 ? cStart : cOpposite;
    };

    let k = i;
    while (k < len) {
      const cCurrent = getPatternColor(rows[k].roll);
      const expected = expectedAt(k - i);
      if (cCurrent === expected && cCurrent !== "white") {
        k++;
      } else {
        break;
      }
    }

    const patternCasas = k - i;
    if (k < len) {
      const totalCasas = k - i + 1;
      // Regra: padrão de no mínimo 6 casas completas (PP-VV-PP ou VV-PP-VV)
      // e verificação da quebra na 7ª casa (totalCasas >= 7). Exemplo: v v p p v v - v
      if (patternCasas >= 6 && totalCasas >= 7) {
        const breakRow = rows[k];
        const breakDate = parseUtcDate(breakRow.created_at);
        const breakRoll = Number(breakRow.roll);
        const breakColor = getPatternColor(breakRoll);
        const expected = expectedAt(k - i);

        const seqItems = [];
        for (let s = i; s <= k; s++) {
          const r = rows[s];
          const rollNum = Number(r.roll);
          seqItems.push({
            roll: rollNum,
            color: getPatternColor(rollNum),
            id: r.id,
            createdAt: r.created_at,
            isBreakStone: s === k,
          });
        }

        breaks.push({
          patternId: "alternados_continuos",
          analysisId: def.analysisId,
          patternName: def.name,
          sequence: seqItems,
          sequenceString: formatSequenceString(seqItems),
          sequenceLength: totalCasas,
          predominantColor: cStart,
          expectedColor: expected,
          breakStone: {
            roll: breakRoll,
            color: breakColor,
            createdAt: breakRow.created_at,
            date: breakDate,
            rowIndex: k,
          },
        });

        i = k + 1;
        continue;
      }
    }

    i++;
  }

  return breaks;
}

/**
 * 3 — ALTERNADOS CONTÍNUOS 1N (Blocos de 3)
 * Alternância em blocos de 3 rodadas da mesma cor: PPP-VVV-PPP-VVV...
 * Com no mínimo 6 casas, identificar a primeira pedra que quebrar o padrão.
 */
export function detectAlternadosContinuos1N(rows: Row[]): ColorBreakResult[] {
  const breaks: ColorBreakResult[] = [];
  const def = COLOR_PATTERNS.find((p) => p.id === "alternados_continuos_1n")!;
  const len = rows.length;
  let i = 0;

  while (i < len) {
    const cStart = getPatternColor(rows[i].roll);
    if (cStart === "white") {
      i++;
      continue;
    }

    const cOpposite = getOppositeColor(cStart);
    // Posições: 0,1,2 -> cStart; 3,4,5 -> cOpposite; 6,7,8 -> cStart...
    const expectedAt = (pos: number): PatternColor => {
      const block = Math.floor(pos / 3);
      return block % 2 === 0 ? cStart : cOpposite;
    };

    let k = i;
    while (k < len) {
      const cCurrent = getPatternColor(rows[k].roll);
      const expected = expectedAt(k - i);
      if (cCurrent === expected && cCurrent !== "white") {
        k++;
      } else {
        break;
      }
    }

    const patternCasas = k - i;
    if (k < len) {
      const totalCasas = k - i + 1;
      // Regra: Nível 1 segue o mesmo padrão, com no mínimo 6 casas completas (PPP-VVV ou VVV-PPP)
      // e verificação na 7ª casa (totalCasas >= 7). Exemplo: v v v p p p - p
      if (patternCasas >= 6 && totalCasas >= 7) {
        const breakRow = rows[k];
        const breakDate = parseUtcDate(breakRow.created_at);
        const breakRoll = Number(breakRow.roll);
        const breakColor = getPatternColor(breakRoll);
        const expected = expectedAt(k - i);

        const seqItems = [];
        for (let s = i; s <= k; s++) {
          const r = rows[s];
          const rollNum = Number(r.roll);
          seqItems.push({
            roll: rollNum,
            color: getPatternColor(rollNum),
            id: r.id,
            createdAt: r.created_at,
            isBreakStone: s === k,
          });
        }

        breaks.push({
          patternId: "alternados_continuos_1n",
          analysisId: def.analysisId,
          patternName: def.name,
          sequence: seqItems,
          sequenceString: formatSequenceString(seqItems),
          sequenceLength: totalCasas,
          predominantColor: cStart,
          expectedColor: expected,
          breakStone: {
            roll: breakRoll,
            color: breakColor,
            createdAt: breakRow.created_at,
            date: breakDate,
            rowIndex: k,
          },
        });

        i = k + 1;
        continue;
      }
    }

    i++;
  }

  return breaks;
}

/**
 * 4 — ALTERNADOS CONTÍNUOS 2N (Blocos de 4)
 * Alternância em blocos de 4 rodadas da mesma cor: PPPP-VVVV-PPPP-VVVV...
 * Regra: Nível 2 aumenta mais duas casas -> no mínimo 8 casas completas (4 de uma cor + 4 da oposta),
 * com verificação na 9ª casa (ex: v v v v p p p p - p).
 */
export function detectAlternadosContinuos2N(rows: Row[]): ColorBreakResult[] {
  const breaks: ColorBreakResult[] = [];
  const def = COLOR_PATTERNS.find((p) => p.id === "alternados_continuos_2n")!;
  const len = rows.length;
  let i = 0;

  while (i < len) {
    const cStart = getPatternColor(rows[i].roll);
    if (cStart === "white") {
      i++;
      continue;
    }

    const cOpposite = getOppositeColor(cStart);
    // Posições: 0..3 -> cStart; 4..7 -> cOpposite; 8..11 -> cStart...
    const expectedAt = (pos: number): PatternColor => {
      const block = Math.floor(pos / 4);
      return block % 2 === 0 ? cStart : cOpposite;
    };

    let k = i;
    while (k < len) {
      const cCurrent = getPatternColor(rows[k].roll);
      const expected = expectedAt(k - i);
      if (cCurrent === expected && cCurrent !== "white") {
        k++;
      } else {
        break;
      }
    }

    const patternCasas = k - i;
    if (k < len) {
      const totalCasas = k - i + 1;
      // Regra: Nível 2 aumenta mais duas casas -> no mínimo 8 casas de padrão completas (PPPP-VVVV ou VVVV-PPPP)
      // e verificação na 9ª casa (totalCasas >= 9). Exemplo: v v v v p p p p - p
      if (patternCasas >= 8 && totalCasas >= 9) {
        const breakRow = rows[k];
        const breakDate = parseUtcDate(breakRow.created_at);
        const breakRoll = Number(breakRow.roll);
        const breakColor = getPatternColor(breakRoll);
        const expected = expectedAt(k - i);

        const seqItems = [];
        for (let s = i; s <= k; s++) {
          const r = rows[s];
          const rollNum = Number(r.roll);
          seqItems.push({
            roll: rollNum,
            color: getPatternColor(rollNum),
            id: r.id,
            createdAt: r.created_at,
            isBreakStone: s === k,
          });
        }

        breaks.push({
          patternId: "alternados_continuos_2n",
          analysisId: def.analysisId,
          patternName: def.name,
          sequence: seqItems,
          sequenceString: formatSequenceString(seqItems),
          sequenceLength: totalCasas,
          predominantColor: cStart,
          expectedColor: expected,
          breakStone: {
            roll: breakRoll,
            color: breakColor,
            createdAt: breakRow.created_at,
            date: breakDate,
            rowIndex: k,
          },
        });

        i = k + 1;
        continue;
      }
    }

    i++;
  }

  return breaks;
}

/**
 * 5 — CONTÍNUOS (5 rodadas consecutivas da mesma cor)
 * Exemplo: P-P-P-P-P-V(2) ou V-V-V-V-V-0
 * Requer mínimo de 6 casas disponíveis. A 6ª pedra faz a quebra se não for da mesma cor.
 */
export function detectContinuos(rows: Row[]): ColorBreakResult[] {
  const breaks: ColorBreakResult[] = [];
  const def = COLOR_PATTERNS.find((p) => p.id === "continuos")!;
  const len = rows.length;
  let i = 0;

  while (i + 5 < len) {
    const cStart = getPatternColor(rows[i].roll);
    if (cStart === "white") {
      i++;
      continue;
    }

    // Verifica se as 5 primeiras pedras são estritamente da mesma cor
    let allSame = true;
    for (let offset = 1; offset < 5; offset++) {
      if (getPatternColor(rows[i + offset].roll) !== cStart) {
        allSame = false;
        break;
      }
    }

    if (!allSame) {
      i++;
      continue;
    }

    // A 6ª pedra (índice i + 5) é a pedra candidata à quebra do padrão de 5 contínuos
    const breakIndex = i + 5;
    const breakRow = rows[breakIndex];
    const breakRoll = Number(breakRow.roll);
    const breakColor = getPatternColor(breakRoll);

    // Se a 6ª pedra for diferente (outra cor ou 0 / branco): quebra o padrão!
    if (breakColor !== cStart) {
      const breakDate = parseUtcDate(breakRow.created_at);
      const seqItems = [];
      for (let s = i; s <= breakIndex; s++) {
        const r = rows[s];
        const rollNum = Number(r.roll);
        seqItems.push({
          roll: rollNum,
          color: getPatternColor(rollNum),
          id: r.id,
          createdAt: r.created_at,
          isBreakStone: s === breakIndex,
        });
      }

      breaks.push({
        patternId: "continuos",
        analysisId: def.analysisId,
        patternName: def.name,
        sequence: seqItems,
        sequenceString: formatSequenceString(seqItems),
        sequenceLength: 6,
        predominantColor: cStart,
        expectedColor: cStart,
        breakStone: {
          roll: breakRoll,
          color: breakColor,
          createdAt: breakRow.created_at,
          date: breakDate,
          rowIndex: breakIndex,
        },
      });

      // Após uma quebra, iniciar uma nova avaliação utilizando os resultados seguintes
      i = breakIndex + 1;
    } else {
      // Se a 6ª pedra é da mesma cor, não é quebra de 5 (será 6 ou mais consecutivas)
      i++;
    }
  }

  return breaks;
}

/**
 * 6 — CONTÍNUOS N1 (6 rodadas consecutivas da mesma cor)
 * Exemplo: P-P-P-P-P-P-V(2) ou V-V-V-V-V-V-0
 * Requer 6 pedras consecutivas da mesma cor. A 7ª pedra faz a quebra se não for da mesma cor.
 */
export function detectContinuosN1(rows: Row[]): ColorBreakResult[] {
  const breaks: ColorBreakResult[] = [];
  const def = COLOR_PATTERNS.find((p) => p.id === "continuos_n1")!;
  const len = rows.length;
  let i = 0;

  while (i + 6 < len) {
    const cStart = getPatternColor(rows[i].roll);
    if (cStart === "white") {
      i++;
      continue;
    }

    // Verifica se as 6 primeiras pedras são estritamente da mesma cor
    let allSame = true;
    for (let offset = 1; offset < 6; offset++) {
      if (getPatternColor(rows[i + offset].roll) !== cStart) {
        allSame = false;
        break;
      }
    }

    if (!allSame) {
      i++;
      continue;
    }

    // A 7ª pedra (índice i + 6) é a pedra candidata à quebra do padrão de 6 contínuos
    const breakIndex = i + 6;
    const breakRow = rows[breakIndex];
    const breakRoll = Number(breakRow.roll);
    const breakColor = getPatternColor(breakRoll);

    // Se for diferente (cor oposta ou branco 0): quebrou o padrão N1
    if (breakColor !== cStart) {
      const breakDate = parseUtcDate(breakRow.created_at);
      const seqItems = [];
      for (let s = i; s <= breakIndex; s++) {
        const r = rows[s];
        const rollNum = Number(r.roll);
        seqItems.push({
          roll: rollNum,
          color: getPatternColor(rollNum),
          id: r.id,
          createdAt: r.created_at,
          isBreakStone: s === breakIndex,
        });
      }

      breaks.push({
        patternId: "continuos_n1",
        analysisId: def.analysisId,
        patternName: def.name,
        sequence: seqItems,
        sequenceString: formatSequenceString(seqItems),
        sequenceLength: 7,
        predominantColor: cStart,
        expectedColor: cStart,
        breakStone: {
          roll: breakRoll,
          color: breakColor,
          createdAt: breakRow.created_at,
          date: breakDate,
          rowIndex: breakIndex,
        },
      });

      i = breakIndex + 1;
    } else {
      // Se a 7ª pedra for da mesma cor, será Contínuos N2 (7+)
      i++;
    }
  }

  return breaks;
}

/**
 * 7 — CONTÍNUOS N2 (7 ou mais rodadas consecutivas da mesma cor)
 * Exemplo: P-P-P-P-P-P-P-V(2) ou V-V-V-V-V-V-V-0
 * O padrão continua válido enquanto a mesma cor permanecer.
 * A primeira pedra que for de outra cor ou branco faz a quebra.
 */
export function detectContinuosN2(rows: Row[]): ColorBreakResult[] {
  const breaks: ColorBreakResult[] = [];
  const def = COLOR_PATTERNS.find((p) => p.id === "continuos_n2")!;
  const len = rows.length;
  let i = 0;

  while (i + 7 <= len) {
    const cStart = getPatternColor(rows[i].roll);
    if (cStart === "white") {
      i++;
      continue;
    }

    // Verifica se pelo menos 7 pedras são estritamente da mesma cor
    let allSame = true;
    for (let offset = 1; offset < 7; offset++) {
      if (getPatternColor(rows[i + offset].roll) !== cStart) {
        allSame = false;
        break;
      }
    }

    if (!allSame) {
      i++;
      continue;
    }

    // Continua expandindo enquanto a mesma cor permanecer
    let k = i + 7;
    while (k < len && getPatternColor(rows[k].roll) === cStart) {
      k++;
    }

    // Se encontramos a quebra (k < len):
    if (k < len) {
      const breakRow = rows[k];
      const breakDate = parseUtcDate(breakRow.created_at);
      const breakRoll = Number(breakRow.roll);
      const breakColor = getPatternColor(breakRoll);

      const seqItems = [];
      for (let s = i; s <= k; s++) {
        const r = rows[s];
        const rollNum = Number(r.roll);
        seqItems.push({
          roll: rollNum,
          color: getPatternColor(rollNum),
          id: r.id,
          createdAt: r.created_at,
          isBreakStone: s === k,
        });
      }

      breaks.push({
        patternId: "continuos_n2",
        analysisId: def.analysisId,
        patternName: def.name,
        sequence: seqItems,
        sequenceString: formatSequenceString(seqItems),
        sequenceLength: k - i + 1,
        predominantColor: cStart,
        expectedColor: cStart,
        breakStone: {
          roll: breakRoll,
          color: breakColor,
          createdAt: breakRow.created_at,
          date: breakDate,
          rowIndex: k,
        },
      });

      i = k + 1;
    } else {
      break;
    }
  }

  return breaks;
}

/**
 * Função unificada que executa a detecção de um padrão específico por ID
 */
export function detectColorPatternBreaksById(
  id: ColorPatternType,
  rows: Row[],
): ColorBreakResult[] {
  switch (id) {
    case "alternados":
      return detectAlternados(rows);
    case "alternados_continuos":
      return detectAlternadosContinuos(rows);
    case "alternados_continuos_1n":
      return detectAlternadosContinuos1N(rows);
    case "alternados_continuos_2n":
      return detectAlternadosContinuos2N(rows);
    case "continuos":
      return detectContinuos(rows);
    case "continuos_n1":
      return detectContinuosN1(rows);
    case "continuos_n2":
      return detectContinuosN2(rows);
    default:
      return [];
  }
}

/**
 * Executa a detecção completa dos 7 padrões
 */
export function detectAllColorPatternBreaks(
  rows: Row[],
): Record<ColorPatternType, ColorBreakResult[]> {
  return {
    alternados: detectAlternados(rows),
    alternados_continuos: detectAlternadosContinuos(rows),
    alternados_continuos_1n: detectAlternadosContinuos1N(rows),
    alternados_continuos_2n: detectAlternadosContinuos2N(rows),
    continuos: detectContinuos(rows),
    continuos_n1: detectContinuosN1(rows),
    continuos_n2: detectContinuosN2(rows),
  };
}

/**
 * INTEGRAÇÃO:
 * Converte as quebras identificadas na estrutura padrão Cycle[] existente do sistema.
 * Reutiliza a mesma estrutura de dados, gaps até o branco, e a regra dos 5 ciclos válidos.
 */
export function colorBreaksToCycles(breaks: ColorBreakResult[], rows: Row[]): Cycle[] {
  return breaks.map((b) => ({
    value: b.breakStone.roll,
    analysis: b.analysisId,
    triggerAt: b.breakStone.date,
    gaps: collectGaps(rows, b.breakStone.rowIndex, b.breakStone.date),
  }));
}

/**
 * Retorna os ciclos válidos da quebra de cor (respeitando se obteve ao menos 1 resultado/gap)
 */
export function getValidColorBreakCycles(cycles: Cycle[], pedra?: number): Cycle[] {
  return (cycles || []).filter(
    (c) => isValidCycle(c) && (pedra === undefined || c.value === pedra),
  );
}

/**
 * Verifica se a análise de quebra atingiu o requisito de maturidade dos 5 ciclos válidos
 */
export function hasMinValidCycles(cycles: Cycle[], pedra?: number): boolean {
  const valid = getValidColorBreakCycles(cycles, pedra);
  return valid.length >= MIN_CYCLES;
}
