/**
 * Validação de Equivalência Estrita — FASE 2
 *
 * Compara o Motor Preditivo Incremental com o método em lote tradicional.
 * Testa todas as 38 análises:
 * - A2 (repetição)
 * - A3..A5 (minutos 9 e 0)
 * - A10..A13 (8-11, 11-11, 4-11, 4-14)
 * - A14..A16 (somas 17, 19, 21 no mesmo minuto)
 * - A17..A18 (minuto 5)
 * - A19..A20 (sandwich pontas e meio)
 * - A21 (7-11 / 11-7)
 * - A22..A36 (minutos 1..9)
 * - A50..A56 (quebra de padrões de cores)
 * - Secundárias 101..109
 */

import {
  type Row,
  type Cycle,
  buildA2,
  buildA3,
  buildA4,
  buildA5,
  buildA8_11,
  buildA11_11,
  buildA4_11,
  buildA4_14,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  buildA1Minuto5,
  buildA2Minuto5,
  buildASandwichPontas,
  buildASandwichMeio,
  buildA7_11,
  buildA1Minuto1,
  buildA2Minuto1,
  buildA1Minuto2,
  buildA2Minuto2,
  buildA1Minuto3,
  buildA2Minuto3,
  buildA1Minuto4,
  buildA2Minuto4,
  buildA1Minuto6,
  buildA2Minuto6,
  buildA1Minuto7,
  buildA2Minuto7,
  buildA1Minuto8,
  buildA2Minuto8,
  buildA1Minuto9,
  buildSecondary,
} from "../src/lib/predictive";

import {
  COLOR_PATTERNS,
  detectAllColorPatternBreaks,
  colorBreaksToCycles,
} from "../src/lib/colorPatternBreaks";

import { IncrementalPredictiveEngine } from "../src/lib/incrementalPredictiveEngine";

// Gera uma sequência realista e rica com mais de 600 rodadas cobrindo múltiplos dias,
// viradas de dia (23:58 -> 00:05), repetições, gatilhos de soma, quebras de cores e brancos.
function generateRichTestSequence(): Row[] {
  const rows: Row[] = [];
  // Início em 2026-09-09T22:00:00.000Z
  let currentMs = new Date("2026-09-09T22:00:00.000Z").getTime();
  let id = 100000;

  function pushRow(roll: number, advanceSeconds = 25) {
    const color = roll === 0 ? "white" : roll <= 7 ? "red" : "black";
    rows.push({
      id: ++id,
      roll: String(roll),
      color,
      created_at: new Date(currentMs).toISOString(),
    });
    currentMs += advanceSeconds * 1000;
  }

  // Preenche 600 rodadas controladas com padrões específicos
  for (let cycle = 0; cycle < 15; cycle++) {
    // 1. Minuto 0: pedra 7 (1ª), pedra 3 (2ª)
    pushRow(7, 20);
    pushRow(3, 20);

    // 2. Repetição: pedra 10 -> pedra 10 (A2)
    pushRow(10, 20);
    pushRow(10, 25);

    // 3. Gatilho 8-11: pedra anterior=2, depois 8 -> 11 (A10)
    pushRow(2, 20);
    pushRow(8, 20);
    pushRow(11, 20);

    // 4. Gatilho 4-11: anterior=5, 4 -> 11 (A12)
    pushRow(5, 20);
    pushRow(4, 20);
    pushRow(11, 20);

    // 5. Gatilho 11-11: anterior=9, 11 -> 11 (A11)
    pushRow(9, 20);
    pushRow(11, 20);
    pushRow(11, 20);

    // 6. Gatilho 4-14: anterior=1, 4 -> 14 (A13)
    pushRow(1, 20);
    pushRow(4, 20);
    pushRow(14, 20);

    // 7. Gatilho 7-11: anterior=6, 7 -> 11 (A21)
    pushRow(6, 20);
    pushRow(7, 20);
    pushRow(11, 20);

    // 8. Somas mesmo minuto: anterior=8, 8+9=17 no mesmo minuto (A14)
    pushRow(8, 10);
    pushRow(8, 15);
    pushRow(9, 20); // 8+9=17

    // 9. Sandwich: anterior=12, depois 12 - 4 - 12 (A19 e A20)
    pushRow(12, 20);
    pushRow(4, 20);
    pushRow(12, 20);

    // 10. Padrão de cores Contínuo (5x vermelho quebrado por preto 8) -> A54
    pushRow(1, 20);
    pushRow(2, 20);
    pushRow(3, 20);
    pushRow(4, 20);
    pushRow(5, 20);
    pushRow(8, 20); // quebra pelo 8 (preto)

    // 10b. Alternados (1x1): P-V-P-V-P-V quebrado por V(4) -> A50
    pushRow(8, 20);
    pushRow(1, 20);
    pushRow(9, 20);
    pushRow(2, 20);
    pushRow(10, 20);
    pushRow(3, 20);
    pushRow(4, 20); // quebra por V(4)

    // 10c. Contínuos N1 (6x vermelho quebrado por preto 11) -> A55
    pushRow(1, 20);
    pushRow(2, 20);
    pushRow(3, 20);
    pushRow(4, 20);
    pushRow(5, 20);
    pushRow(6, 20);
    pushRow(11, 20); // quebra pelo 11 (preto)

    // 10d. Contínuos N2 (7x vermelho quebrado por preto 12) -> A56
    pushRow(1, 20);
    pushRow(2, 20);
    pushRow(3, 20);
    pushRow(4, 20);
    pushRow(5, 20);
    pushRow(6, 20);
    pushRow(7, 20);
    pushRow(12, 20); // quebra pelo 12 (preto)

    // 11. Branco para gerar gaps nos ciclos abertos
    pushRow(0, 30);

    // 12. Algumas rodadas intermediárias
    pushRow(13, 25);
    pushRow(6, 25);
    pushRow(0, 40); // outro branco
  }

  return rows;
}

async function runEquivalenceValidation() {
  console.log("=================================================");
  console.log("VALIDAÇÃO DE EQUIVALÊNCIA ESTRITA (FASE 2)");
  console.log("Motor Incremental vs. Método em Lote Tradicional");
  console.log("=================================================\n");

  const rows = generateRichTestSequence();
  console.log(`Sequência de teste gerada com ${rows.length} rodadas.`);
  console.log(`Início: ${rows[0].created_at} | Fim: ${rows[rows.length - 1].created_at}\n`);

  // 1. Executa método em lote tradicional
  console.log("Executando método em lote tradicional...");
  const batchMap: Record<number, Cycle[]> = {
    2: buildA2(rows),
    3: buildA3(rows),
    4: buildA4(rows),
    5: buildA5(rows),
    10: buildA8_11(rows),
    11: buildA11_11(rows),
    12: buildA4_11(rows),
    13: buildA4_14(rows),
    14: buildASoma17(rows),
    15: buildASoma19(rows),
    16: buildASoma21(rows),
    17: buildA1Minuto5(rows),
    18: buildA2Minuto5(rows),
    19: buildASandwichPontas(rows),
    20: buildASandwichMeio(rows),
    21: buildA7_11(rows),
    22: buildA1Minuto1(rows),
    23: buildA2Minuto1(rows),
    24: buildA1Minuto2(rows),
    25: buildA2Minuto2(rows),
    26: buildA1Minuto3(rows),
    27: buildA2Minuto3(rows),
    28: buildA1Minuto4(rows),
    29: buildA2Minuto4(rows),
    30: buildA1Minuto6(rows),
    31: buildA2Minuto6(rows),
    32: buildA1Minuto7(rows),
    33: buildA2Minuto7(rows),
    34: buildA1Minuto8(rows),
    35: buildA2Minuto8(rows),
    36: buildA1Minuto9(rows),
  };

  for (let i = 1; i <= 9; i++) {
    batchMap[100 + i] = buildSecondary(rows, i);
  }

  const colorBreaksMap = detectAllColorPatternBreaks(rows);
  COLOR_PATTERNS.forEach((p) => {
    const brks = colorBreaksMap[p.id] || [];
    batchMap[p.analysisId] = colorBreaksToCycles(brks, rows);
  });

  // 2. Executa Motor Incremental (pedra por pedra na ordem exata de chegada)
  console.log("Executando Motor Incremental pedra por pedra...");
  const engine = new IncrementalPredictiveEngine();
  engine.reset();

  for (const r of rows) {
    engine.processRow(r);
  }

  const incrementalMap = engine.getAllCyclesMap();

  // 3. Compara cada uma das análises
  console.log("\nComparando resultados análise por análise...\n");

  const allAnalysisIds = [
    2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56,
  ];
  for (let i = 1; i <= 9; i++) allAnalysisIds.push(100 + i);

  let totalDiscrepancies = 0;
  let totalCyclesChecked = 0;

  for (const aId of allAnalysisIds) {
    const batchCycles = (batchMap[aId] || []).sort(
      (a, b) => a.triggerAt.getTime() - b.triggerAt.getTime(),
    );
    const incCycles = (incrementalMap[aId] || []).sort(
      (a, b) => a.triggerAt.getTime() - b.triggerAt.getTime(),
    );

    totalCyclesChecked += batchCycles.length;

    if (batchCycles.length !== incCycles.length) {
      console.error(
        `❌ [Análise ${aId}] Divergência na contagem de ciclos: batch=${batchCycles.length}, incremental=${incCycles.length}`,
      );
      totalDiscrepancies++;
      continue;
    }

    let analysisPassed = true;
    for (let i = 0; i < batchCycles.length; i++) {
      const b = batchCycles[i];
      const inc = incCycles[i];

      const matchValue = b.value === inc.value;
      const matchTime = b.triggerAt.getTime() === inc.triggerAt.getTime();
      const matchGaps = JSON.stringify(b.gaps) === JSON.stringify(inc.gaps);

      if (!matchValue || !matchTime || !matchGaps) {
        analysisPassed = false;
        totalDiscrepancies++;
        console.error(
          `❌ [Análise ${aId} - Ciclo ${i}] Divergência:
            Batch:       value=${b.value}, time=${b.triggerAt.toISOString()}, gaps=[${b.gaps.join(",")}]
            Incremental: value=${inc.value}, time=${inc.triggerAt.toISOString()}, gaps=[${inc.gaps.join(",")}]`,
        );
        break;
      }
    }

    if (analysisPassed && batchCycles.length > 0) {
      console.log(
        `✅ [Análise ${aId.toString().padStart(3, " ")}] 100% Equivalente (${batchCycles.length} ciclos verificados)`,
      );
    } else if (batchCycles.length === 0 && incCycles.length === 0) {
      console.log(
        `⚪ [Análise ${aId.toString().padStart(3, " ")}] Sem ocorrências nesta amostragem`,
      );
    }
  }

  console.log("\n=================================================");
  if (totalDiscrepancies === 0) {
    console.log(`✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO!`);
    console.log(`Total de ciclos validados: ${totalCyclesChecked}`);
    console.log(`Total de divergências: 0`);
    console.log("O motor incremental é 100% matematicamente equivalente ao método em lote.");
  } else {
    console.error(`❌ VALIDAÇÃO FALHOU COM ${totalDiscrepancies} DIVERGÊNCIAS!`);
    process.exit(1);
  }
  console.log("=================================================\n");
}

runEquivalenceValidation().catch((err) => {
  console.error("Erro na execução da validação:", err);
  process.exit(1);
});
