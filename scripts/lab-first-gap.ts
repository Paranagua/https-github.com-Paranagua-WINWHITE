/**
 * LABORATÓRIO ESTATÍSTICO — FIRST GAP / PRÓXIMO ZERO
 *
 * Totalmente isolado. NÃO ALTERA CÓDIGO DE PRODUÇÃO.
 * Metodologia: Walk-Forward Estrito (No Future Data), dados 100% reais.
 *
 * Objetivo:
 * - Analisar a distribuição estatística do PRIMEIRO BRANCO (firstGap) após o gatilho.
 * - Comparar janelas de 3, 5, 10 e 20 ciclos.
 * - Testar categorias:
 *   1) Análises Padrão / Minuto: A1 - A49 (ex: A2, A3, A4, A5, A17, A18, A25, A27, etc.)
 *   2) Quebras de Cor: A50 - A56 (4x a 10x)
 *   3) Quebras de Recuperação: A60 - A114 (Q26 a Q80)
 * - Avaliar se o campo gaps[] atual mistura o primeiro zero com zeros subsequentes.
 */

import { blazeSupabase } from "../src/integrations/supabase/blaze-client";

interface RawCycle {
  id: string;
  cycle_key: string;
  analysis: number;
  analysis_code: string | null;
  value: number;
  trigger_at: string;
  gaps: number[];
  status: string;
  total_whites: number | null;
  first_white_gap: number | null;
}

interface FirstGapStats {
  analysis: number;
  code: string;
  group: string;
  totalCycles: number;
  validCycles: number;
  censoredCycles: number;
  firstGaps: number[];
  mean: number;
  median: number;
  stdDev: number;
  topGaps: Array<{ gap: number; count: number; pct: number }>;
  pDist: Record<number, number>; // P(firstGap = X)
  // Walk-forward accuracy/concentration metrics across windows
  windowMetrics: {
    w3: WindowEvaluation;
    w5: WindowEvaluation;
    w10: WindowEvaluation;
    w20: WindowEvaluation;
  };
}

interface WindowEvaluation {
  windowSize: number;
  evaluatedCycles: number;
  // Quantas vezes o firstGap real esteve no Top 1 da janela passada
  exactTop1Hits: number;
  exactTop1Rate: number;
  // Quantas vezes o firstGap real esteve na vizinhança +-1 do Top 1 da janela
  vicinityTop1Hits: number;
  vicinityTop1Rate: number;
  // Taxa média de concentração do Top 1 da janela (ex: 2/3 = 66.7%, 3/3 = 100%)
  avgTop1Concentration: number;
  // Quantas vezes a janela teve repetição pura (pelo menos 2 ciclos com o mesmo firstGap)
  repeatedGapRate: number;
  // Desvio médio absoluto entre o firstGap real e a mediana da janela
  maeMedian: number;
}

const MAX_CENSORED_MINUTES = 120; // Limite de censura (2 horas)

async function fetchCyclesForAnalysis(analysisId: number, maxRecords = 2000): Promise<RawCycle[]> {
  const records: RawCycle[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (records.length < maxRecords) {
    const { data, error } = await blazeSupabase
      .from("predictive_cycles")
      .select("id, cycle_key, analysis, analysis_code, value, trigger_at, gaps, status, total_whites, first_white_gap")
      .eq("analysis", analysisId)
      .order("trigger_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;

    for (const r of data) {
      if (!r.trigger_at) continue;
      records.push({
        id: r.id,
        cycle_key: r.cycle_key,
        analysis: r.analysis,
        analysis_code: r.analysis_code || `A${r.analysis}`,
        value: r.value,
        trigger_at: r.trigger_at,
        gaps: Array.isArray(r.gaps) ? r.gaps : [],
        status: r.status,
        total_whites: r.total_whites,
        first_white_gap: r.first_white_gap,
      });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return records;
}

function computeWindowMetrics(firstGaps: number[], windowSize: number): WindowEvaluation {
  if (firstGaps.length <= windowSize) {
    return {
      windowSize,
      evaluatedCycles: 0,
      exactTop1Hits: 0,
      exactTop1Rate: 0,
      vicinityTop1Hits: 0,
      vicinityTop1Rate: 0,
      avgTop1Concentration: 0,
      repeatedGapRate: 0,
      maeMedian: 0,
    };
  }

  let evaluated = 0;
  let exactHits = 0;
  let vicinityHits = 0;
  let totalTopConcentration = 0;
  let repeatedCount = 0;
  let totalAbsError = 0;

  for (let i = windowSize; i < firstGaps.length; i++) {
    const window = firstGaps.slice(i - windowSize, i);
    const target = firstGaps[i];

    // Contagem de frequência na janela passada
    const freqMap = new Map<number, number>();
    for (const g of window) {
      freqMap.set(g, (freqMap.get(g) || 0) + 1);
    }

    // Top 1 gap da janela
    let topGap = window[0];
    let topCount = 0;
    for (const [g, count] of freqMap.entries()) {
      if (count > topCount || (count === topCount && g < topGap)) {
        topGap = g;
        topCount = count;
      }
    }

    // Mediana da janela
    const sortedWindow = [...window].sort((a, b) => a - b);
    const median = sortedWindow[Math.floor(sortedWindow.length / 2)];

    evaluated++;
    totalTopConcentration += (topCount / windowSize) * 100;
    if (topCount >= 2) repeatedCount++;

    if (target === topGap) exactHits++;
    if (Math.abs(target - topGap) <= 1) vicinityHits++;
    totalAbsError += Math.abs(target - median);
  }

  return {
    windowSize,
    evaluatedCycles: evaluated,
    exactTop1Hits: exactHits,
    exactTop1Rate: evaluated > 0 ? (exactHits / evaluated) * 100 : 0,
    vicinityTop1Hits: vicinityHits,
    vicinityTop1Rate: evaluated > 0 ? (vicinityHits / evaluated) * 100 : 0,
    avgTop1Concentration: evaluated > 0 ? totalTopConcentration / evaluated : 0,
    repeatedGapRate: evaluated > 0 ? (repeatedCount / evaluated) * 100 : 0,
    maeMedian: evaluated > 0 ? totalAbsError / evaluated : 0,
  };
}

function analyzeCycles(cycles: RawCycle[], analysisId: number, code: string, group: string): FirstGapStats | null {
  if (cycles.length === 0) return null;

  // Extrai o FIRST GAP de cada ciclo:
  // 1. Ignora brancos do próprio gatilho (gaps <= 0)
  // 2. Primeiro branco posterior = gaps[0] (ou first_white_gap se > 0)
  // 3. Se não houver branco registrado ou status for 'fechado'/'timeout' sem brancos => censurado
  const firstGaps: number[] = [];
  let censored = 0;

  for (const c of cycles) {
    // Valida primeiro branco
    let fg: number | null = null;
    if (Array.isArray(c.gaps) && c.gaps.length > 0) {
      const positiveGaps = c.gaps.filter((g) => typeof g === "number" && !Number.isNaN(g) && g > 0);
      if (positiveGaps.length > 0) {
        fg = positiveGaps[0];
      }
    } else if (typeof c.first_white_gap === "number" && c.first_white_gap > 0) {
      fg = c.first_white_gap;
    }

    if (fg !== null && fg > 0 && fg <= MAX_CENSORED_MINUTES) {
      firstGaps.push(fg);
    } else {
      censored++;
    }
  }

  const valid = firstGaps.length;
  if (valid === 0) return null;

  // Média
  const sum = firstGaps.reduce((a, b) => a + b, 0);
  const mean = sum / valid;

  // Mediana
  const sorted = [...firstGaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Desvio Padrão
  const variance = firstGaps.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / valid;
  const stdDev = Math.sqrt(variance);

  // Frequência e Distribuição P(firstGap = X)
  const freqMap = new Map<number, number>();
  for (const g of firstGaps) {
    freqMap.set(g, (freqMap.get(g) || 0) + 1);
  }

  const pDist: Record<number, number> = {};
  const topGapsList: Array<{ gap: number; count: number; pct: number }> = [];
  for (const [gap, count] of freqMap.entries()) {
    const pct = (count / valid) * 100;
    pDist[gap] = pct;
    topGapsList.push({ gap, count, pct });
  }

  topGapsList.sort((a, b) => b.pct - a.pct || a.gap - b.gap);

  // Avaliação Walk-Forward das Janelas (3, 5, 10, 20)
  const w3 = computeWindowMetrics(firstGaps, 3);
  const w5 = computeWindowMetrics(firstGaps, 5);
  const w10 = computeWindowMetrics(firstGaps, 10);
  const w20 = computeWindowMetrics(firstGaps, 20);

  return {
    analysis: analysisId,
    code,
    group,
    totalCycles: cycles.length,
    validCycles: valid,
    censoredCycles: censored,
    firstGaps,
    mean,
    median,
    stdDev,
    topGaps: topGapsList.slice(0, 5),
    pDist,
    windowMetrics: { w3, w5, w10, w20 },
  };
}

async function runLab() {
  console.log("================================================================================");
  console.log("🔬 LABORATÓRIO ESTATÍSTICO — FIRST GAP / PRÓXIMO ZERO (WALK-FORWARD ESTRITO)");
  console.log("================================================================================");
  console.log("Metodologia: Walk-Forward Estrito | Sem Dados Futuros | Apenas Primeiro Branco\n");

  const targetAnalyses = [
    // 1. Grupo A1 - A49 (Amostra representativa de padrões e minutos)
    { id: 2, code: "A2", group: "A1-A49 (Padrão)" },
    { id: 3, code: "A3", group: "A1-A49 (Padrão)" },
    { id: 4, code: "A4", group: "A1-A49 (Padrão)" },
    { id: 5, code: "A5", group: "A1-A49 (Padrão)" },
    { id: 17, code: "A17", group: "A1-A49 (Minuto)" },
    { id: 18, code: "A18", group: "A1-A49 (Minuto)" },
    { id: 25, code: "A25", group: "A1-A49 (Pedra Minuto)" },
    { id: 27, code: "A27", group: "A1-A49 (Pedra Minuto)" },
    { id: 31, code: "A31", group: "A1-A49 (Pedra Minuto)" },
    { id: 35, code: "A35", group: "A1-A49 (Pedra Minuto)" },

    // 2. Grupo Quebras de Cor: A50 - A56 (4x a 10x)
    { id: 50, code: "A50 (Q1/4x)", group: "Quebra de Cor (A50-A56)" },
    { id: 51, code: "A51 (Q2/5x)", group: "Quebra de Cor (A50-A56)" },
    { id: 52, code: "A52 (Q3/6x)", group: "Quebra de Cor (A50-A56)" },
    { id: 53, code: "A53 (Q4/7x)", group: "Quebra de Cor (A50-A56)" },
    { id: 54, code: "A54 (Q5/8x)", group: "Quebra de Cor (A50-A56)" },

    // 3. Grupo Quebras de Recuperação: A60 - A114 / Q26 - Q80
    { id: 60, code: "A60 (Q26)", group: "Recuperação (A60-A114)" },
    { id: 61, code: "A61 (Q27)", group: "Recuperação (A60-A114)" },
    { id: 62, code: "A62 (Q28)", group: "Recuperação (A60-A114)" },
    { id: 65, code: "A65 (Q31)", group: "Recuperação (A60-A114)" },
    { id: 70, code: "A70 (Q36)", group: "Recuperação (A60-A114)" },
  ];

  const results: FirstGapStats[] = [];

  for (const target of targetAnalyses) {
    process.stdout.write(`Carregando ciclos para ${target.code}... `);
    const cycles = await fetchCyclesForAnalysis(target.id, 3000);
    const stats = analyzeCycles(cycles, target.id, target.code, target.group);
    if (stats) {
      results.push(stats);
      console.log(`OK (${stats.validCycles} ciclos válidos, ${stats.censoredCycles} censurados)`);
    } else {
      console.log(`Poucos ou nenhum ciclo encontrado.`);
    }
  }

  console.log("\n================================================================================");
  console.log("📊 PARTE 1: ESTATÍSTICA DESCRITIVA DO PRIMEIRO ZERO (FIRST GAP)");
  console.log("================================================================================");
  console.log(
    "Análise          | Grupo               | N Válidos | Média (min) | Mediana | DesvPad | Top 1 Gap (Freq) | Top 2 Gap (Freq) | Top 3 Gap (Freq)"
  );
  console.log("-".repeat(130));

  for (const r of results) {
    const t1 = r.topGaps[0] ? `${r.topGaps[0].gap}m (${r.topGaps[0].pct.toFixed(1)}%)` : "--";
    const t2 = r.topGaps[1] ? `${r.topGaps[1].gap}m (${r.topGaps[1].pct.toFixed(1)}%)` : "--";
    const t3 = r.topGaps[2] ? `${r.topGaps[2].gap}m (${r.topGaps[2].pct.toFixed(1)}%)` : "--";

    console.log(
      `${r.code.padEnd(16)} | ${r.group.padEnd(19)} | ${String(r.validCycles).padStart(9)} | ${r.mean
        .toFixed(2)
        .padStart(11)} | ${String(r.median).padStart(7)} | ${r.stdDev.toFixed(2).padStart(7)} | ${t1.padEnd(
        16
      )} | ${t2.padEnd(16)} | ${t3.padEnd(16)}`
    );
  }

  console.log("\n================================================================================");
  console.log("📈 PARTE 2: DISTRIBUIÇÃO P(firstGap = X) — PRIMEIROS 10 MINUTOS");
  console.log("================================================================================");
  console.log("Análise          | 1m     | 2m     | 3m     | 4m     | 5m     | 6m     | 7m     | 8m     | 9m     | 10m    | >10m");
  console.log("-".repeat(105));

  for (const r of results) {
    const p = (min: number) => (r.pDist[min] ? `${r.pDist[min].toFixed(1)}%` : "0.0%").padStart(6);
    let pGt10 = 0;
    for (const [gapStr, pct] of Object.entries(r.pDist)) {
      if (Number(gapStr) > 10) pGt10 += pct;
    }
    console.log(
      `${r.code.padEnd(16)} | ${p(1)} | ${p(2)} | ${p(3)} | ${p(4)} | ${p(5)} | ${p(6)} | ${p(7)} | ${p(8)} | ${p(9)} | ${p(10)} | ${pGt10
        .toFixed(1)
        .padStart(5)}%`
    );
  }

  console.log("\n================================================================================");
  console.log("🔄 PARTE 3: COMPARAÇÃO DAS JANELAS WALK-FORWARD (3, 5, 10, 20 CICLOS)");
  console.log("================================================================================");
  console.log("Métricas calculadas SEM Look-Ahead Bias: Janela passada prevê o firstGap do próximo ciclo.\n");

  console.log(
    "Análise          | Janela | Concentr. Top1 | Taxa Repet. | Acerto Exato Top1 | Acerto Vizinhança (±1m) | Erro Médio (MAE)"
  );
  console.log("-".repeat(110));

  for (const r of results) {
    const wm = r.windowMetrics;
    const printRow = (w: WindowEvaluation) => {
      console.log(
        `${r.code.padEnd(16)} | ${String(w.windowSize + " ciclos").padEnd(6)} | ${w.avgTop1Concentration
          .toFixed(1)
          .padStart(13)}% | ${w.repeatedGapRate.toFixed(1).padStart(10)}% | ${w.exactTop1Rate
          .toFixed(2)
          .padStart(16)}% | ${w.vicinityTop1Rate.toFixed(2).padStart(22)}% | ${w.maeMedian
          .toFixed(2)
          .padStart(15)} min`
      );
    };
    printRow(wm.w3);
    printRow(wm.w5);
    printRow(wm.w10);
    printRow(wm.w20);
    console.log("-".repeat(110));
  }

  console.log("\n================================================================================");
  console.log("🔍 PARTE 4: AUDITORIA DO ATUAL gaps[] vs FIRST GAP REAL");
  console.log("================================================================================");
  console.log("Comparação entre o comportamento do primeiro zero e os 14 zeros acumulados em gaps[].\n");

  for (const r of results.slice(0, 5)) {
    // Amostra de ciclos para inspecionar gaps[] vs first_white_gap
    const cycles = await fetchCyclesForAnalysis(r.analysis, 5);
    console.log(`>> Análise ${r.code}:`);
    for (const c of cycles) {
      const g = c.gaps;
      const fg = g.length > 0 ? g[0] : "nenhum";
      const rest = g.slice(1, 5).join(", ");
      console.log(
        `   Ciclo ${c.cycle_key.padEnd(28)} | FIRST GAP: ${String(fg).padStart(2)}m | Zeros Subsequentes: [${rest}...] (Total: ${g.length} zeros)`
      );
    }
  }

  console.log("\nLaboratório concluído com sucesso.");
}

runLab().catch(console.error);
