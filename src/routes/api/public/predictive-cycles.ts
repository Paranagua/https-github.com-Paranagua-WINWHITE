import { createFileRoute } from "@tanstack/react-router";
import { blazeSupabase } from "@/integrations/supabase/blaze-client";
import { predictiveCyclesStore } from "@/server/predictiveCyclesStore";
import type { PersistedCycleRecord } from "@/lib/cyclePersistence";

export const Route = createFileRoute("/api/public/predictive-cycles")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const analysisParam = url.searchParams.get("analysis");
        const analysesParam = url.searchParams.get("analyses");
        const valueParam = url.searchParams.get("value");
        const statusParam = url.searchParams.get("status");
        const limitParam = url.searchParams.get("limit");

        const analysis = analysisParam !== null ? Number(analysisParam) : undefined;
        const analyses =
          analysesParam !== null
            ? analysesParam
                .split(",")
                .map(Number)
                .filter((n) => !Number.isNaN(n))
            : undefined;
        const value = valueParam !== null ? Number(valueParam) : undefined;
        const limit = limitParam !== null ? Math.min(Math.max(1, Number(limitParam)), 50000) : 5000;

        let cycles: PersistedCycleRecord[] = [];

        try {
          let offset = 0;
          const PAGE_SIZE = 1000;

          while (cycles.length < limit) {
            const pageSize = Math.min(PAGE_SIZE, limit - cycles.length);
            let query = blazeSupabase
              .from("predictive_cycles")
              .select("*")
              .order("trigger_at", { ascending: false })
              .range(offset, offset + pageSize - 1);

            if (analysis !== undefined && !Number.isNaN(analysis)) {
              query = query.eq("analysis", analysis);
            } else if (analyses && analyses.length > 0) {
              query = query.in("analysis", analyses);
            }
            if (value !== undefined && !Number.isNaN(value)) {
              query = query.eq("value", value);
            }
            if (statusParam) {
              query = query.eq("status", statusParam);
            }

            const { data, error } = await query;
            if (error) {
              console.warn("[API predictive-cycles] Supabase query error:", error.message);
              break;
            }
            if (!data || data.length === 0) break;

            cycles.push(...(data as PersistedCycleRecord[]));
            offset += data.length;
            if (data.length < pageSize) break;
          }

          if (cycles.length > 0) {
            predictiveCyclesStore.upsertBatch(cycles);
          }
        } catch (err: any) {
          console.warn("[API predictive-cycles] Exception querying Supabase:", err?.message);
        }

        // Se Supabase falhou ou não retornou dados, usa store em memória apenas como fallback secundário
        if (cycles.length === 0) {
          cycles = predictiveCyclesStore.getCycles({ analysis, value, limit });
        }

        return new Response(JSON.stringify(cycles), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      },

      POST: async ({ request }: { request: Request }) => {
        let saved = 0;
        try {
          const body = await request.json().catch(() => null);
          const rawRecords: any[] = Array.isArray(body)
            ? body
            : Array.isArray(body?.records)
              ? body.records
              : [];

          if (rawRecords.length > 0) {
            // Validação e normalização estrita dos registros
            const validRecords: PersistedCycleRecord[] = rawRecords
              .filter(
                (r) =>
                  r &&
                  typeof r.cycle_key === "string" &&
                  r.cycle_key.length > 0 &&
                  r.analysis !== undefined &&
                  r.value !== undefined,
              )
              .map((r) => ({
                cycle_key: String(r.cycle_key),
                analysis: Number(r.analysis),
                analysis_code: r.analysis_code ? String(r.analysis_code) : `A${r.analysis}`,
                analysis_name: r.analysis_name ? String(r.analysis_name) : `Análise ${r.analysis}`,
                value: Number(r.value),
                trigger_at: new Date(r.trigger_at).toISOString(),
                gaps: Array.isArray(r.gaps) ? r.gaps.map(Number) : [],
                total_whites: Array.isArray(r.gaps) ? r.gaps.length : Number(r.total_whites) || 0,
                first_white_gap:
                  Array.isArray(r.gaps) && r.gaps.length > 0
                    ? Number(r.gaps[0])
                    : r.first_white_gap !== undefined
                      ? Number(r.first_white_gap)
                      : null,
                status: r.status === "concluido" || r.status === "timeout" ? r.status : "aberto",
                updated_at: new Date().toISOString(),
              }));

            if (validRecords.length > 0) {
              // 1. Persistência primária na fonte de verdade (Supabase: public.predictive_cycles)
              const { error } = await blazeSupabase
                .from("predictive_cycles")
                .upsert(validRecords, { onConflict: "cycle_key" });

              if (error) {
                console.error("[API predictive-cycles] Upsert error in Supabase:", error.message);
              } else {
                saved = validRecords.length;
              }

              // 2. Atualiza cache em memória
              predictiveCyclesStore.upsertBatch(validRecords);
            }
          }
        } catch (e: any) {
          console.error("[API predictive-cycles] POST processing error:", e?.message);
        }

        return new Response(JSON.stringify({ ok: true, saved }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      },

      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      },
    },
  },
});
