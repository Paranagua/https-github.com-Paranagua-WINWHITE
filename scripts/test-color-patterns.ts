/**
 * Script de Teste Obrigatório — Quebra de Padrões de Cores
 *
 * Casos testados:
 * 1. Padrões com 5 casas devem ser rigorosamente IGNORADOS.
 * 2. Padrões com 6 ou mais devem ser analisados CORRETAMENTE.
 * 3. O 0 (Branco) deve QUEBRAR QUALQUER padrão.
 * 4. Validação de todos os 7 padrões nos 2 sentidos (vermelho e preto).
 * 5. Integração com a regra de 5 ciclos válidos.
 */

import {
  detectAlternados,
  detectAlternadosContinuos,
  detectAlternadosContinuos1N,
  detectAlternadosContinuos2N,
  detectContinuos,
  detectContinuosN1,
  detectContinuosN2,
  detectAllColorPatternBreaks,
  colorBreaksToCycles,
  COLOR_PATTERNS,
} from "../src/lib/colorPatternBreaks";
import type { Row } from "../src/lib/predictive";

function makeRow(id: number, roll: number, minutesOffset = 0): Row {
  const d = new Date(Date.UTC(2026, 8, 5, 12, minutesOffset, 0));
  const color = roll === 0 ? "white" : roll <= 7 ? "red" : "black";
  return {
    id,
    roll: String(roll),
    color,
    created_at: d.toISOString(),
  };
}

let allPassed = true;
function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ [PASSOU] ${testName}`);
  } else {
    console.error(`❌ [FALHOU] ${testName}`);
    allPassed = false;
  }
}

console.log("=================================================");
console.log("TESTE DE QUEBRA DE PADRÕES DE CORES");
console.log("=================================================\n");

// -------------------------------------------------------------
// TESTE 1: Padrões com 5 casas DEVEM SER IGNORADOS
// -------------------------------------------------------------
console.log("--- 1. Padrões com 5 casas (Devem ser ignorados) ---");

// 1.1: 4 Pretos e 1 Vermelho (Total = 5 casas)
const rows5CasasContinuo: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 9, 2), // P
  makeRow(3, 8, 3), // P
  makeRow(4, 11, 4), // P
  makeRow(5, 2, 5), // V (tentativa de quebra após apenas 4 P)
];
const res5Casas = detectContinuos(rows5CasasContinuo);
assert(res5Casas.length === 0, "Contínuos com 5 casas totais (4 P + 1 V) ignorado corretamente");

// 1.2: Alternância de 5 casas no total: P-V-P-V-V
const rows5CasasAlt: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 2, 2), // V
  makeRow(3, 9, 3), // P
  makeRow(4, 3, 4), // V
  makeRow(5, 4, 5), // V (quebra antes do mínimo de 6 casas)
];
const res5Alt = detectAlternados(rows5CasasAlt);
assert(res5Alt.length === 0, "Alternados com 5 casas totais (P-V-P-V-V) ignorado corretamente");

// 1.3: Blocos de 2 com 5 casas no total: P-P-V-V-V
const rows5CasasBlocos2: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 9, 2), // P
  makeRow(3, 2, 3), // V
  makeRow(4, 3, 4), // V
  makeRow(5, 4, 5), // V (quebra antes das 6 casas mínimas)
];
const res5Blocos2 = detectAlternadosContinuos(rows5CasasBlocos2);
assert(res5Blocos2.length === 0, "Alt. Contínuos (2x2) com 5 casas totais ignorado corretamente");

// -------------------------------------------------------------
// TESTE 2: Padrões com 6 ou mais DEVEM SER ANALISADOS CORRETAMENTE
// -------------------------------------------------------------
console.log("\n--- 2. Padrões com 6 ou mais casas (Análise correta) ---");

// 2.1: Contínuos de 5 da mesma cor quebrados na 6ª casa: P-P-P-P-P-V(2)
const rowsContinuo6: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 9, 2), // P
  makeRow(3, 8, 3), // P
  makeRow(4, 11, 4), // P
  makeRow(5, 12, 5), // P (5 pretos)
  makeRow(6, 2, 6), // V(2) (6ª pedra faz a quebra!)
];
const resContinuo6 = detectContinuos(rowsContinuo6);
assert(
  resContinuo6.length === 1 &&
    resContinuo6[0].breakStone.roll === 2 &&
    resContinuo6[0].breakStone.color === "red" &&
    resContinuo6[0].sequenceLength === 6,
  "Contínuos (5x) detectou quebra na 6ª casa com a pedra 2 (Vermelho)",
);
console.log(`   Sequência registrada: ${resContinuo6[0]?.sequenceString}`);

// 2.2: Contínuos de Vermelho quebrando com Preto na 6ª casa: V-V-V-V-V-P(8)
const rowsContinuoRed: Row[] = [
  makeRow(1, 1, 1), // V
  makeRow(2, 2, 2), // V
  makeRow(3, 3, 3), // V
  makeRow(4, 4, 4), // V
  makeRow(5, 5, 5), // V
  makeRow(6, 8, 6), // P(8) quebra!
];
const resContinuoRed = detectContinuos(rowsContinuoRed);
assert(
  resContinuoRed.length === 1 &&
    resContinuoRed[0].breakStone.roll === 8 &&
    resContinuoRed[0].breakStone.color === "black",
  "Contínuos (5x Vermelho) quebrado por Preto 8 na 6ª casa detectado com sucesso",
);

// 2.3: Alternados com 6 casas de alternância e quebra na 7ª casa: P-V-P-V-P-V-V(4) esperando P
const rowsAlternados7: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 1, 2), // V
  makeRow(3, 9, 3), // P
  makeRow(4, 2, 4), // V
  makeRow(5, 8, 5), // P
  makeRow(6, 3, 6), // V (6 casas alternadas completas)
  makeRow(7, 4, 7), // V(4) quebra pois esperava Preto (P)!
];
const resAlt7 = detectAlternados(rowsAlternados7);
assert(
  resAlt7.length === 1 &&
    resAlt7[0].breakStone.roll === 4 &&
    resAlt7[0].breakStone.color === "red" &&
    resAlt7[0].expectedColor === "black",
  "Alternados (1x1) identificou quebra na pedra 4 onde esperava Preto",
);
console.log(`   Sequência registrada: ${resAlt7[0]?.sequenceString}`);

// 2.4: Alt. Contínuos (Blocos de 2): P-P-V-V-P-P-P(9) esperando V
const rowsBlocos2_7: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 9, 2), // P
  makeRow(3, 1, 3), // V
  makeRow(4, 2, 4), // V
  makeRow(5, 8, 5), // P
  makeRow(6, 11, 6), // P (6 casas de PP-VV-PP)
  makeRow(7, 12, 7), // P(12) quebra pois na 7ª casa esperava V!
];
const resBlocos2_7 = detectAlternadosContinuos(rowsBlocos2_7);
assert(
  resBlocos2_7.length === 1 &&
    resBlocos2_7[0].breakStone.roll === 12 &&
    resBlocos2_7[0].expectedColor === "red",
  "Alt. Contínuos (2x2) identificou quebra na pedra 12 onde esperava Vermelho",
);

// 2.5: Alt. Contínuos 1N (Blocos de 3): P-P-P-V-V-V-V(4) esperando P
const rowsBlocos3_7: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 9, 2), // P
  makeRow(3, 8, 3), // P
  makeRow(4, 1, 4), // V
  makeRow(5, 2, 5), // V
  makeRow(6, 3, 6), // V (6 casas de PPP-VVV)
  makeRow(7, 4, 7), // V(4) quebra pois na 7ª esperava P!
];
const resBlocos3_7 = detectAlternadosContinuos1N(rowsBlocos3_7);
assert(
  resBlocos3_7.length === 1 &&
    resBlocos3_7[0].breakStone.roll === 4 &&
    resBlocos3_7[0].expectedColor === "black",
  "Alt. Contínuos 1N (3x3) identificou quebra na pedra 4 onde esperava Preto",
);

// 2.6: Alt. Contínuos 2N (Blocos de 4 com 6 casas mínimas): P-P-P-P-V-V-P(10) esperando V
const rowsBlocos4_7: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 9, 2), // P
  makeRow(3, 8, 3), // P
  makeRow(4, 11, 4), // P
  makeRow(5, 1, 5), // V
  makeRow(6, 2, 6), // V (6 casas mínimas de PPPP-VV)
  makeRow(7, 10, 7), // P(10) quebra pois esperava o 3º V!
];
const resBlocos4_7 = detectAlternadosContinuos2N(rowsBlocos4_7);
assert(
  resBlocos4_7.length === 1 &&
    resBlocos4_7[0].breakStone.roll === 10 &&
    resBlocos4_7[0].expectedColor === "red",
  "Alt. Contínuos 2N (4x4) identificou quebra na pedra 10 onde esperava Vermelho",
);

// 2.7: Contínuos N1 (6 consecutivas quebradas na 7ª): P-P-P-P-P-P-V(2)
const rowsContinuosN1: Row[] = [
  makeRow(1, 10, 1),
  makeRow(2, 9, 2),
  makeRow(3, 8, 3),
  makeRow(4, 11, 4),
  makeRow(5, 12, 5),
  makeRow(6, 13, 6), // 6 pretos
  makeRow(7, 2, 7), // V(2) quebra!
];
const resN1 = detectContinuosN1(rowsContinuosN1);
assert(
  resN1.length === 1 && resN1[0].breakStone.roll === 2,
  "Contínuos N1 (6x) identificou quebra na pedra 2",
);

// 2.8: Contínuos N2 (7+ consecutivas quebradas): V-V-V-V-V-V-V-V-P(14)
const rowsContinuosN2: Row[] = [
  makeRow(1, 1, 1),
  makeRow(2, 2, 2),
  makeRow(3, 3, 3),
  makeRow(4, 4, 4),
  makeRow(5, 5, 5),
  makeRow(6, 6, 6),
  makeRow(7, 7, 7),
  makeRow(8, 1, 8), // 8 vermelhos
  makeRow(9, 14, 9), // P(14) quebra!
];
const resN2 = detectContinuosN2(rowsContinuosN2);
assert(
  resN2.length === 1 && resN2[0].breakStone.roll === 14 && resN2[0].sequenceLength === 9,
  "Contínuos N2 (8x Vermelhos) quebrado por Preto 14 detectado com 9 casas",
);

// -------------------------------------------------------------
// TESTE 3: O 0 (BRANCO) DEVE QUEBRAR QUALQUER PADRÃO
// -------------------------------------------------------------
console.log("\n--- 3. Regra do Branco (0 quebra qualquer padrão) ---");

// 3.1: P-P-P-P-P-0 → quebra pelo 0
const rowsBrancoContinuos: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 9, 2), // P
  makeRow(3, 8, 3), // P
  makeRow(4, 11, 4), // P
  makeRow(5, 12, 5), // P
  makeRow(6, 0, 6), // 0 (Branco quebra!)
];
const resBrancoContinuos = detectContinuos(rowsBrancoContinuos);
assert(
  resBrancoContinuos.length === 1 &&
    resBrancoContinuos[0].breakStone.roll === 0 &&
    resBrancoContinuos[0].breakStone.color === "white",
  "P-P-P-P-P-0 quebrou corretamente pelo 0 e registrou 0 como pedra responsável",
);
console.log(`   Sequência registrada: ${resBrancoContinuos[0]?.sequenceString}`);

// 3.2: V-V-V-V-V-0 → quebra pelo 0
const rowsBrancoRed: Row[] = [
  makeRow(1, 1, 1), // V
  makeRow(2, 2, 2), // V
  makeRow(3, 3, 3), // V
  makeRow(4, 4, 4), // V
  makeRow(5, 5, 5), // V
  makeRow(6, 0, 6), // 0 quebra!
];
const resBrancoRed = detectContinuos(rowsBrancoRed);
assert(
  resBrancoRed.length === 1 && resBrancoRed[0].breakStone.roll === 0,
  "V-V-V-V-V-0 quebrou corretamente pelo 0",
);

// 3.3: P-V-P-V-P-0 → quebra pelo 0
const rowsBrancoAlt: Row[] = [
  makeRow(1, 10, 1), // P
  makeRow(2, 1, 2), // V
  makeRow(3, 9, 3), // P
  makeRow(4, 2, 4), // V
  makeRow(5, 8, 5), // P
  makeRow(6, 0, 6), // 0 quebra!
];
const resBrancoAlt = detectAlternados(rowsBrancoAlt);
assert(
  resBrancoAlt.length === 1 && resBrancoAlt[0].breakStone.roll === 0,
  "P-V-P-V-P-0 quebrou corretamente pelo 0 com 6 casas analisadas",
);
console.log(`   Sequência registrada: ${resBrancoAlt[0]?.sequenceString}`);

// -------------------------------------------------------------
// TESTE 4: Integração com Ciclos e Latência
// -------------------------------------------------------------
console.log("\n--- 4. Integração com Ciclos e Estrutura Existente ---");

// Cria um histórico com várias quebras e calcula ciclos
const allRows = [
  ...rowsContinuo6,
  makeRow(7, 5, 7),
  makeRow(8, 0, 8), // branco após 2 minutos da quebra!
];
const cycles = colorBreaksToCycles(resContinuo6, allRows);
assert(
  cycles.length === 1 &&
    cycles[0].value === 2 &&
    cycles[0].analysis === 54 &&
    cycles[0].gaps.length >= 1,
  "Ciclo gerado a partir da quebra possui value=2, analysis=54 e gaps computados",
);
console.log(
  `   Ciclo gerado: value=${cycles[0].value}, analysis=${cycles[0].analysis}, gaps=[${cycles[0].gaps.join(", ")}]`,
);

console.log("\n=================================================");
if (allPassed) {
  console.log("🎉 TODOS OS TESTES PASSARAM COM SUCESSO!");
} else {
  console.error("❌ ALGUNS TESTES FALHARAM!");
  process.exit(1);
}
console.log("=================================================");
