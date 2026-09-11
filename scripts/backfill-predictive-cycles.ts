import { blazeSupabase } from "../src/integrations/supabase/blaze-client";
import { IncrementalPredictiveEngine } from "../src/lib/incrementalPredictiveEngine";
import {
  getCycleKey,
  computeCycleStatus,
  type PersistedCycleRecord,
} from "../src/lib/cyclePersistence";
import type { Row } from "../src/lib/predictive";

async function runBackfill() {
  console.log("=========================================================");
  console.log("  INICIANDO BACKFILL HISTÓRICO DE CICLOS PREDITIVOS");
  console.log("=========================================================");

  // 1. Contar total de registros em blaze_results
  const { count: totalBlazeRows, error: countErr } = await blazeSupabase
    .from("blaze_results")
    .select("id", { count: "exact", head: true });

  if (countErr) {
    console.error("Erro ao verificar total de blaze_results:", countErr);
    process.exit(1);
  }

  console.log(`Total de giros em public.blaze_results: ${totalBlazeRows}`);

  // 2. Verificar quantidade atual de ciclos persistidos
  const { count: initialCyclesCount } = await blazeSupabase
    .from("predictive_cycles")
    .select("id", { count: "exact", head: true });

  console.log(
    `Quantidade atual em public.predictive_cycles antes do backfill: ${initialCyclesCount ?? 0}`,
  );

  // 3. Inicializar o IncrementalPredictiveEngine (usando as regras matemáticas oficiais)
  const engine = new IncrementalPredictiveEngine();

  const BATCH_SIZE = 1000;
  let lastId = 0;
  let processedRows = 0;
  const startTime = Date.now();

  console.log("\nIniciando extração e processamento determinístico dos giros...");

  while (true) {
    const { data, error } = await blazeSupabase
      .from("blaze_results")
      .select("id, roll, color, created_at")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error(`Erro ao consultar blaze_results a partir do id ${lastId}:`, error);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    const rows = data as Row[];
    engine.processBatch(rows);

    lastId = rows[rows.length - 1].id;
    processedRows += rows.length;

    if (processedRows % 10000 === 0 || processedRows === totalBlazeRows) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  -> Processados ${processedRows} / ${totalBlazeRows} giros (${elapsed}s)...`);
    }
  }

  console.log(
    `\nProcessamento dos giros concluído em ${((Date.now() - startTime) / 1000).toFixed(1)}s.`,
  );
  console.log(`Total de giros processados: ${processedRows}`);

  // 4. Extrair todos os ciclos produzidos pelo motor
  const cyclesMap = engine.getAllCyclesMap();
  const rawRecordsMap = new Map<string, PersistedCycleRecord>();

  for (const analysisStr of Object.keys(cyclesMap)) {
    const analysis = Number(analysisStr);
    const cycles = cyclesMap[analysis] || [];

    for (const c of cycles) {
      if (!c || !c.triggerAt) continue;
      const triggerDate = c.triggerAt instanceof Date ? c.triggerAt : new Date(c.triggerAt);
      if (Number.isNaN(triggerDate.getTime())) continue;

      const key = getCycleKey(c.analysis, c.value, triggerDate);
      const gaps = Array.isArray(c.gaps) ? c.gaps.map(Number) : [];
      const status = computeCycleStatus(gaps, triggerDate);

      // Validação estrita dos campos
      if (!key || Number.isNaN(c.analysis) || Number.isNaN(c.value)) continue;

      const rec: PersistedCycleRecord = {
        cycle_key: key,
        analysis: c.analysis,
        analysis_code: `A${c.analysis}`,
        analysis_name: `Análise ${c.analysis}`,
        value: c.value,
        trigger_at: triggerDate.toISOString(),
        gaps,
        total_whites: gaps.length,
        first_white_gap: gaps.length > 0 ? gaps[0] : null,
        status,
        updated_at: new Date().toISOString(),
      };

      // Deduplicação estrita por cycle_key mantendo a versão com mais gaps
      const existing = rawRecordsMap.get(key);
      if (!existing || rec.gaps.length >= existing.gaps.length) {
        rawRecordsMap.set(key, rec);
      }
    }
  }

  const allRecords = Array.from(rawRecordsMap.values());
  console.log(`Total de ciclos únicos gerados pelo motor: ${allRecords.length}`);

  // Contagens específicas de interesse
  const a2Count = allRecords.filter((r) => r.analysis === 2).length;
  const a4Count = allRecords.filter((r) => r.analysis === 4).length;
  const a19Count = allRecords.filter((r) => r.analysis === 19).length;
  console.log(`  - Análise A2:  ${a2Count} ciclos`);
  console.log(`  - Análise A4:  ${a4Count} ciclos`);
  console.log(`  - Análise A19: ${a19Count} ciclos`);

  // 5. Inserir/Upsert no Supabase em lotes
  console.log("\nIniciando gravação no Supabase (public.predictive_cycles)...");
  const UPSERT_BATCH_SIZE = 250;
  let savedCount = 0;
  let errorsCount = 0;
  const insertStart = Date.now();

  for (let i = 0; i < allRecords.length; i += UPSERT_BATCH_SIZE) {
    const chunk = allRecords.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await blazeSupabase
      .from("predictive_cycles")
      .upsert(chunk, { onConflict: "cycle_key" });

    if (error) {
      console.error(`Erro ao gravar lote ${i} a ${i + chunk.length}:`, error.message);
      errorsCount += chunk.length;
    } else {
      savedCount += chunk.length;
    }

    if (savedCount % 2500 === 0 || i + UPSERT_BATCH_SIZE >= allRecords.length) {
      const elapsed = ((Date.now() - insertStart) / 1000).toFixed(1);
      console.log(`  -> Gravados ${savedCount} / ${allRecords.length} ciclos (${elapsed}s)...`);
    }
  }

  // 6. Validar quantidade final persistida
  const { count: finalCyclesCount } = await blazeSupabase
    .from("predictive_cycles")
    .select("id", { count: "exact", head: true });

  console.log("\n=========================================================");
  console.log("  RESULTADO FINAL DO BACKFILL");
  console.log("=========================================================");
  console.log(`Giros processados de blaze_results:   ${processedRows}`);
  console.log(`Ciclos gerados pelo motor:            ${allRecords.length}`);
  console.log(`Ciclos salvos com sucesso:            ${savedCount}`);
  console.log(`Erros durante a gravação:             ${errorsCount}`);
  console.log(`Quantidade em predictive_cycles antes: ${initialCyclesCount ?? 0}`);
  console.log(`Quantidade em predictive_cycles após:  ${finalCyclesCount ?? 0}`);
  console.log("=========================================================\n");
}

runBackfill().catch((err) => {
  console.error("Falha crítica no script de backfill:", err);
  process.exit(1);
});
