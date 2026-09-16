import {
  IncrementalPredictiveEngine,
  ANALYSIS_ID_Q,
  ANALYSIS_CODE_Q,
  ANALYSIS_NAME_Q,
} from "../src/lib/incrementalPredictiveEngine";
import { getCycleKey, cycleToRecord, recordToCycle } from "../src/lib/cyclePersistence";
import {
  isPrimarySignalAnalysis,
  getAnalysisGroupName,
  formatAnalysisCode,
} from "../src/lib/signalHierarchy";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log("=== INICIANDO AUDITORIA E TESTES DA ANÁLISE Q (QUEBRA DE RECUPERAÇÃO) ===");

// 1. Testes de Auxiliares de Chave e Persistência
console.log("\n--- TESTE 1: Chave unívoca e Formatação ---");
const testDate = new Date("2026-03-20T12:00:00.000Z");
const keyQ = getCycleKey(ANALYSIS_ID_Q, 0, testDate);
assert(keyQ === `Q_V0_T${testDate.getTime()}`, `getCycleKey gerou chave correta: ${keyQ}`);

const keyA = getCycleKey(10, 5, testDate);
assert(
  keyA === `A10_V5_T${testDate.getTime()}`,
  `getCycleKey manteve padrão para outras análises: ${keyA}`,
);

// 2. Testes de Hierarquia de Sinais
console.log("\n--- TESTE 2: Hierarquia de Sinais ---");
assert(
  isPrimarySignalAnalysis(ANALYSIS_ID_Q) === false,
  "Análise Q NÃO é sinal primário (apenas confluência)",
);
assert(
  getAnalysisGroupName(ANALYSIS_ID_Q) === "Quebra de Recuperação",
  "Grupo de Análise Q é 'Quebra de Recuperação'",
);
assert(formatAnalysisCode(ANALYSIS_ID_Q) === "Q", "Código formatado de Análise Q é 'Q'");

// 3. Conversão para Registro Persistível
console.log("\n--- TESTE 3: cycleToRecord ---");
const recordQ = cycleToRecord({
  analysis: ANALYSIS_ID_Q,
  value: 0,
  triggerAt: testDate,
  gaps: [5, 12],
  isSecondary: false,
});
assert(recordQ.analysis === 60, "analysis é 60");
assert(recordQ.analysis_code === "Q", "analysis_code é 'Q'");
assert(
  recordQ.analysis_name === "Quebra de Recuperação",
  "analysis_name é 'Quebra de Recuperação'",
);
assert(recordQ.cycle_key === `Q_V0_T${testDate.getTime()}`, "cycle_key está no formato Q_V0_T...");

// 4. Testes do IncrementalPredictiveEngine
console.log("\n--- TESTE 4: Motor Incremental - Sequência < 25 giros sem branco ---");
const engine = new IncrementalPredictiveEngine();
const baseTime = new Date("2026-03-20T10:00:00.000Z").getTime();

// Insere 24 pedras pretas/vermelhas (sem branco)
for (let i = 1; i <= 24; i++) {
  const row = {
    id: 1000 + i,
    roll: 1, // Vermelho
    color: 1,
    created_at: new Date(baseTime + i * 60_000).toISOString(),
  };
  const res = engine.processRow(row);
  const qCreated = res.newCycles.some((c) => c.analysis === ANALYSIS_ID_Q);
  assert(!qCreated, `Giro ${i} (< 25) não deve criar ciclo Q`);
}

// 5. Giro 25 sem branco: ativa a janela, mas ainda não é branco -> não cria ciclo Q
console.log("\n--- TESTE 5: Giro 25 (Arma Janela) ---");
const row25 = {
  id: 1025,
  roll: 2, // Preto
  color: 2,
  created_at: new Date(baseTime + 25 * 60_000).toISOString(),
};
const res25 = engine.processRow(row25);
assert(
  !res25.newCycles.some((c) => c.analysis === ANALYSIS_ID_Q),
  "Giro 25 sem branco não cria ciclo Q (apenas arma a janela)",
);

// 6. Giro 26 é Branco (0): Primeiro gatilho Q!
console.log("\n--- TESTE 6: Giro 26 é Branco (0) - Primeiro Gatilho Q ---");
const row26 = {
  id: 1026,
  roll: 0, // Branco
  color: 0,
  created_at: new Date(baseTime + 26 * 60_000).toISOString(),
};
const res26 = engine.processRow(row26);
const qCycle26 = res26.newCycles.find((c) => c.analysis === ANALYSIS_ID_Q);
assert(Boolean(qCycle26), "Giro 26 com branco cria ciclo Q");
assert(qCycle26?.value === 0, "Ciclo Q tem value 0");
assert(qCycle26?.gaps.length === 0, "Ciclo Q recém-criado tem gaps vazios");
assert(qCycle26?.status === "aberto", "Ciclo Q tem status aberto");
assert(
  qCycle26?.cycleKey === `Q_V0_T${new Date(baseTime + 26 * 60_000).getTime()}`,
  "cycleKey unívoco",
);

// 7. Giros 27, 28, 29 sem branco: continuam na janela, sem novo gatilho Q
console.log("\n--- TESTE 7: Giros 27-29 sem branco ---");
for (let i = 27; i <= 29; i++) {
  const row = {
    id: 1000 + i,
    roll: 5,
    color: 1,
    created_at: new Date(baseTime + i * 60_000).toISOString(),
  };
  const res = engine.processRow(row);
  assert(
    !res.newCycles.some((c) => c.analysis === ANALYSIS_ID_Q),
    `Giro ${i} sem branco não cria novo Q`,
  );
}

// 8. Giro 30 é outro Branco (0): Segundo gatilho Q na mesma janela!
console.log("\n--- TESTE 8: Giro 30 é Branco (0) - Segundo Gatilho Q na Janela ---");
const row30 = {
  id: 1030,
  roll: 0,
  color: 0,
  created_at: new Date(baseTime + 30 * 60_000).toISOString(),
};
const res30 = engine.processRow(row30);
const qCycle30 = res30.newCycles.find((c) => c.analysis === ANALYSIS_ID_Q);
assert(Boolean(qCycle30), "Giro 30 com branco cria novo ciclo Q independente");
assert(
  qCycle30?.cycleKey === `Q_V0_T${new Date(baseTime + 30 * 60_000).getTime()}`,
  "Giro 30 tem key própria",
);

// E o ciclo 26 deve ter recebido este branco no seu array de gaps!
const updatedQ26 = res30.updatedCycles.find((c) => c.cycleKey === qCycle26?.cycleKey);
assert(Boolean(updatedQ26), "Ciclo Q do giro 26 foi atualizado com a chegada do branco no giro 30");
assert(updatedQ26?.gaps.length === 1, "Ciclo Q do giro 26 agora tem 1 gap");
assert(
  updatedQ26?.gaps[0] === 4,
  `Gap entre giro 26 e 30 é de 4 minutos (obtido: ${updatedQ26?.gaps[0]})`,
);

// 9. Deduplicação: se a mesma linha 30 for reprocessada, não pode adicionar o gap novamente
console.log("\n--- TESTE 9: Deduplicação Estrita por Identidade do Resultado ---");
const res30Dup = engine.processRow(row30);
assert(
  !res30Dup.updatedCycles.some((c) => c.cycleKey === qCycle26?.cycleKey),
  "Reprocessar linha 30 é ignorado por idempotência",
);

// 10. Avançar até o giro 80
console.log("\n--- TESTE 10: Avanço até o giro 80 ---");
for (let i = 31; i <= 79; i++) {
  const row = {
    id: 1000 + i,
    roll: 7,
    color: 1,
    created_at: new Date(baseTime + i * 60_000).toISOString(),
  };
  engine.processRow(row);
}

// Giro 80 é Branco: último giro dentro da janela de recuperação!
const row80 = {
  id: 1080,
  roll: 0,
  color: 0,
  created_at: new Date(baseTime + 80 * 60_000).toISOString(),
};
const res80 = engine.processRow(row80);
const qCycle80 = res80.newCycles.find((c) => c.analysis === ANALYSIS_ID_Q);
assert(Boolean(qCycle80), "Giro 80 com branco cria ciclo Q (limite final da janela)");

// 11. Giro 81 é Branco: fora da janela -> NÃO pode gerar Q!
console.log("\n--- TESTE 11: Giro 81 é Branco (Fora da Janela de Recuperação) ---");
const row81 = {
  id: 1081,
  roll: 0,
  color: 0,
  created_at: new Date(baseTime + 81 * 60_000).toISOString(),
};
const res81 = engine.processRow(row81);
const qCycle81 = res81.newCycles.find((c) => c.analysis === ANALYSIS_ID_Q);
assert(!qCycle81, "Giro 81 NÃO pode criar ciclo Q (janela encerrou no 80)");

// 12. Verificar getAllCyclesMap
console.log("\n--- TESTE 12: getAllCyclesMap inclui ANALYSIS_ID_Q (60) ---");
const map = engine.getAllCyclesMap();
assert(Array.isArray(map[ANALYSIS_ID_Q]), "map[60] existe e é array");
assert(
  map[ANALYSIS_ID_Q].length === 3,
  `map[60] contém os 3 ciclos Q criados (26, 30, 80) (obtido: ${map[ANALYSIS_ID_Q].length})`,
);

// 13. Teste de Reset
console.log("\n--- TESTE 13: Reset limpa o estado ---");
engine.reset();
const mapAfterReset = engine.getAllCyclesMap();
assert(mapAfterReset[ANALYSIS_ID_Q].length === 0, "Após reset, ciclos Q são limpos");

console.log("\n========================================================");
console.log("🎉 TODOS OS TESTES DA ANÁLISE Q PASSARAM COM SUCESSO!");
console.log("========================================================");
