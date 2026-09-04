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
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json().catch(() => null);
          if (body && (body.action === "clear" || body.clear === true)) {
            await autonomousEngine.clearData();
          } else {
            await autonomousEngine.runCycle();
          }
        } catch {
          await autonomousEngine.runCycle();
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
      },
      DELETE: async () => {
        await autonomousEngine.clearData();
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
