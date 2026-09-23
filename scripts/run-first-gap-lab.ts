/**
 * LABORATÓRIO COMPARATIVO FIRST GAP — EXECUÇÃO RÁPIDA E INCREMENTAL
 * Salva a cada janela em disco para garantir integridade.
 */

import * as fs from "fs";
import {
  fetchAnalysisCycles,
  computeTopCurrentGaps,
  computeTopFirstGapOnly,
  computeTopHybrid,
  OnlineTracker,
  getMinuteBucket,
  type CleanCycle,
} from "./lab-first-gap-comparative";
import { MAIN_ANALYSIS_IDS } from "../src/lib/incrementalPredictiveEngine";

const RESULT_FILE = "scripts/lab_results.json";

async function runLab() {
  console.log("=== INICIANDO LABORATÓRIO COMPARATIVO FIRST GAP (INCREMENTAL) ===");
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

  console.log(
    `Carregamento concluído! Análises: ${allCyclesByAnalysis.size} | Ciclos válidos: ${totalLoadedCycles}`,
  );

  // 1. DISTRIBUIÇÃO GLOBAL
  const minuteDistribution: Record<string, number> = {
    "1-5": 0,
    "6-10": 0,
    "11-15": 0,
    "16-20": 0,
    "21-30": 0,
    "31-60": 0,
    "61-120": 0,
  };
  for (const cycles of allCyclesByAnalysis.values()) {
    for (const c of cycles) {
      const b = getMinuteBucket(c.firstWhiteGap);
      if (minuteDistribution[b] !== undefined) minuteDistribution[b]++;
    }
  }

  // 2. CAPACIDADE PREDITIVA POR POSIÇÃO (k -> k)
  console.log("\n--- CAPACIDADE PREDITIVA POR POSIÇÃO (k -> k) ---");
  const positionStats: { pos: number; count: number; exact: number; vic1: number; mae: number }[] =
    [];
  for (let k = 1; k <= 14; k++) {
    let count = 0;
    let exact = 0;
    let vic1 = 0;
    let sumAe = 0;

    for (const cycles of allCyclesByAnalysis.values()) {
      for (let i = 1; i < cycles.length; i++) {
        const prevVal = cycles[i - 1].gaps[k - 1];
        const currVal = cycles[i].gaps[k - 1];
        if (prevVal !== undefined && currVal !== undefined && prevVal > 0 && currVal > 0) {
          count++;
          const diff = Math.abs(prevVal - currVal);
          sumAe += diff;
          if (diff === 0) exact++;
          if (diff <= 1) vic1++;
        }
      }
    }

    if (count > 0) {
      const exPct = (exact / count) * 100;
      const v1Pct = (vic1 / count) * 100;
      const mae = sumAe / count;
      positionStats.push({ pos: k, count, exact: exPct, vic1: v1Pct, mae });
      console.log(
        `Posição ${k.toString().padStart(2)}: Amostras=${count.toString().padStart(6)} | Exato=${exPct.toFixed(2).padStart(5)}% | ±1=${v1Pct.toFixed(2).padStart(5)}% | MAE=${mae.toFixed(2).padStart(5)} min`,
      );
    }
  }

  // 3. MODELOS PRINCIPAIS
  const MODELS = [
    { name: "CURRENT_GAPS", fn: (w: CleanCycle[]) => computeTopCurrentGaps(w, 1) },
    { name: "FIRST_GAP_ONLY", fn: (w: CleanCycle[]) => computeTopFirstGapOnly(w, 1) },
    { name: "HYBRID_90_10", fn: (w: CleanCycle[]) => computeTopHybrid(w, 90, 10, 1) },
    { name: "HYBRID_80_20", fn: (w: CleanCycle[]) => computeTopHybrid(w, 80, 20, 1) },
    { name: "HYBRID_70_30", fn: (w: CleanCycle[]) => computeTopHybrid(w, 70, 30, 1) },
    { name: "HYBRID_50_50", fn: (w: CleanCycle[]) => computeTopHybrid(w, 50, 50, 1) },
  ];

  const modelResultsTable: any[] = [];

  // Avalia W=3, W=5, W=10
  for (const W of [3, 5, 10]) {
    console.log(`\nProcessando Janela W = ${W} ciclos...`);
    const trackers: Record<string, OnlineTracker> = {};
    for (const m of MODELS) {
      trackers[m.name] = new OnlineTracker();
    }
    const fgTop2Tracker = new OnlineTracker();
    const fgTop3Tracker = new OnlineTracker();

    for (const cycles of allCyclesByAnalysis.values()) {
      if (cycles.length <= W) continue;

      for (let i = W; i < cycles.length; i++) {
        const windowCycles = cycles.slice(i - W, i);
        const target = cycles[i].firstWhiteGap;

        // Modelos
        for (const m of MODELS) {
          const t = trackers[m.name];
          t.totalEvaluated++;
          const res = m.fn(windowCycles);
          if (res.length > 0) t.add(res[0].m, target);
        }

        // Top 2 e Top 3 de FIRST_GAP_ONLY
        const fgMulti = computeTopFirstGapOnly(windowCycles, 3);
        fgTop2Tracker.totalEvaluated++;
        fgTop3Tracker.totalEvaluated++;
        if (fgMulti.length > 0) {
          const best2 = fgMulti.slice(0, 2).map((p) => p.m);
          const chosen2 = best2.reduce((closest, curr) =>
            Math.abs(curr - target) < Math.abs(closest - target) ? curr : closest,
          );
          fgTop2Tracker.add(chosen2, target);

          const best3 = fgMulti.slice(0, 3).map((p) => p.m);
          const chosen3 = best3.reduce((closest, curr) =>
            Math.abs(curr - target) < Math.abs(closest - target) ? curr : closest,
          );
          fgTop3Tracker.add(chosen3, target);
        }
      }
    }

    for (const [name, t] of Object.entries(trackers)) {
      const met = t.getMetrics();
      modelResultsTable.push({ model: name, window: W, ...met });
      console.log(
        `${name.padEnd(16)} | W=${W} | N=${met.totalPredictions} | Exato=${met.exactRate.toFixed(2)}% | ±1=${met.vicinity1Rate.toFixed(2)}% | ±2=${met.vicinity2Rate.toFixed(2)}% | MAE=${met.mae.toFixed(2)}m | Med=${met.medianAe}m`,
      );
    }

    const m2 = fgTop2Tracker.getMetrics();
    modelResultsTable.push({ model: "FIRST_GAP_TOP2", window: W, ...m2 });
    console.log(
      `FIRST_GAP_TOP2   | W=${W} | N=${m2.totalPredictions} | Exato=${m2.exactRate.toFixed(2)}% | ±1=${m2.vicinity1Rate.toFixed(2)}% | ±2=${m2.vicinity2Rate.toFixed(2)}% | MAE=${m2.mae.toFixed(2)}m | Med=${m2.medianAe}m`,
    );

    const m3 = fgTop3Tracker.getMetrics();
    modelResultsTable.push({ model: "FIRST_GAP_TOP3", window: W, ...m3 });
    console.log(
      `FIRST_GAP_TOP3   | W=${W} | N=${m3.totalPredictions} | Exato=${m3.exactRate.toFixed(2)}% | ±1=${m3.vicinity1Rate.toFixed(2)}% | ±2=${m3.vicinity2Rate.toFixed(2)}% | MAE=${m3.mae.toFixed(2)}m | Med=${m3.medianAe}m`,
    );

    // Salva progresso incremental
    fs.writeFileSync(
      RESULT_FILE,
      JSON.stringify(
        {
          totalLoadedCycles,
          totalAnalyses: allCyclesByAnalysis.size,
          minuteDistribution,
          positionStats,
          modelResultsTable,
        },
        null,
        2,
      ),
    );
  }

  // 4. ROBUSTEZ TEMPORAL (5 BLOCOS)
  console.log("\n--- ROBUSTEZ TEMPORAL (5 BLOCOS CRONOLÓGICOS B1..B5) W=3 ---");
  const temporalResults: any[] = [];
  for (const mName of ["CURRENT_GAPS", "FIRST_GAP_ONLY", "HYBRID_80_20"]) {
    const blockRates: number[] = [];
    const blockMaes: number[] = [];

    for (let b = 0; b < 5; b++) {
      const tracker = new OnlineTracker();
      for (const cycles of allCyclesByAnalysis.values()) {
        if (cycles.length <= 3) continue;
        const totalP = cycles.length - 3;
        const bSize = Math.floor(totalP / 5);
        if (bSize <= 0) continue;
        const start = 3 + b * bSize;
        const end = b === 4 ? cycles.length : 3 + (b + 1) * bSize;

        for (let i = start; i < end; i++) {
          const win = cycles.slice(i - 3, i);
          const tgt = cycles[i].firstWhiteGap;
          tracker.totalEvaluated++;
          let pred: number | null = null;
          if (mName === "CURRENT_GAPS") {
            const r = computeTopCurrentGaps(win, 1);
            if (r.length > 0) pred = r[0].m;
          } else if (mName === "FIRST_GAP_ONLY") {
            const r = computeTopFirstGapOnly(win, 1);
            if (r.length > 0) pred = r[0].m;
          } else if (mName === "HYBRID_80_20") {
            const r = computeTopHybrid(win, 80, 20, 1);
            if (r.length > 0) pred = r[0].m;
          }
          if (pred !== null) tracker.add(pred, tgt);
        }
      }
      const bm = tracker.getMetrics();
      blockRates.push(bm.vicinity1Rate);
      blockMaes.push(bm.mae);
    }
    const mean = blockRates.reduce((a, b) => a + b, 0) / 5;
    const std = Math.sqrt(blockRates.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / 5);
    const amp = Math.max(...blockRates) - Math.min(...blockRates);
    temporalResults.push({ model: mName, blockRates, mean, std, amp });
    console.log(
      `${mName.padEnd(16)} | ${blockRates.map((r, i) => `B${i + 1}:${r.toFixed(1)}%`).join(" | ")} | Média=${mean.toFixed(1)}% | DP=±${std.toFixed(2)}% | Amp=${amp.toFixed(1)}%`,
    );
  }

  // 5. DISTRIBUIÇÃO PREVISTOS VS REAIS
  console.log("\n--- DISTRIBUIÇÃO DOS MINUTOS PREVISTOS VS REAIS (W = 3) ---");
  const distTargets: Record<string, number> = {
    "1-5": 0,
    "6-10": 0,
    "11-15": 0,
    "16-20": 0,
    "21-30": 0,
    "31-60": 0,
    "61-120": 0,
  };
  const distCurrent: Record<string, number> = {
    "1-5": 0,
    "6-10": 0,
    "11-15": 0,
    "16-20": 0,
    "21-30": 0,
    "31-60": 0,
    "61-120": 0,
  };
  const distFirstGap: Record<string, number> = {
    "1-5": 0,
    "6-10": 0,
    "11-15": 0,
    "16-20": 0,
    "21-30": 0,
    "31-60": 0,
    "61-120": 0,
  };

  for (const cycles of allCyclesByAnalysis.values()) {
    if (cycles.length <= 3) continue;
    for (let i = 3; i < cycles.length; i++) {
      const target = cycles[i].firstWhiteGap;
      distTargets[getMinuteBucket(target)]++;
      const c1 = computeTopCurrentGaps(cycles.slice(i - 3, i), 1);
      if (c1.length > 0) distCurrent[getMinuteBucket(c1[0].m)]++;
      const c2 = computeTopFirstGapOnly(cycles.slice(i - 3, i), 1);
      if (c2.length > 0) distFirstGap[getMinuteBucket(c2[0].m)]++;
    }
  }

  console.log("FAIXA   | ALVO REAL (%)   | CURRENT_GAPS (%) | FIRST_GAP_ONLY (%)");
  const totalEval = Object.values(distTargets).reduce((a, b) => a + b, 0);
  for (const b of Object.keys(distTargets)) {
    const tPct = ((distTargets[b] / totalEval) * 100).toFixed(2);
    const cPct = ((distCurrent[b] / totalEval) * 100).toFixed(2);
    const fPct = ((distFirstGap[b] / totalEval) * 100).toFixed(2);
    console.log(
      `${b.padEnd(7)} | ${distTargets[b].toString().padStart(6)} (${tPct.padStart(5)}%) | ${distCurrent[b].toString().padStart(6)} (${cPct.padStart(5)}%) | ${distFirstGap[b].toString().padStart(6)} (${fPct.padStart(5)}%)`,
    );
  }

  // Salva resultado final completo
  fs.writeFileSync(
    RESULT_FILE,
    JSON.stringify(
      {
        totalLoadedCycles,
        totalAnalyses: allCyclesByAnalysis.size,
        minuteDistribution,
        positionStats,
        modelResultsTable,
        temporalResults,
        distributionComparison: {
          totalEval,
          targets: distTargets,
          currentGaps: distCurrent,
          firstGapOnly: distFirstGap,
        },
      },
      null,
      2,
    ),
  );

  console.log("\n=== LABORATÓRIO CONCLUÍDO COM SUCESSO! ===");
}

runLab().catch((err) => {
  console.error("Erro no laboratório:", err);
});
