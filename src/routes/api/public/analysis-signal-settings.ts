import { createFileRoute } from "@tanstack/react-router";
import { autonomousEngine } from "@/server/autonomousEngine";

export const Route = createFileRoute("/api/public/analysis-signal-settings")({
  server: {
    handlers: {
      GET: async () => {
        const activeIds = autonomousEngine.getActiveSignalAnalysisIds();
        const activeStones = autonomousEngine.getActiveSignalAnalysisStones();
        const autoAudit = autonomousEngine.isAutoAuditMode();
        return new Response(
          JSON.stringify({
            activeAnalysisIds: activeIds,
            activeAnalysisStones: activeStones,
            autoAuditMode: autoAudit,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store, no-cache, must-revalidate",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json().catch(() => null);
          if (body && Array.isArray(body.activeAnalysisIds)) {
            autonomousEngine.setActiveSignalAnalysisIds(body.activeAnalysisIds);
          }
          if (body && body.activeAnalysisStones && typeof body.activeAnalysisStones === "object") {
            autonomousEngine.setActiveSignalAnalysisStones(body.activeAnalysisStones);
          }
          if (body && typeof body.autoAuditMode === "boolean") {
            autonomousEngine.setAutoAuditMode(body.autoAuditMode);
          }
        } catch (err) {
          console.warn("[API] Error updating analysis signal settings:", err);
        }
        const activeIds = autonomousEngine.getActiveSignalAnalysisIds();
        const activeStones = autonomousEngine.getActiveSignalAnalysisStones();
        const autoAudit = autonomousEngine.isAutoAuditMode();
        return new Response(
          JSON.stringify({
            activeAnalysisIds: activeIds,
            activeAnalysisStones: activeStones,
            autoAuditMode: autoAudit,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store, no-cache, must-revalidate",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      },
    },
  },
});
