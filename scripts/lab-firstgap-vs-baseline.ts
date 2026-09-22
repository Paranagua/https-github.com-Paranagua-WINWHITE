/**
 * LABORATÓRIO COMPARATIVO: FIRST GAP vs BASELINES ALEATÓRIOS E DISTRIBUCIONAIS
 * 
 * Objetivo:
 * Testar rigorosamente se o FIRST GAP possui ganho preditivo real de curto prazo (memória de regime)
 * ou se seu desempenho é apenas decorrência da distribuição natural dos dados.
 * 
 * Baselines testados contra FIRST GAP:
 * 1. RANDOM_UNIFORM_1_15: Escolha aleatória uniforme entre 1 e 15 minutos.
 * 2. RANDOM_UNIFORM_1_30: Escolha aleatória uniforme entre 1 e 30 minutos.
 * 3. GLOBAL_EMPIRICAL_SAMPLING: Sorteio ponderado pela distribuição empírica acumulada dos first gaps.
 * 4. GLOBAL_MODE: Chute fixo no minuto mais frequente de todo o histórico (Moda Global).
 * 5. GLOBAL_MEDIAN: Chute fixo na mediana histórica dos first gaps.
 * 6. GLOBAL_TOP3_FIXED: Sempre os 3 minutos historicamente mais frequentes (Top 3 Global Estático).
 * 7. CUMULATIVE_ANALYSIS_MODE: Moda histórica cumulativa da análise específica (sempre expandindo sem lookahead).
 * 8. FIRST_GAP_W3: Modelo dinâmico local de 3 ciclos.
 * 9. FIRST_GAP_W5: Modelo dinâmico local de 5 ciclos.
 * 10. FIRST_GAP_W10: Modelo dinâmico local de 10 ciclos.
 * 11. FIRST_GAP_TOP3_W5: Top 3 dinâmico dos últimos 5 ciclos.
 */

import * as fs from "fs";
import {
  fetchAnalysisCycles,
  computeTopFirstGapOnly,
  OnlineTracker,
  type CleanCycle,
} from "./lab-first-gap-comparative";
import { MAIN_ANALYSIS_IDS } from "../src/lib/incrementalPredictiveEngine";

interface BaselineMetricResult {
  name: string;
  category: "RANDOM" | "DISTRIBUTIONAL_GLOBAL" | "ANALYSIS_HISTORIC" | "FIRST_GAP_DYNAMIC";
  samples: number;
  exactRate: number;
  vicinity1Rate: number;
  vicinity2Rate: number;
  mae: number;
  medianAe: number;
}

async function runBaselineLab() {
  console.log("=== INICIANDO LABORATÓRIO: FIRST GAP vs BASELINES ALEATÓRIOS/DISTRIBUCIONAIS ===");
  console.log("Nenhum código de produção será alterado.");

  const analysisList = MAIN_ANALYSIS_IDS;
  console.log(`Carregando dados para ${analysisList.length} análises...`);

  const allCyclesByAnalysis = new Map<number, CleanCycle[]>();
  let totalLoadedCycles = 0;

  const BATCH_SIZE = 12;
  for (let i = 0; i < analysisList.length; i += BATCH_SIZE) {
    const batch = analysisList.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (id) => {
      const cycles = await fetchAnalysisCycles(id, 10000);
      return { id, cycles };
    });
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.cycles.length > 0) {
        allCyclesByAnalysis.set(r.id, r.cycles);
        totalLoadedCycles += r.cycles.length;
      }
    }
  }

  console.log(`Carregamento concluído! Análises: ${allCyclesByAnalysis.size} | Ciclos válidos: ${totalLoadedCycles}`);

  // 1. Levantamento das estatísticas da distribuição de First Gap (Global)
  const globalFreq = new Map<number, number>();
  let totalGlobalFirstGaps = 0;
  const allFirstGapsList: number[] = [];

  for (const cycles of allCyclesByAnalysis.values()) {
    for (const c of cycles) {
      const fg = c.firstWhiteGap;
      if (fg > 0) {
        globalFreq.set(fg, (globalFreq.get(fg) || 0) + 1);
        totalGlobalFirstGaps++;
        allFirstGapsList.push(fg);
      }
    }
  }

  allFirstGapsList.sort((a, b) => a - b);
  const globalMedian = allFirstGapsList[Math.floor(allFirstGapsList.length / 2)];
  
  // Ordena por frequência decrescente para obter a Moda e o Top 3 Global
  const sortedByFreq = Array.from(globalFreq.entries()).sort((a, b) => b[1] - a[1]);
  const globalMode = sortedByFreq[0][0];
  const globalTop3 = sortedByFreq.slice(0, 3).map(e => e[0]);

  console.log(`\n--- ESTATÍSTICAS GLOBAIS DE REFERÊNCIA ---`);
  console.log(`Total de First Gaps analisados: ${totalGlobalFirstGaps}`);
  console.log(`Moda Global (Minuto mais frequente): ${globalMode} min (Ocorrências: ${sortedByFreq[0][1]} - ${((sortedByFreq[0][1] / totalGlobalFirstGaps) * 100).toFixed(2)}%)`);
  console.log(`Top 3 Minutos Globais mais frequentes: ${globalTop3.join(", ")} min`);
  console.log(`Top 5 frequências: ${sortedByFreq.slice(0, 5).map(e => `${e[0]}m (${((e[1]/totalGlobalFirstGaps)*100).toFixed(2)}%)`).join(" | ")}`);
  console.log(`Mediana Global: ${globalMedian} min`);

  // Monta tabela cumulativa de probabilidades para Empirical Sampling
  const cdf: { minute: number; cumProb: number }[] = [];
  let acc = 0;
  for (const [minute, count] of sortedByFreq) {
    acc += count / totalGlobalFirstGaps;
    cdf.push({ minute, cumProb: acc });
  }

  function sampleFromEmpiricalCDF(): number {
    const r = Math.random();
    for (const item of cdf) {
      if (r <= item.cumProb) return item.minute;
    }
    return globalMode;
  }

  // 2. CONFIGURAÇÃO DOS TRACKERS
  const trackerMap: Record<string, { category: BaselineMetricResult["category"]; tracker: OnlineTracker }> = {
    // ALEATÓRIOS
    "RANDOM_UNIFORM_1_15": { category: "RANDOM", tracker: new OnlineTracker() },
    "RANDOM_UNIFORM_1_30": { category: "RANDOM", tracker: new OnlineTracker() },
    
    // DISTRIBUCIONAIS GLOBAIS
    "GLOBAL_EMPIRICAL_SAMPLING": { category: "DISTRIBUTIONAL_GLOBAL", tracker: new OnlineTracker() },
    "GLOBAL_MODE_STATIC": { category: "DISTRIBUTIONAL_GLOBAL", tracker: new OnlineTracker() },
    "GLOBAL_MEDIAN_STATIC": { category: "DISTRIBUTIONAL_GLOBAL", tracker: new OnlineTracker() },
    "GLOBAL_TOP3_STATIC": { category: "DISTRIBUTIONAL_GLOBAL", tracker: new OnlineTracker() },

    // HISTÓRICO CUMULATIVO POR ANÁLISE (Sem janela móvel curta, apenas a moda acumulada daquela análise até então)
    "CUMULATIVE_ANALYSIS_MODE": { category: "ANALYSIS_HISTORIC", tracker: new OnlineTracker() },

    // DINÂMICOS LOCAL FIRST GAP (Walk-Forward W ciclos)
    "FIRST_GAP_W3": { category: "FIRST_GAP_DYNAMIC", tracker: new OnlineTracker() },
    "FIRST_GAP_W5": { category: "FIRST_GAP_DYNAMIC", tracker: new OnlineTracker() },
    "FIRST_GAP_W10": { category: "FIRST_GAP_DYNAMIC", tracker: new OnlineTracker() },
    "FIRST_GAP_TOP3_W5": { category: "FIRST_GAP_DYNAMIC", tracker: new OnlineTracker() },
  };

  console.log(`\n--- EXECUTANDO WALK-FORWARD COMPARATIVO EM TODOS OS CICLOS ---`);

  const EVAL_WINDOW = 5; // Avalia a partir do 5º ciclo

  for (const [analysisId, cycles] of allCyclesByAnalysis.entries()) {
    if (cycles.length <= EVAL_WINDOW) continue;

    // Para CUMULATIVE_ANALYSIS_MODE: mantém a contagem histórica cumulativa da análise
    const analysisFreq = new Map<number, number>();
    for (let i = 0; i < EVAL_WINDOW; i++) {
      const fg = cycles[i].firstWhiteGap;
      analysisFreq.set(fg, (analysisFreq.get(fg) || 0) + 1);
    }

    for (let i = EVAL_WINDOW; i < cycles.length; i++) {
      const target = cycles[i].firstWhiteGap;

      // 1. RANDOM 1-15
      const rnd1_15 = Math.floor(Math.random() * 15) + 1;
      trackerMap["RANDOM_UNIFORM_1_15"].tracker.add(rnd1_15, target);

      // 2. RANDOM 1-30
      const rnd1_30 = Math.floor(Math.random() * 30) + 1;
      trackerMap["RANDOM_UNIFORM_1_30"].tracker.add(rnd1_30, target);

      // 3. GLOBAL EMPIRICAL SAMPLING
      const sampleEmp = sampleFromEmpiricalCDF();
      trackerMap["GLOBAL_EMPIRICAL_SAMPLING"].tracker.add(sampleEmp, target);

      // 4. GLOBAL MODE STATIC
      trackerMap["GLOBAL_MODE_STATIC"].tracker.add(globalMode, target);

      // 5. GLOBAL MEDIAN STATIC
      trackerMap["GLOBAL_MEDIAN_STATIC"].tracker.add(globalMedian, target);

      // 6. GLOBAL TOP 3 STATIC (pega o mais próximo entre os 3 minutos mais frequentes globais)
      const closestGlobalTop3 = globalTop3.reduce((closest, curr) =>
        Math.abs(curr - target) < Math.abs(closest - target) ? curr : closest
      );
      trackerMap["GLOBAL_TOP3_STATIC"].tracker.add(closestGlobalTop3, target);

      // 7. CUMULATIVE ANALYSIS MODE (Moda observada até i-1 na análise, estritamente causal)
      let currentAnalysisMode = globalMode;
      let maxCnt = 0;
      for (const [minVal, cnt] of analysisFreq.entries()) {
        if (cnt > maxCnt) {
          maxCnt = cnt;
          currentAnalysisMode = minVal;
        }
      }
      trackerMap["CUMULATIVE_ANALYSIS_MODE"].tracker.add(currentAnalysisMode, target);

      // Atualiza cumulativo para próximo passo
      analysisFreq.set(target, (analysisFreq.get(target) || 0) + 1);

      // 8. FIRST_GAP_W3 (janela dos últimos 3 ciclos)
      const win3 = cycles.slice(i - 3, i);
      const fgW3 = computeTopFirstGapOnly(win3, 1);
      if (fgW3.length > 0) trackerMap["FIRST_GAP_W3"].tracker.add(fgW3[0].m, target);

      // 9. FIRST_GAP_W5 (janela dos últimos 5 ciclos)
      const win5 = cycles.slice(i - 5, i);
      const fgW5 = computeTopFirstGapOnly(win5, 1);
      if (fgW5.length > 0) trackerMap["FIRST_GAP_W5"].tracker.add(fgW5[0].m, target);

      // 10. FIRST_GAP_W10 (janela dos últimos 10 ciclos se disponível, senão slice do que houver)
      const win10 = cycles.slice(Math.max(0, i - 10), i);
      const fgW10 = computeTopFirstGapOnly(win10, 1);
      if (fgW10.length > 0) trackerMap["FIRST_GAP_W10"].tracker.add(fgW10[0].m, target);

      // 11. FIRST_GAP_TOP3_W5 (Top 3 dinâmico local dos últimos 5 ciclos)
      const fgTop3 = computeTopFirstGapOnly(win5, 3);
      if (fgTop3.length > 0) {
        const best3 = fgTop3.slice(0, 3).map(p => p.m);
        const chosen = best3.reduce((closest, curr) =>
          Math.abs(curr - target) < Math.abs(closest - target) ? curr : closest
        );
        trackerMap["FIRST_GAP_TOP3_W5"].tracker.add(chosen, target);
      }
    }
  }

  // 3. COMPILAÇÃO E EXIBIÇÃO DOS RESULTADOS
  const finalResults: BaselineMetricResult[] = [];
  console.log("\n=========================================================================================================");
  console.log("MODELO                          | CATEGORIA             | EXATO  | VIZ. ±1 | VIZ. ±2 | MAE (Méd) | MEDIANA");
  console.log("=========================================================================================================");

  for (const [name, entry] of Object.entries(trackerMap)) {
    const met = entry.tracker.getMetrics();
    finalResults.push({
      name,
      category: entry.category,
      samples: met.totalPredictions,
      exactRate: met.exactRate,
      vicinity1Rate: met.vicinity1Rate,
      vicinity2Rate: met.vicinity2Rate,
      mae: met.mae,
      medianAe: met.medianAe,
    });

    const namePadded = name.padEnd(31);
    const catPadded = entry.category.padEnd(21);
    const exPadded = `${met.exactRate.toFixed(2)}%`.padStart(6);
    const v1Padded = `${met.vicinity1Rate.toFixed(2)}%`.padStart(7);
    const v2Padded = `${met.vicinity2Rate.toFixed(2)}%`.padStart(7);
    const maePadded = `${met.mae.toFixed(2)} min`.padStart(9);
    const medPadded = `${met.medianAe} min`.padStart(7);

    console.log(`${namePadded} | ${catPadded} | ${exPadded} | ${v1Padded} | ${v2Padded} | ${maePadded} | ${medPadded}`);
  }
  console.log("=========================================================================================================");

  // Salva os resultados no arquivo JSON do laboratório
  fs.writeFileSync(
    "scripts/lab_baseline_results.json",
    JSON.stringify(
      {
        totalGlobalFirstGaps,
        globalMode,
        globalMedian,
        globalTop3,
        finalResults,
      },
      null,
      2
    )
  );

  console.log("\nResultados salvos em scripts/lab_baseline_results.json");
  console.log("=== LABORATÓRIO CONCLUÍDO COM SUCESSO! ===");
}

runBaselineLab().catch((err) => {
  console.error("Erro no laboratório:", err);
});
