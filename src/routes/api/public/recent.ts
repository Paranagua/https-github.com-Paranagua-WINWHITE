import { createFileRoute } from "@tanstack/react-router";

type BlazeRound = {
  id: string;
  color: number;
  roll: number;
  created_at: string;
};

const SOURCES = [
  "https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1",
  "https://api-v2.blaze1.space/api/singleplayer-originals/originals/roulette_games/recent/1",
  "https://api-v2.blaze1.space/api/singleplayer-originals/originals/roulette_games/recent/history/1",
];

const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Referer: "https://blaze.bet.br/",
  Origin: "https://blaze.bet.br",
};

function normalize(payload: unknown): BlazeRound[] | null {
  if (Array.isArray(payload)) return payload as BlazeRound[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { records?: unknown }).records)
  ) {
    return (payload as { records: BlazeRound[] }).records;
  }
  return null;
}

export const Route = createFileRoute("/api/public/recent")({
  server: {
    handlers: {
      GET: async () => {
        const errors: string[] = [];
        for (const url of SOURCES) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            const r = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
            clearTimeout(timer);
            if (!r.ok) {
              errors.push(`${url} -> ${r.status}`);
              continue;
            }
            const text = (await r.text()).slice(0, 512 * 1024); // cap 512KB
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              errors.push(`${url} -> invalid json`);
              continue;
            }
            const rounds = normalize(parsed);
            if (!rounds) {
              errors.push(`${url} -> unexpected shape`);
              continue;
            }
            return new Response(JSON.stringify(rounds), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
              },
            });
          } catch (e) {
            errors.push(`${url} -> ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        return new Response(
          JSON.stringify({ error: errors.join(" | ") || "no upstream", fallback: true }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      },
    },
  },
});
