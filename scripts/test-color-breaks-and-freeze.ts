/**
 * Testes para:
 * 1) Deduplicação de gaps na Análise de Quebra de Padrão de Cores
 * 2) Descongelamento do painel auditor após aparição do "0"
 */

import { detectAllColorPatternBreaks, colorBreaksToCycles } from "../src/lib/colorPatternBreaks";
import {
  computeWhiteFreezeIntervals,
  getCurrentWhiteStreak,
  isSignalAuditableAfterFreeze,
  isSignalInWhiteFreeze,
} from "../src/lib/whiteStreakFreeze";
import { mergePersistedWithLiveCycles, sanitizeMonotonicGaps } from "../src/lib/cyclePersistence";
import type { Row } from "../src/lib/predictive";

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
    passed++;
  } else {
    console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
  }
}

console.log("\n=======================================================");
console.log("TESTE 1: GAPS NA QUEBRA DE PADRÃO DE CORES");
console.log("=======================================================\n");

(() => {
  // Padrão de 5 consecutivas quebradas na 6ª (contínuos 5x):
  // 5 pretos seguidos (P-P-P-P-P) e depois quebra com pedra 7 (vermelho)
  const baseTime = new Date("2026-09-10T12:00:00.000Z");
  const rows: Row[] = [
    { id: 1, roll: "8", color: "black", created_at: new Date(baseTime.getTime()).toISOString() },
    {
      id: 2,
      roll: "9",
      color: "black",
      created_at: new Date(baseTime.getTime() + 30000).toISOString(),
    },
    {
      id: 3,
      roll: "10",
      color: "black",
      created_at: new Date(baseTime.getTime() + 60000).toISOString(),
    },
    {
      id: 4,
      roll: "11",
      color: "black",
      created_at: new Date(baseTime.getTime() + 90000).toISOString(),
    },
    {
      id: 5,
      roll: "12",
      color: "black",
      created_at: new Date(baseTime.getTime() + 120000).toISOString(),
    },
    // Quebra com pedra 7 (vermelho na 6ª casa):
    {
      id: 6,
      roll: "7",
      color: "red",
      created_at: new Date(baseTime.getTime() + 150000).toISOString(),
    },
  ];

  // Adiciona 5 brancos espaçados após o instante da quebra (150000 = 12:02:30 -> floor minute 12:02)
  // Gaps a partir de 12:02:
  // 9 min -> 12:11
  // 18 min -> 12:20
  // 34 min -> 12:36
  // 37 min -> 12:39
  // 42 min -> 12:44
  const breakMinute = Math.floor((baseTime.getTime() + 150000) / 60000) * 60000;
  const whiteDeltas = [9, 18, 34, 37, 42];
  whiteDeltas.forEach((deltaMin, idx) => {
    rows.push({
      id: 20 + idx,
      roll: "0",
      color: "white",
      created_at: new Date(breakMinute + deltaMin * 60000).toISOString(),
    });
  });

  const breaks = detectAllColorPatternBreaks(rows);
  assert(breaks.continuos.length > 0, "Quebra de padrão contínuos detectada");

  const cycles = colorBreaksToCycles(breaks.continuos, rows);
  assert(cycles.length > 0, "Ciclos gerados a partir das quebras");

  const cycleGaps = cycles[0].gaps;
  assert(cycleGaps.length === 5, `Exatamente 5 gaps encontrados (encontrado: ${cycleGaps.length})`);
  assert(
    JSON.stringify(cycleGaps) === JSON.stringify([9, 18, 34, 37, 42]),
    `Gaps correspondem aos tempos reais esperados [9, 18, 34, 37, 42]: ${JSON.stringify(cycleGaps)}`,
  );

  // Testa re-hidratação com duplicação histórica corrompida (como o bug reportado: 9, 18, 34 repetidos no fim)
  const corruptedGaps = [9, 18, 34, 37, 42, 50, 56, 95, 98, 101, 104, 9, 18, 34];
  const sanitized = sanitizeMonotonicGaps(corruptedGaps);
  assert(
    JSON.stringify(sanitized) === JSON.stringify([9, 18, 34, 37, 42, 50, 56, 95, 98, 101, 104]),
    `Sanitizador removeu a duplicação histórica de 9m, 18m, 34m no final do ciclo: ${JSON.stringify(sanitized)}`,
  );
})();

console.log("\n=======================================================");
console.log("TESTE 2: CONGELAMENTO E DESCONGELAMENTO DO PAINEL AUDITOR");
console.log("=======================================================\n");

(() => {
  const t0 = new Date("2026-09-10T14:00:00.000Z").getTime();

  // Cria 20 giros sem branco (streak 20)
  const rounds20: any[] = [];
  for (let i = 1; i <= 20; i++) {
    rounds20.push({
      id: i,
      roll: String((i % 14) + 1),
      color: i % 2 === 0 ? "black" : "red",
      created_at: new Date(t0 + i * 30000).toISOString(),
    });
  }

  const status20 = getCurrentWhiteStreak(rounds20);
  assert(!status20.isFrozen, "Com 20 giros sem branco, isFrozen é false");
  assert(status20.currentStreak === 20, `currentStreak é 20 (obtido: ${status20.currentStreak})`);

  // Adiciona mais 6 giros (total 26 sem branco -> deve congelar no giro 25)
  const rounds26 = [...rounds20];
  for (let i = 21; i <= 26; i++) {
    rounds26.push({
      id: i,
      roll: String((i % 14) + 1),
      color: i % 2 === 0 ? "black" : "red",
      created_at: new Date(t0 + i * 30000).toISOString(),
    });
  }

  const status26 = getCurrentWhiteStreak(rounds26);
  assert(status26.isFrozen, "Com 26 giros sem branco, isFrozen é TRUE (congelado)");
  assert(status26.currentStreak === 26, `currentStreak é 26 (obtido: ${status26.currentStreak})`);

  const intervals26 = computeWhiteFreezeIntervals(rounds26);
  assert(intervals26.length > 0, "Janela de congelamento ativa gerada");

  // Sinal anterior ao congelamento (ex: t0 + 5 min): DEVE ser auditável
  const preFreezeSignalTime = t0 + 5 * 60000;
  assert(
    isSignalAuditableAfterFreeze(preFreezeSignalTime, intervals26, status26),
    "Sinal ANTERIOR ao início do congelamento permanece auditável e válido (não zera)",
  );

  // Sinal gerado após o início do congelamento (ex: giro 25+) NÃO deve ser auditável enquanto congelado
  const duringFreezeSignalTime = t0 + 25 * 30000 + 1000;
  assert(
    !isSignalAuditableAfterFreeze(duringFreezeSignalTime, intervals26, status26),
    "Sinal gerado DURANTE o congelamento não é auditável",
  );

  // AGORA O DESCONGELAMENTO:
  // Um giro com o "0" (Branco) é sorteado na mesa!
  const roundsUnfrozen = [
    ...rounds26,
    {
      id: 27,
      roll: "0",
      color: "white",
      created_at: new Date(t0 + 27 * 30000).toISOString(),
    },
  ];

  const statusUnfrozen = getCurrentWhiteStreak(roundsUnfrozen);
  assert(
    !statusUnfrozen.isFrozen,
    "Após chegada do 0 (branco), isFrozen DESCONGELA IMEDIATAMENTE e vira FALSE",
  );
  assert(statusUnfrozen.currentStreak === 0, "currentStreak reseta para 0 após o branco");

  const intervalsUnfrozen = computeWhiteFreezeIntervals(roundsUnfrozen);
  assert(intervalsUnfrozen.length > 0, "Intervalos mantêm registro do congelamento finalizado");

  // Sinal histórico pré-congelamento continua auditável após descongelamento
  assert(
    isSignalAuditableAfterFreeze(preFreezeSignalTime, intervalsUnfrozen, statusUnfrozen),
    "Sinal histórico pré-congelamento CONTINUA auditável após o descongelamento (não é apagado)",
  );

  // Sinal emitido após descongelamento (>= quebra + 2 minutos)
  const whiteTime = t0 + 27 * 30000;
  const postUnfreezeSignalTime = Math.floor(whiteTime / 60000) * 60000 + 3 * 60000;
  assert(
    isSignalAuditableAfterFreeze(postUnfreezeSignalTime, intervalsUnfrozen, statusUnfrozen),
    "Sinais pós-descongelamento (>= quebra + 2 min) são auditados com sucesso",
  );
})();

console.log("\n=======================================================");
console.log(`RESULTADO: ${passed}/${total} TESTES PASSARAM COM SUCESSO`);
console.log("=======================================================\n");

if (passed !== total) {
  process.exit(1);
}
