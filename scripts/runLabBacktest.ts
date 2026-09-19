/**
 * Script de execução do Laboratório de Comparação Estatística
 * Executa a comparação entre Top Atual, Top 3 Experimental e Tendência
 * Utilizando dados reais da tabela predictive_cycles sem Look-Ahead Bias.
 */

import { blazeSupabase } from "../src/integrations/supabase/blaze-client";
import type { CycleGapsRecord, ModelPerformanceStats } from "../src/lib/backtesting/backtestTypes";
import {
  runSingleAnalysisBacktest,
  buildGlobalSummary,
} from "../src/lib/backtesting/backtestRunner";

async function fetchCyclesForAnalysis(analysisId: number): Promise<CycleGapsRecord[]> {
  const records: CycleGapsRecord[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  const MAX_RECORDS = 5000;

  while (records.length < MAX_RECORDS) {
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
  console.log("==================================================================");
  console.log("🔬 LABORATÓRIO ESTATÍSTICO: TOP ATUAL vs TOP 3 vs TENDÊNCIA");
  console.log("==================================================================");
  console.log("Iniciando coleta e processamento de predictive_cycles do banco...\n");

  // Análises representativas de diferentes grupos (padrão, minutos, pedras, quebras)
  const targetAnalyses = [
    { id: 2, code: "A2", label: "A2 (Padrão)" },
    { id: 3, code: "A3", label: "A3 (Padrão)" },
    { id: 4, code: "A4", label: "A4 (Padrão)" },
    { id: 5, code: "A5", label: "A5 (Padrão)" },
    { id: 17, code: "A17", label: "A17 (Minutos - +1min)" },
    { id: 18, code: "A18", label: "A18 (Minutos - +1min)" },
    { id: 25, code: "A25", label: "A25 (Pedra Minuto)" },
    { id: 26, code: "A26", label: "A26 (Pedra Minuto)" },
    { id: 32, code: "A32", label: "A32 (Pedra Minuto 7)" },
    { id: 33, code: "A33", label: "A33 (Pedra Minuto 7)" },
    { id: 34, code: "A34", label: "A34 (Pedra Minuto 8)" },
    { id: 35, code: "A35", label: "A35 (Pedra Minuto 8)" },
    { id: 36, code: "A36", label: "A36 (Pedra Minuto 9)" },
    { id: 50, code: "Q1", label: "Q1 (Quebra Cores - A50)" },
    { id: 60, code: "Q26", label: "Q26 (Quebra Recuperação Giro 26 - A60)" },
  ];

  const allStats: ModelPerformanceStats[] = [];

  for (const target of targetAnalyses) {
    const rawCycles = await fetchCyclesForAnalysis(target.id);
    if (rawCycles.length === 0) {
      console.log(`[Aviso] Análise ${target.code}: nenhum ciclo concluído encontrado.`);
      continue;
    }

    console.log(
      `Carregados ${rawCycles.length} ciclos concluídos para ${target.code}. Executando simulação temporal...`,
    );
    const result = runSingleAnalysisBacktest(target.id, target.code, rawCycles);

    allStats.push(result.statsTopAtual);
    allStats.push(result.statsTop3);
    allStats.push(result.statsTendencia);
  }

  console.log("\n==================================================================");
  console.log("📊 TABELA PRINCIPAL DE COMPARAÇÃO");
  console.log("ANÁLISE | MODELO | CICLOS | PREVISÕES | WIN | LOSS | ACERTO | GAPS MAIS PREVISTOS");
  console.log("------------------------------------------------------------------");

  for (const st of allStats) {
    const topGaps =
      Object.entries(st.predictionsByGap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([gap, count]) => `G${gap}(${count})`)
        .join(", ") || "-";

    const modelName =
      st.model === "Top Atual"
        ? "Top Atual (5/3)"
        : st.model === "Top 3 Experimental"
          ? "Top 3 Exp"
          : "Tendência (3/3)";
    const cyclesCount = st.model === "Top Atual" ? (st.analysis >= 50 ? 3 : 5) : 3;

    console.log(
      `${st.analysisCode.padEnd(7)} | ${modelName.padEnd(16)} | ${String(cyclesCount).padEnd(6)} | ${String(st.predictionsCount).padStart(9)} | ${String(st.winCount).padStart(3)} | ${String(st.lossCount).padStart(4)} | ${(st.winRate.toFixed(1) + "%").padStart(6)} | ${topGaps}`,
    );
  }

  console.log("\n==================================================================");
  console.log("🏆 RESUMO GERAL DOS MODELOS");
  console.log("MODELO | PREVISÕES | WIN | LOSS | TAXA DE ACERTO | TAXA EXATA (SEM ±1) | COBERTURA");
  console.log("------------------------------------------------------------------");

  const summary = buildGlobalSummary(allStats);
  for (const sm of summary) {
    console.log(
      `${sm.model.padEnd(20)} | ${String(sm.totalPredictions).padStart(9)} | ${String(sm.totalWins).padStart(4)} | ${String(sm.totalLosses).padStart(4)} | ${(sm.winRate.toFixed(2) + "%").padStart(14)} | ${(sm.exactWinRate.toFixed(2) + "%").padStart(20)} | ${(sm.coverageRate.toFixed(2) + "%").padStart(9)}`,
    );
  }

  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error("Erro na execução do laboratório:", err);
  process.exit(1);
});
