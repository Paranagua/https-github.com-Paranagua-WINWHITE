import { createFileRoute } from "@tanstack/react-router";
import { autonomousEngine } from "@/server/autonomousEngine";

export const Route = createFileRoute("/api/public/autonomous-audit")({
  server: {
    handlers: {
      GET: async () => {
        const state = autonomousEngine.getState();
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      POST: async () => {
        await autonomousEngine.runCycle();
        const state = autonomousEngine.getState();
        return new Response(JSON.stringify(state), {
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
