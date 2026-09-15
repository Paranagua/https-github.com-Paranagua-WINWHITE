/**
 * Bateria de Testes Estritos — Correção do Bug de Coleta dos 14 Brancos / Gaps
 *
 * Implementa e valida os 8 cenários obrigatórios:
 * 1. Coleta normal de até 14 brancos distintos.
 * 2. Menos de 14 brancos disponíveis (ex: 11 brancos) -> exatamente 11 gaps, sem 0, sem duplicar o último.
 * 3. Reprocessamento do mesmo resultado (duplicação de blaze_result no input) -> ignorado.
 * 4. Dois brancos DISTINTOS que geram o MESMO valor de gap -> ambos aceitos (dedup por identidade, não Set(gaps)).
 * 5. Branco que ocorre antes ou exatamente no momento do gatilho (diff <= 0) -> ignorado.
 * 6. Branco que ocorre após a janela de timeout (120 minutos) -> não adicionado, ciclo encerrado.
 * 7. Reidratação de ciclo persistido com N gaps e subsequente batch histórico (cenário exato do bug).
 * 8. Deduplicação por identidade real (id único ou created_at + identificador da rodada).
 */

import {
  type Row,
  type Cycle,
  collectGaps,
  getResultIdentity,
  diffMinutes,
  MAX_ZEROS,
} from "../src/lib/predictive";
import { IncrementalPredictiveEngine } from "../src/lib/incrementalPredictiveEngine";
import { sanitizeMonotonicGaps } from "../src/lib/cyclePersistence";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, failureDetail?: string) {
  totalTests++;
  if (condition) {
    console.log(`\x1b[32m[PASS]\x1b[0m ${testName}`);
    passedTests++;
  } else {
    console.error(`\x1b[31m[FAIL]\x1b[0m ${testName}`);
    if (failureDetail) {
      console.error(`       Detalhe: ${failureDetail}`);
    }
  }
}

console.log("\n=======================================================");
console.log("INICIANDO VALIDAÇÃO DOS 8 CENÁRIOS DE DEDUPLICAÇÃO DE BRANCOS");
console.log("=======================================================\n");

// =========================================================================
// CASO 1: Coleta normal de até 14 brancos distintos
// =========================================================================
(() => {
  const triggerAt = new Date("2026-09-09T10:00:00.000Z");
  const rows: Row[] = [{ id: 1, roll: "7", color: "red", created_at: triggerAt.toISOString() }];

  // Adiciona 16 brancos distintos em minutos sucessivos (3, 6, 9, 12, ... 48)
  for (let k = 1; k <= 16; k++) {
    const whiteTime = new Date(triggerAt.getTime() + k * 3 * 60000);
    rows.push({
      id: 10 + k,
      roll: "0",
      color: "white",
      created_at: whiteTime.toISOString(),
    });
  }

  const gaps = collectGaps(rows, 0, triggerAt);

  assert(
    gaps.length === 14,
    "Caso 1: Coleta exatamente até o limite de 14 brancos distintos",
    `Esperado 14, obtido ${gaps.length}`,
  );
  assert(
    gaps[0] === 3 && gaps[13] === 42,
    "Caso 1: Valores dos 14 gaps correspondem aos tempos reais de cada branco",
    `Primeiro: ${gaps[0]}, Último: ${gaps[13]}`,
  );
})();

// =========================================================================
// CASO 2: Menos de 14 brancos disponíveis (ex: 11 brancos)
// =========================================================================
(() => {
  const triggerAt = new Date("2026-09-09T10:00:00.000Z");
  const rows: Row[] = [{ id: 100, roll: "7", color: "red", created_at: triggerAt.toISOString() }];

  const exactMinutes = [9, 18, 34, 37, 42, 50, 56, 95, 98, 101, 104];
  exactMinutes.forEach((m, idx) => {
    rows.push({
      id: 200 + idx,
      roll: "0",
      color: "white",
      created_at: new Date(triggerAt.getTime() + m * 60000).toISOString(),
    });
  });

  const gaps = collectGaps(rows, 0, triggerAt);

  assert(
    gaps.length === 11,
    "Caso 2: Retorna exatamente os 11 gaps disponíveis quando há menos de 14 brancos",
    `Esperado 11, obtido ${gaps.length}`,
  );
  assert(
    !gaps.includes(0),
    "Caso 2: Posições faltantes NÃO são preenchidas com '0'",
    `Gaps contém 0: ${JSON.stringify(gaps)}`,
  );
  assert(
    gaps[gaps.length - 1] === 104 && gaps.filter((g) => g === 104).length === 1,
    "Caso 2: O último resultado (104) NÃO é duplicado para preencher as posições 12, 13 e 14",
    `Ocorrências de 104: ${gaps.filter((g) => g === 104).length}`,
  );
})();

// =========================================================================
// CASO 3: Reprocessamento de resultado duplicado (mesmo ID)
// =========================================================================
(() => {
  const triggerAt = new Date("2026-09-09T10:00:00.000Z");
  const rows: Row[] = [
    { id: 300, roll: "10", color: "black", created_at: triggerAt.toISOString() },
    // Branco 1: id 301
    {
      id: 301,
      roll: "0",
      color: "white",
      created_at: new Date(triggerAt.getTime() + 9 * 60000).toISOString(),
    },
    // DUPLICAÇÃO idêntica do mesmo registro no stream
    {
      id: 301,
      roll: "0",
      color: "white",
      created_at: new Date(triggerAt.getTime() + 9 * 60000).toISOString(),
    },
    // Branco 2: id 302
    {
      id: 302,
      roll: "0",
      color: "white",
      created_at: new Date(triggerAt.getTime() + 18 * 60000).toISOString(),
    },
  ];

  const gaps = collectGaps(rows, 0, triggerAt);

  assert(
    gaps.length === 2 && gaps[0] === 9 && gaps[1] === 18,
    "Caso 3: Reprocessamento do mesmo resultado (ID duplicado) é ignorado",
    `Obtido: ${JSON.stringify(gaps)}`,
  );
})();

// =========================================================================
// CASO 4: Dois brancos DISTINTOS que geram o MESMO valor de gap
// =========================================================================
(() => {
  const triggerAt = new Date("2026-09-09T10:00:00.000Z");
  const rows: Row[] = [
    { id: 400, roll: "10", color: "black", created_at: triggerAt.toISOString() },
    // Dois brancos reais que caíram no mesmo minuto relativo 9 (ex: 10:09:10 e 10:09:40)
    {
      id: 401,
      roll: "0",
      color: "white",
      created_at: "2026-09-09T10:09:10.000Z",
    },
    {
      id: 402,
      roll: "0",
      color: "white",
      created_at: "2026-09-09T10:09:40.000Z",
    },
    {
      id: 403,
      roll: "0",
      color: "white",
      created_at: "2026-09-09T10:15:00.000Z",
    },
  ];

  const gaps = collectGaps(rows, 0, triggerAt);

  assert(
    gaps.length === 3 && gaps[0] === 9 && gaps[1] === 9 && gaps[2] === 15,
    "Caso 4: Dois brancos distintos com o mesmo gap numérico (9m, 9m) são ambos preservados",
    `Obtido: ${JSON.stringify(gaps)} - Prova que NÃO se usou Set(gaps)`,
  );
})();

// =========================================================================
// CASO 5: Branco que ocorre no momento ou antes do gatilho (diff <= 0)
// =========================================================================
(() => {
  const triggerAt = new Date("2026-09-09T10:00:00.000Z");
  const rows: Row[] = [
    // Branco que ocorreu antes do gatilho
    {
      id: 501,
      roll: "0",
      color: "white",
      created_at: "2026-09-09T09:58:00.000Z",
    },
    // Gatilho
    { id: 502, roll: "7", color: "red", created_at: triggerAt.toISOString() },
    // Branco exatamente no minuto do gatilho (diff = 0)
    {
      id: 503,
      roll: "0",
      color: "white",
      created_at: triggerAt.toISOString(),
    },
    // Branco válido posterior (diff = 5m)
    {
      id: 504,
      roll: "0",
      color: "white",
      created_at: "2026-09-09T10:05:00.000Z",
    },
  ];

  const gaps = collectGaps(rows, 1, triggerAt);

  assert(
    gaps.length === 1 && gaps[0] === 5,
    "Caso 5: Brancos antes ou no exato instante do gatilho (diff <= 0) são desconsiderados",
    `Obtido: ${JSON.stringify(gaps)}`,
  );
})();

// =========================================================================
// CASO 6: Branco após a janela de timeout (120 minutos)
// =========================================================================
(() => {
  const triggerAt = new Date("2026-09-09T10:00:00.000Z");
  const rows: Row[] = [
    { id: 600, roll: "7", color: "red", created_at: triggerAt.toISOString() },
    {
      id: 601,
      roll: "0",
      color: "white",
      created_at: "2026-09-09T10:30:00.000Z", // 30m (dentro)
    },
    {
      id: 602,
      roll: "0",
      color: "white",
      created_at: "2026-09-09T12:05:00.000Z", // 125m (fora do timeout)
    },
  ];

  const gaps = collectGaps(rows, 0, triggerAt);

  assert(
    gaps.length === 1 && gaps[0] === 30,
    "Caso 6: Branco que ocorre após 120 minutos não é adicionado aos gaps do ciclo",
    `Obtido: ${JSON.stringify(gaps)}`,
  );
})();

// =========================================================================
// CASO 7: Reidratação de ciclo com 11 gaps e subsequente batch histórico
// (Cenário exato do bug reportado pelo usuário: [9, 18, 34 ... 104, 9, 18, 34])
// =========================================================================
(() => {
  const engine = new IncrementalPredictiveEngine();
  const triggerAt = new Date("2026-09-09T10:00:00.000Z");

  // 1. Simula ciclo carregado da persistência com 11 gaps conhecidos
  const persistedCycle: Cycle = {
    analysis: 2, // Repetição de pedra
    value: 7,
    triggerAt,
    gaps: [9, 18, 34, 37, 42, 50, 56, 95, 98, 101, 104],
  };

  engine.loadPersistedCycles([persistedCycle]);

  // 2. Agora o motor recebe um lote histórico que contém os brancos de 9m, 18m, 34m...
  const historicalBatch: Row[] = [
    { id: 701, roll: "0", color: "white", created_at: "2026-09-09T10:09:00.000Z" },
    { id: 702, roll: "0", color: "white", created_at: "2026-09-09T10:18:00.000Z" },
    { id: 703, roll: "0", color: "white", created_at: "2026-09-09T10:34:00.000Z" },
  ];

  // Processa o lote histórico
  engine.processBatch(historicalBatch);

  const openCycles = engine.getOpenCycles();
  const targetCycle = openCycles.find((c) => c.analysis === 2 && c.value === 7);

  assert(
    targetCycle !== undefined,
    "Caso 7: Ciclo aberto localizado após reidratação e batch histórico",
  );

  if (targetCycle) {
    assert(
      targetCycle.gaps.length === 11,
      "Caso 7: Ciclo NÃO duplica brancos históricos ao processar batch (mantém exatamente 11 gaps)",
      `Gaps atuais: ${JSON.stringify(targetCycle.gaps)}`,
    );

    const hasBackwardsLoop = targetCycle.gaps.some((g, idx, arr) => idx > 0 && g < arr[idx - 1]);
    assert(
      !hasBackwardsLoop,
      "Caso 7: O array de gaps é estritamente não-decrescente (sem loop de volta para 9m, 18m, 34m)",
      `Gaps: ${JSON.stringify(targetCycle.gaps)}`,
    );
  }

  // 3. Testa agora a chegada de um NOVO 12º branco real posterior a 104m (ex: 110m)
  const newWhiteRow: Row = {
    id: 799,
    roll: "0",
    color: "white",
    created_at: "2026-09-09T11:50:00.000Z", // 110 minutos após trigger
  };
  engine.processRow(newWhiteRow);

  const updatedOpen = engine.getOpenCycles();
  const updatedCycle = updatedOpen.find((c) => c.analysis === 2 && c.value === 7);
  assert(
    updatedCycle !== undefined && updatedCycle.gaps.length === 12 && updatedCycle.gaps[11] === 110,
    "Caso 7: Um novo 12º branco legítimo após o último gap registrado é corretamente aceito",
    `Gaps: ${JSON.stringify(updatedCycle?.gaps)}`,
  );
})();

// =========================================================================
// CASO 8: Deduplicação por identidade real (id ou created_at + identificador)
// =========================================================================
(() => {
  // Teste 8A: Identidade com id numérico
  const rowWithId1 = { id: 801, roll: "0", created_at: "2026-09-09T10:10:00.000Z" };
  const rowWithId1Duplicate = { id: 801, roll: "0", created_at: "2026-09-09T10:10:00.000Z" };
  const rowWithId2 = { id: 802, roll: "0", created_at: "2026-09-09T10:10:00.000Z" };

  const id1 = getResultIdentity(rowWithId1);
  const id1Dup = getResultIdentity(rowWithId1Duplicate);
  const id2 = getResultIdentity(rowWithId2);

  assert(
    id1 === id1Dup && id1 !== id2,
    "Caso 8: Linhas com ID usam 'id:X' como chave de deduplicação",
    `id1: ${id1}, id1Dup: ${id1Dup}, id2: ${id2}`,
  );

  // Teste 8B: Linha sem id numérico (fallback para created_at + roll)
  const rowNoId1 = { id: undefined, roll: "0", created_at: "2026-09-09T10:15:20.000Z" };
  const rowNoId1Dup = { id: undefined, roll: "0", created_at: "2026-09-09T10:15:20.000Z" };
  const rowNoId2 = { id: undefined, roll: "0", created_at: "2026-09-09T10:15:50.000Z" };

  const noId1 = getResultIdentity(rowNoId1);
  const noId1Dup = getResultIdentity(rowNoId1Dup);
  const noId2 = getResultIdentity(rowNoId2);

  assert(
    noId1 === noId1Dup && noId1 !== noId2,
    "Caso 8: Linhas sem ID usam timestamp + roll como chave única de deduplicação",
    `noId1: ${noId1}, noId1Dup: ${noId1Dup}, noId2: ${noId2}`,
  );

  // Teste 8C: Sanitização de registros pré-existentes corrompidos com loop-back
  const corruptedGaps = [9, 18, 34, 37, 42, 50, 56, 95, 98, 101, 104, 9, 18, 34];
  const cleanedGaps = sanitizeMonotonicGaps(corruptedGaps);

  assert(
    cleanedGaps.length === 11 && cleanedGaps[cleanedGaps.length - 1] === 104,
    "Caso 8: Sanitizador remove com precisão cirúrgica repetições legadas que voltavam no tempo",
    `Original: ${JSON.stringify(corruptedGaps)} -> Limpo: ${JSON.stringify(cleanedGaps)}`,
  );
})();

console.log("\n=======================================================");
console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} TESTES PASSARAM COM SUCESSO`);
console.log("=======================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
