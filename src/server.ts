import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { autonomousEngine } from "./server/autonomousEngine";
import { predictiveCyclesStore } from "./server/predictiveCyclesStore";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

// Garantia de inicialização autônoma do motor em segundo plano no servidor
try {
  autonomousEngine.start();
} catch (e) {
  console.error("[Server] Failed to auto-start autonomous engine:", e);
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/public/autonomous-audit") {
        if (request.method === "DELETE") {
          await autonomousEngine.clearData();
        } else if (request.method === "POST") {
          try {
            const body = await request
              .clone()
              .json()
              .catch(() => null);
            if (body && (body.action === "clear" || body.clear === true)) {
              await autonomousEngine.clearData();
            } else {
              await autonomousEngine.runCycle();
            }
          } catch {
            await autonomousEngine.runCycle();
          }
        }
        const state = autonomousEngine.getState();
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (url.pathname === "/api/public/predictive-cycles") {
        const { blazeSupabase } = await import("./integrations/supabase/blaze-client");

        if (request.method === "POST") {
          let saved = 0;
          try {
            const body = await request
              .clone()
              .json()
              .catch(() => null);
            const rawRecords: any[] = Array.isArray(body)
              ? body
              : Array.isArray(body?.records)
                ? body.records
                : [];

            if (rawRecords.length > 0) {
              const validRecords = rawRecords
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
                  analysis_name: r.analysis_name
                    ? String(r.analysis_name)
                    : `Análise ${r.analysis}`,
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
                // 1. Persistência na fonte de verdade (Supabase: public.predictive_cycles)
                const { error } = await blazeSupabase
                  .from("predictive_cycles")
                  .upsert(validRecords, { onConflict: "cycle_key" });

                if (!error) {
                  saved = validRecords.length;
                } else {
                  console.warn(
                    "[Server] Error upserting to Supabase predictive_cycles:",
                    error.message,
                  );
                }

                // 2. Atualiza cache em memória
                predictiveCyclesStore.upsertBatch(validRecords);
              }
            }
          } catch (e) {
            console.error("[Server] Error saving predictive cycles:", e);
          }
          return new Response(JSON.stringify({ ok: true, saved }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // GET
        const analysis = url.searchParams.get("analysis")
          ? Number(url.searchParams.get("analysis"))
          : undefined;
        const analysesParam = url.searchParams.get("analyses");
        const analyses = analysesParam
          ? analysesParam
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined;
        const value = url.searchParams.get("value")
          ? Number(url.searchParams.get("value"))
          : undefined;
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? Math.min(Math.max(1, Number(limitParam)), 50000) : 5000;

        let cycles: any[] = [];

        // 1. Consulta primeiro a fonte de verdade (Supabase)
        try {
          let offset = 0;
          const PAGE_SIZE = 1000;

          while (cycles.length < limit) {
            const pageSize = Math.min(PAGE_SIZE, limit - cycles.length);
            let q = blazeSupabase
              .from("predictive_cycles")
              .select("*")
              .order("trigger_at", { ascending: false })
              .range(offset, offset + pageSize - 1);

            if (analysis !== undefined && !Number.isNaN(analysis)) {
              q = q.eq("analysis", analysis);
            } else if (analyses && analyses.length > 0) {
              q = q.in("analysis", analyses);
            }
            if (value !== undefined && !Number.isNaN(value)) q = q.eq("value", value);

            const { data, error } = await q;
            if (error || !data || data.length === 0) break;

            cycles.push(...data);
            offset += data.length;
            if (data.length < pageSize) break;
          }

          if (cycles.length > 0) {
            predictiveCyclesStore.upsertBatch(cycles);
          }
        } catch {
          // fallback para memória
        }

        // 2. Fallback para cache em memória se Supabase não retornou dados
        if (cycles.length === 0) {
          cycles = predictiveCyclesStore.getCycles({ analysis, value, limit });
        }

        return new Response(JSON.stringify(cycles), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
