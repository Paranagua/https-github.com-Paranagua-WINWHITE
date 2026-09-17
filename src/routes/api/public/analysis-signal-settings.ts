import { createFileRoute } from "@tanstack/react-router";
import { autonomousEngine } from "@/server/autonomousEngine";

export const Route = createFileRoute("/api/public/analysis-signal-settings")({
  server: {
    handlers: {
      GET: async () => {
        const active = autonomousEngine.getActiveSignalAnalysisIds();
        return new Response(JSON.stringify({ activeAnalysisIds: active }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json().catch(() => null);
          if (body && Array.isArray(body.activeAnalysisIds)) {
            autonomousEngine.setActiveSignalAnalysisIds(body.activeAnalysisIds);
          }
        } catch (err) {
          console.warn("[API] Error updating analysis signal settings:", err);
        }
        const active = autonomousEngine.getActiveSignalAnalysisIds();
        return new Response(JSON.stringify({ activeAnalysisIds: active }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
