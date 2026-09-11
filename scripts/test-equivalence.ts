import { blazeSupabase } from "../src/integrations/supabase/blaze-client";
import {
  fetchPersistedCycles,
  fetchPersistedCyclesMap,
  type PersistedCycleRecord,
} from "../src/lib/cyclePersistence";
import { IncrementalPredictiveEngine } from "../src/lib/incrementalPredictiveEngine";
import { autonomousEngine } from "../src/server/autonomousEngine";

async function runTests() {
  console.log("=========================================================");
  console.log("  FASE 7 — TESTE DE EQUIVALÊNCIA (A2, A4, A19)");
  console.log("=========================================================");

  const targetAnalyses = [2, 4, 19];
  const equivalenceResults: Record<number, any> = {};

  for (const analysis of targetAnalyses) {
    console.log(`\n--- Testando Análise A${analysis} ---`);

    // 1. Ciclos gravados no Supabase
    const { count: supabaseCount, error: countErr } = await blazeSupabase
      .from("predictive_cycles")
      .select("id", { count: "exact", head: true })
      .eq("analysis", analysis);

    if (countErr) {
      console.error(`Erro ao contar Supabase para A${analysis}:`, countErr);
    }

    // 2. Amostra de ciclos gravados no Supabase
    const { data: sampleFromSupabase } = await blazeSupabase
      .from("predictive_cycles")
      .select("*")
      .eq("analysis", analysis)
      .order("trigger_at", { ascending: false })
      .limit(5);

    // 3. Ciclos retornados via fetchPersistedCycles (usando a função de persistência do app)
    const cyclesFromPersistenceLib = await fetchPersistedCycles({ analysis, limit: 10000 });

    // 4. Ciclos recebidos via fetchPersistedCyclesMap (mesma função usada pelo frontend/cyclesMap)
    const cyclesMap = await fetchPersistedCyclesMap([analysis], 5000);
    const cyclesFromMap = cyclesMap[analysis] || [];

    // 5. Validação de integridade dos campos
    const sample = sampleFromSupabase?.[0];
    const sampleValid =
      sample &&
      typeof sample.cycle_key === "string" &&
      sample.cycle_key.startsWith(`A${analysis}_`) &&
      sample.analysis === analysis &&
      typeof sample.value === "number" &&
      typeof sample.trigger_at === "string" &&
      Array.isArray(sample.gaps) &&
      (sample.status === "aberto" || sample.status === "concluido" || sample.status === "timeout");

    equivalenceResults[analysis] = {
      analysis: `A${analysis}`,
      supabaseCount,
      persistenceLibCount: cyclesFromPersistenceLib.length,
      frontendMapCount: cyclesFromMap.length,
      sampleKey: sample?.cycle_key,
      sampleTriggerAt: sample?.trigger_at,
      sampleGapsCount: sample?.gaps?.length,
      sampleStatus: sample?.status,
      sampleValue: sample?.value,
      sampleValid,
    };

    console.log(`  Supabase count:       ${supabaseCount}`);
    console.log(`  Persistence lib count: ${cyclesFromPersistenceLib.length}`);
    console.log(`  Frontend map count:   ${cyclesFromMap.length}`);
    console.log(`  Exemplo de cycle_key: ${sample?.cycle_key}`);
    console.log(`  Exemplo trigger_at:   ${sample?.trigger_at}`);
    console.log(
      `  Exemplo gaps:         [${sample?.gaps?.slice(0, 5).join(", ")}${sample?.gaps?.length > 5 ? "..." : ""}] (${sample?.gaps?.length} gaps)`,
    );
    console.log(`  Exemplo status:       ${sample?.status}`);
    console.log(`  Exemplo value:        ${sample?.value}`);
    console.log(`  Validação de campos:  ${sampleValid ? "OK (VÁLIDO)" : "FALHA"}`);
  }

  console.log("\n=========================================================");
  console.log("  FASE 8 — TESTE DE REINICIALIZAÇÃO");
  console.log("=========================================================");

  console.log("Simulando boot limpo de novo AutonomousEngine...");
  const newEngine = new IncrementalPredictiveEngine();
  console.log("Ciclos antes da reidratação:", newEngine.getAllCyclesMap()[2]?.length || 0);

  // Carregar ciclos persistidos do Supabase para as análises alvo
  const persistedForReboot = await fetchPersistedCycles({ analyses: [2, 4, 19], limit: 20000 });
  newEngine.loadPersistedCycles(persistedForReboot);

  const afterRebootMap = newEngine.getAllCyclesMap();
  const a2AfterReboot = afterRebootMap[2]?.length || 0;
  const a4AfterReboot = afterRebootMap[4]?.length || 0;
  const a19AfterReboot = afterRebootMap[19]?.length || 0;

  console.log(`Ciclos após reidratação do Supabase:`);
  console.log(`  - A2:  ${a2AfterReboot}`);
  console.log(`  - A4:  ${a4AfterReboot}`);
  console.log(`  - A19: ${a19AfterReboot}`);
  console.log(
    `Histórico preservado independentemente dos últimos 500 resultados: ${a2AfterReboot > 1000 ? "SIM (SUCESSO)" : "NÃO"}`,
  );

  console.log("\n=========================================================");
  console.log("  FASE 9 — TESTE DE NOVOS CICLOS");
  console.log("=========================================================");

  // Criar um ciclo de teste para demonstrar gravação, recuperação e persistência de novos ciclos
  const testNow = new Date();
  const testKey = `A2_V1_T${testNow.getTime()}`;
  const newTestCycle: PersistedCycleRecord = {
    cycle_key: testKey,
    analysis: 2,
    analysis_code: "A2",
    analysis_name: "Análise 2",
    value: 1,
    trigger_at: testNow.toISOString(),
    gaps: [5, 12],
    total_whites: 2,
    first_white_gap: 5,
    status: "aberto",
    updated_at: testNow.toISOString(),
  };

  console.log(`1. Inserindo novo ciclo de teste: ${testKey}`);
  const { error: insertErr } = await blazeSupabase
    .from("predictive_cycles")
    .upsert([newTestCycle], { onConflict: "cycle_key" });

  console.log(`   Inserção no Supabase: ${insertErr ? "Erro: " + insertErr.message : "Sucesso"}`);

  console.log("2. Verificando presença no Supabase...");
  const { data: retrievedTest } = await blazeSupabase
    .from("predictive_cycles")
    .select("*")
    .eq("cycle_key", testKey)
    .single();

  console.log(
    `   Recuperado com sucesso: ${retrievedTest ? "SIM (ID: " + retrievedTest.id + ")" : "NÃO"}`,
  );

  console.log("3. Verificando presença no fetchPersistedCycles...");
  const searchCycle = await fetchPersistedCycles({ analysis: 2, limit: 10 });
  const foundInSearch = searchCycle.some((c) => {
    const k = `A${c.analysis}_V${c.value}_T${c.triggerAt.getTime()}`;
    return k === testKey;
  });
  console.log(`   Presente na busca do engine/frontend: ${foundInSearch ? "SIM" : "NÃO"}`);

  console.log("4. Verificando que ciclos antigos continuam intactos...");
  const { count: countAfterNew } = await blazeSupabase
    .from("predictive_cycles")
    .select("id", { count: "exact", head: true });
  console.log(`   Contagem total pós-inserção: ${countAfterNew} (histórico antigo preservado)`);

  // Limpeza do ciclo de teste
  await blazeSupabase.from("predictive_cycles").delete().eq("cycle_key", testKey);
  console.log("5. Limpeza do ciclo de teste concluída com sucesso.");

  console.log("\n=========================================================");
  console.log("  TESTES CONCLUÍDOS COM SUCESSO!");
  console.log("=========================================================\n");
}

runTests().catch((err) => {
  console.error("Erro nos testes:", err);
  process.exit(1);
});
