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
        if (request.method === "POST") {
          let saved = 0;
          try {
            const body = await request
              .clone()
              .json()
              .catch(() => null);
            if (body && Array.isArray(body.records)) {
              saved = predictiveCyclesStore.upsertBatch(body.records);
              // Tenta persistir no Supabase via admin/client
              try {
                const { supabaseAdmin } = await import("./integrations/supabase/client.server");
                if (supabaseAdmin) {
                  await (supabaseAdmin as any)
                    .from("predictive_cycles")
                    .upsert(body.records, { onConflict: "cycle_key" });
                }
              } catch {
                // Silencioso se migration ainda não foi executada no banco remoto
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
        const value = url.searchParams.get("value")
          ? Number(url.searchParams.get("value"))
          : undefined;
        const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 300;

        let cycles = predictiveCyclesStore.getCycles({ analysis, value, limit });

        // Se cache em memória estiver vazio, tenta carregar do Supabase
        if (cycles.length === 0) {
          try {
            const { supabaseAdmin } = await import("./integrations/supabase/client.server");
            if (supabaseAdmin) {
              let q = (supabaseAdmin as any)
                .from("predictive_cycles")
                .select("*")
                .order("trigger_at", { ascending: false })
                .limit(limit);
              if (analysis !== undefined) q = q.eq("analysis", analysis);
              if (value !== undefined) q = q.eq("value", value);
              const { data } = await q;
              if (data && Array.isArray(data)) {
                predictiveCyclesStore.upsertBatch(data);
                cycles = data;
              }
            }
          } catch {
            // Ignora se tabela ainda não existir no remoto
          }
        }

        return new Response(JSON.stringify(cycles), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=5",
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
