/**
 * SCRIPT DE EXECUÇÃO — SEGUNDO LABORATÓRIO: OTIMIZAÇÃO E ROBUSTEZ DO MOTOR TOP.
 *
 * Totalmente isolado da produção.
 * Sem Look-Ahead Bias (No Future Data / Walk-Forward).
 * Executa os testes para:
 * - Janelas TOP-2, TOP-3, TOP-4, TOP-5, TOP-6
 * - TOP-3-CONSISTÊNCIA (3/3, 2/3, TOP-3 + Exato)
 * - Tendência Benchmark
 * - Robustez Temporal em 5 Blocos (B1..B5)
 * - Estabilidade (Média, Mínimo, Máximo, Amplitude, Desvio Padrão)
 * - Cobertura
 * - Sinalização de Amostra (Grande, Média, Pequena)
 * - Teste de Interseção Top x Tendência
 * - Teste de Confluência Temporal
 */

import * as fs from "fs";
import { blazeSupabase } from "../src/integrations/supabase/blaze-client";
import type { CycleGapsRecord, BacktestModelName } from "../src/lib/backtesting/backtestTypes";
import {
  runLab2AnalysisBacktest,
  buildLab2GlobalSummary,
  type Lab2AnalysisResult,
} from "../src/lib/backtesting/lab2Runner";

const outputLines: string[] = [];
function out(str = "") {
  console.log(str);
  outputLines.push(str);
}

async function fetchCyclesForAnalysis(
  analysisId: number,
  maxRecords = 3000,
): Promise<CycleGapsRecord[]> {
  const records: CycleGapsRecord[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (records.length < maxRecords) {
    const { data, error } = await blazeSupabase
      .from("predictive_cycles")
      .select(
        "id, cycle_key, analysis, analysis_code, analysis_name, value, trigger_at, gaps, status, total_whites, first_white_gap",
      )
      .eq("analysis", analysisId)
      .eq("status", "concluido")
      .order("trigger_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data) {
      if (!r.trigger_at || !Array.isArray(r.gaps) || r.gaps.length === 0) continue;
      records.push({
        id: r.id,
        cycleKey: r.cycle_key,
        analysis: r.analysis,
        analysisCode: r.analysis_code || `A${r.analysis}`,
        analysisName: r.analysis_name || undefined,
        value: r.value,
        triggerAt: new Date(r.trigger_at),
        gaps: r.gaps,
        status: r.status as any,
        totalWhites: r.total_whites || r.gaps.length,
        firstWhiteGap: r.first_white_gap,
      });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return records;
}

async function main() {
  console.log(
    "==========================================================================================",
  );
  console.log("🧪 SEGUNDO LABORATÓRIO — OTIMIZAÇÃO E ROBUSTEZ DO MOTOR TOP (ESTRITAMENTE ISOLADO)");
  console.log(
    "==========================================================================================",
  );
  console.log(
    "Metodologia: Walk-Forward Estrito (No Future Data), dados 100% reais de predictive_cycles.\n",
  );

  const targetAnalyses = [
    // Padrão
    { id: 2, code: "A2", group: "Padrão" },
    { id: 3, code: "A3", group: "Padrão" },
    { id: 4, code: "A4", group: "Padrão" },
    { id: 5, code: "A5", group: "Padrão" },
    // Minutos (+1 min)
    { id: 17, code: "A17", group: "Minutos (+1min)" },
    { id: 18, code: "A18", group: "Minutos (+1min)" },
    // Pedra Minuto
    { id: 25, code: "A25", group: "Pedra Minuto" },
    { id: 26, code: "A26", group: "Pedra Minuto" },
    { id: 32, code: "A32", group: "Pedra Minuto 7" },
    { id: 33, code: "A33", group: "Pedra Minuto 7" },
    { id: 35, code: "A35", group: "Pedra Minuto 8" },
    { id: 36, code: "A36", group: "Pedra Minuto 9" },
    // Regulares intermediárias
    { id: 10, code: "A10", group: "Padrão Secundário" },
    { id: 14, code: "A14", group: "Padrão Secundário" },
    // Quebras de cores (Q1..Q7)
    { id: 50, code: "Q1", group: "Quebra Cores (A50)" },
    { id: 52, code: "Q3", group: "Quebra Cores (A52)" },
    { id: 54, code: "Q5", group: "Quebra Cores (A54)" },
    { id: 56, code: "Q7", group: "Quebra Cores (A56)" },
    // Quebras de recuperação (Q26..Q80)
    { id: 60, code: "Q26", group: "Recuperação Pequena (A60)" },
    { id: 61, code: "Q27", group: "Recuperação Pequena (A61)" },
    { id: 101, code: "Q67", group: "Recuperação Grande (A101)" },
    { id: 102, code: "Q68", group: "Recuperação Grande (A102)" },
  ];

  const allResults: Lab2AnalysisResult[] = [];

  for (const target of targetAnalyses) {
    const rawCycles = await fetchCyclesForAnalysis(target.id, 3000);
    if (rawCycles.length === 0) {
      console.log(`[Aviso] ${target.code} (A${target.id}): sem ciclos concluídos no banco.`);
      continue;
    }

    console.log(
      `Carregados ${rawCycles.length} ciclos concluídos para ${target.code} [A${target.id} - ${target.group}]. Processando walk-forward...`,
    );
    const result = runLab2AnalysisBacktest(target.id, target.code, rawCycles);
    allResults.push(result);
  }

  // ==========================================================================================
  // 5. TESTE POR ANÁLISE — MODELOS DE JANELA (TOP-2 A TOP-6)
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out("5. MODELOS DE JANELA POR ANÁLISE (ANÁLISE | TOP2 | TOP3 | TOP4 | TOP5 | TOP6)");
  out("==========================================================================================");
  out(
    "ANÁLISE | AMOSTRA  | CICLOS | TOP2 (2/2) | TOP3 (3/3) | TOP4 (4/4) | TOP5 (>=80%) | TOP6 (>=80%)",
  );
  out("------------------------------------------------------------------------------------------");

  for (const res of allResults) {
    const s2 = res.modelStats["TOP-2"];
    const s3 = res.modelStats["TOP-3"];
    const s4 = res.modelStats["TOP-4"];
    const s5 = res.modelStats["TOP-5"];
    const s6 = res.modelStats["TOP-6"];

    const fmtRate = (s: typeof s2) =>
      s.predictionsCount > 0 ? `${s.winRate.toFixed(1)}% (${s.predictionsCount})` : "N/D (0)";

    out(
      `${res.analysisCode.padEnd(7)} | ${res.sampleSize.padEnd(8)} | ${String(res.totalCyclesAvailable).padStart(6)} | ${fmtRate(s2).padStart(10)} | ${fmtRate(s3).padStart(10)} | ${fmtRate(s4).padStart(10)} | ${fmtRate(s5).padStart(12)} | ${fmtRate(s6).padStart(12)}`,
    );
  }

  // ==========================================================================================
  // 6. TESTE TOP-3-CONSISTÊNCIA
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out("6. TESTE TOP-3-CONSISTÊNCIA (ANÁLISE | TOP3 | 3/3 | 2/3 | TOP3+EXATO)");
  out("==========================================================================================");
  out("ANÁLISE | AMOSTRA  | TOP-3 PADRÃO | 3/3 CONSIST. | 2/3 CONSIST. | TOP-3 + EXATO PREF");
  out("------------------------------------------------------------------------------------------");

  for (const res of allResults) {
    const sTop3 = res.modelStats["TOP-3"];
    const s33 = res.modelStats["TOP-3 Consistência 3/3"];
    const s23 = res.modelStats["TOP-3 Consistência 2/3"];
    const sExact = res.modelStats["TOP-3 Preferência Exata"];

    const fmt = (s: typeof sTop3) =>
      s.predictionsCount > 0 ? `${s.winRate.toFixed(1)}% (${s.predictionsCount})` : "N/D (0)";

    out(
      `${res.analysisCode.padEnd(7)} | ${res.sampleSize.padEnd(8)} | ${fmt(sTop3).padStart(13)} | ${fmt(s33).padStart(12)} | ${fmt(s23).padStart(12)} | ${fmt(sExact).padStart(18)}`,
    );
  }

  // ==========================================================================================
  // 7. ROBUSTEZ TEMPORAL (BLOCO 1 A 5 + MÉDIA)
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out(
    "7. ROBUSTEZ TEMPORAL POR BLOCOS CRONOLÓGICOS (B1: 0-20%, B2: 20-40%, B3: 40-60%, B4: 60-80%, B5: 80-100%)",
  );
  out("==========================================================================================");
  out(
    "MODELO                  | B1 (0-20%) | B2 (20-40%) | B3 (40-60%) | B4 (60-80%) | B5 (80-100%) | MÉDIA",
  );
  out("------------------------------------------------------------------------------------------");

  const globalSummaryData = buildLab2GlobalSummary(allResults);

  const modelOrder: BacktestModelName[] = [
    "TOP-2",
    "TOP-3",
    "TOP-4",
    "TOP-5",
    "TOP-6",
    "TOP-3 Consistência 3/3",
    "TOP-3 Consistência 2/3",
    "TOP-3 Preferência Exata",
    "Tendência Benchmark",
  ];

  for (const m of modelOrder) {
    const stab = globalSummaryData.overallStability[m];
    const bStr = stab.blocks.map((b) => (b.winRate > 0 ? `${b.winRate.toFixed(1)}%` : "0.0%"));
    while (bStr.length < 5) bStr.push("-");

    out(
      `${m.padEnd(23)} | ${bStr[0].padStart(10)} | ${bStr[1].padStart(11)} | ${bStr[2].padStart(11)} | ${bStr[3].padStart(11)} | ${bStr[4].padStart(12)} | ${(stab.meanWinRate.toFixed(2) + "%").padStart(6)}`,
    );
  }

  // ==========================================================================================
  // 8. ESTABILIDADE (MÉDIA, MÍNIMA, MÁXIMA, AMPLITUDE, DESVIO PADRÃO)
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out("8. ESTABILIDADE TEMPORAL ENTRE BLOCOS");
  out("==========================================================================================");
  out(
    "MODELO                  | MÉDIA ACERTO | MENOR TAXA (MIN) | MAIOR TAXA (MAX) | AMPLITUDE | DESVIO PADRÃO (σ)",
  );
  out("------------------------------------------------------------------------------------------");

  for (const m of modelOrder) {
    const stab = globalSummaryData.overallStability[m];
    out(
      `${m.padEnd(23)} | ${(stab.meanWinRate.toFixed(2) + "%").padStart(12)} | ${(stab.minWinRate.toFixed(2) + "%").padStart(16)} | ${(stab.maxWinRate.toFixed(2) + "%").padStart(16)} | ${(stab.amplitude.toFixed(2) + "%").padStart(9)} | ${stab.stdDev.toFixed(2).padStart(17)}`,
    );
  }

  // ==========================================================================================
  // 9. COBERTURA E RESULTADO CONSOLIDADO
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out("9. COBERTURA E CONSOLIDAÇÃO GERAL DOS MODELOS");
  out("==========================================================================================");
  out(
    "MODELO                  | PREVISÕES |   WIN   |  LOSS  | ACERTO (%) | EXATO (%) | COBERTURA (%)",
  );
  out("------------------------------------------------------------------------------------------");

  for (const sm of globalSummaryData.summary) {
    out(
      `${sm.model.padEnd(23)} | ${String(sm.totalPredictions).padStart(9)} | ${String(sm.totalWins).padStart(7)} | ${String(sm.totalLosses).padStart(6)} | ${(sm.winRate.toFixed(2) + "%").padStart(10)} | ${(sm.exactWinRate.toFixed(2) + "%").padStart(9)} | ${(sm.coverageRate.toFixed(2) + "%").padStart(13)}`,
    );
  }

  // ==========================================================================================
  // 10. ANÁLISES COM POUCOS CICLOS (CLASSIFICAÇÃO AMOSTRAL)
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out("10. AMOSTRAGEM ESTRATIFICADA POR ANÁLISE");
  out("==========================================================================================");
  out("ANÁLISE | CLASSE AMOSTRAL | TOTAL CICLOS | PREVISÕES TOP-3 | PREVISÕES TENDÊNCIA");
  out("------------------------------------------------------------------------------------------");

  for (const res of allResults) {
    const pTop3 = res.modelStats["TOP-3"].predictionsCount;
    const pTend = res.modelStats["Tendência Benchmark"].predictionsCount;
    out(
      `${res.analysisCode.padEnd(7)} | ${res.sampleSize.padEnd(15)} | ${String(res.totalCyclesAvailable).padStart(12)} | ${String(pTop3).padStart(15)} | ${String(pTend).padStart(19)}`,
    );
  }

  // ==========================================================================================
  // 11 & 12. COMPARAÇÃO E INTERSEÇÃO COM TENDÊNCIA BENCHMARK
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out("11 & 12. TESTE DE INTERSEÇÃO: TOP-3 vs TENDÊNCIA BENCHMARK");
  out("==========================================================================================");
  out(
    "ANÁLISE | COMUNS | EXCLUS. TOP-3 | EXCLUS. TEND | WIN COMUNS | WIN EXCL. TOP | WIN EXCL. TEND",
  );
  out("------------------------------------------------------------------------------------------");

  let totalCommon = 0;
  let totalCommonWins = 0;
  let totalExclTop = 0;
  let totalExclTopWins = 0;
  let totalExclTend = 0;
  let totalExclTendWins = 0;

  for (const res of allResults) {
    const inter = res.intersection;
    totalCommon += inter.commonCount;
    totalCommonWins += inter.commonWinCount;
    totalExclTop += inter.exclusiveTopCount;
    totalExclTopWins += inter.exclusiveTopWinRate
      ? Math.round((inter.exclusiveTopCount * inter.exclusiveTopWinRate) / 100)
      : 0;
    totalExclTend += inter.exclusiveTendenciaCount;
    totalExclTendWins += inter.exclusiveTendenciaWinRate
      ? Math.round((inter.exclusiveTendenciaCount * inter.exclusiveTendenciaWinRate) / 100)
      : 0;

    out(
      `${res.analysisCode.padEnd(7)} | ${String(inter.commonCount).padStart(6)} | ${String(inter.exclusiveTopCount).padStart(13)} | ${String(inter.exclusiveTendenciaCount).padStart(12)} | ${(inter.commonWinRate.toFixed(1) + "%").padStart(10)} | ${(inter.exclusiveTopWinRate.toFixed(1) + "%").padStart(13)} | ${(inter.exclusiveTendenciaWinRate.toFixed(1) + "%").padStart(14)}`,
    );
  }

  const globalCommonRate =
    totalCommon > 0 ? ((totalCommonWins / totalCommon) * 100).toFixed(2) : "0.00";
  const globalExclTopRate =
    totalExclTop > 0 ? ((totalExclTopWins / totalExclTop) * 100).toFixed(2) : "0.00";
  const globalExclTendRate =
    totalExclTend > 0 ? ((totalExclTendWins / totalExclTend) * 100).toFixed(2) : "0.00";

  out("------------------------------------------------------------------------------------------");
  out(
    `TOTAL   | ${String(totalCommon).padStart(6)} | ${String(totalExclTop).padStart(13)} | ${String(totalExclTend).padStart(12)} | ${(globalCommonRate + "%").padStart(10)} | ${(globalExclTopRate + "%").padStart(13)} | ${(globalExclTendRate + "%").padStart(14)}`,
  );

  // ==========================================================================================
  // 13. TESTE DE CONFLUÊNCIA TEMPORAL
  // ==========================================================================================
  out(
    "\n==========================================================================================",
  );
  out("13. TESTE DE CONFLUÊNCIA TEMPORAL (MULTIFONTES)");
  out("==========================================================================================");
  const conf = globalSummaryData.confluence;
  out(
    `- Previsões com Confluência Exata (mesmo minuto): ${conf.exactConfluenceCount} | Win Rate: ${conf.exactConfluenceWinRate}%`,
  );
  out(
    `- Previsões com Confluência em Vizinhança (±1 min): ${conf.toleranceConfluenceCount} | Win Rate: ${conf.toleranceConfluenceWinRate}%`,
  );
  out(
    `- Previsões Isoladas (sem confluência concomitante): ${conf.noConfluenceCount} | Win Rate: ${conf.noConfluenceWinRate}%`,
  );

  out(
    "\n==========================================================================================",
  );
  out("🧪 SEGUNDO LABORATÓRIO CONCLUÍDO COM SUCESSO.");
  out(
    "==========================================================================================\n",
  );

  fs.writeFileSync("data/lab2_report.txt", outputLines.join("\n"), "utf-8");
  console.log("Relatório completo salvo em data/lab2_report.txt com sucesso!");
}

main().catch((err) => {
  console.error("Erro na execução do segundo laboratório:", err);
  process.exit(1);
});
