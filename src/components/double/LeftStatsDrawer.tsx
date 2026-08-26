import { memo, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { colorOf, fmtTime, mapColor, type Color, type Spin } from "./types";
import { blazeSupabase } from "@/integrations/supabase/blaze-client";
import { parseUtcDate } from "@/lib/utils";
const BRANCO_IMG = "/images/branco.svg";

type Props = {
  open: boolean;
  onClose: () => void;
  spins: Spin[];
};

const HOUR_TZ = "America/Sao_Paulo";
const CHUNK = 1000;
const MAX_ROWS = 20000;
const HISTORY_ROWS = 1500;
const REFRESH_MS = 30000;

function minutesAgo(iso: string): number {
  const t = parseUtcDate(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

function ptDayStartIso(): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOUR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = fmt.format(now);
  return new Date(`${ymd}T00:00:00-03:00`).getTime();
}

function hourOf(iso: string): number {
  const d = parseUtcDate(iso);
  if (Number.isNaN(d.getTime())) return -1;
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOUR_TZ,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  return parseInt(h, 10);
}

type RawRow = { id: number | string; roll: unknown; color: unknown; created_at: string };

function normalizeColor(v: unknown): Color | null {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (["red", "vermelho", "vermelha", "r"].includes(s)) return "red";
  if (["black", "preto", "preta", "b"].includes(s)) return "black";
  if (["white", "branco", "branca", "w"].includes(s)) return "white";
  const num = Number(s);
  if (s !== "" && Number.isFinite(num) && num >= 0 && num <= 2) return mapColor(num);
  return null;
}

function rowToSpin(r: RawRow): Spin {
  const rollNumber = Number(r.roll);
  const n = Number.isFinite(rollNumber) ? rollNumber : 0;
  const color = normalizeColor(r.color) ?? colorOf(n);
  return { id: String(r.id), n, color, time: fmtTime(r.created_at), createdAt: r.created_at };
}

function dedupeSort(rows: Spin[]): Spin[] {
  const byId = new Map<string, Spin>();
  for (const s of rows) if (s.id && !byId.has(s.id)) byId.set(s.id, s);
  return Array.from(byId.values()).sort(
    (a, b) => parseUtcDate(b.createdAt).getTime() - parseUtcDate(a.createdAt).getTime(),
  );
}

/**
 * Busca TODAS as rodadas desde 00:00 (Brasília) + um lote extra de histórico
 * recente (para análise de brancos/sequências que atravessa a virada do dia).
 * Só roda enquanto o painel está aberto.
 */
function useFullStatsSpins(open: boolean, fallback: Spin[]) {
  const [rows, setRows] = useState<Spin[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    const load = async () => {
      try {
        const dayStartIso = new Date(ptDayStartIso()).toISOString();
        const collected: Spin[] = [];
        for (let from = 0; from < MAX_ROWS; from += CHUNK) {
          const { data, error } = await blazeSupabase
            .from("blaze_results")
            .select("id, roll, color, created_at")
            .gte("created_at", dayStartIso)
            .order("created_at", { ascending: false })
            .range(from, from + CHUNK - 1);
          if (error) throw error;
          const batch = (data ?? []) as RawRow[];
          collected.push(...batch.map(rowToSpin));
          if (batch.length < CHUNK) break;
        }

        const { data: hist } = await blazeSupabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("created_at", { ascending: false })
          .range(0, HISTORY_ROWS - 1);
        collected.push(...((hist ?? []) as RawRow[]).map(rowToSpin));

        if (!alive) return;
        setRows(dedupeSort(collected));
      } catch {
        if (alive) setRows(null);
      }
    };

    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open]);

  // Mescla o que já está na tela com o carregamento completo.
  return useMemo(() => {
    if (!rows) return fallback;
    return dedupeSort([...rows, ...fallback]);
  }, [rows, fallback]);
}

// spins is sorted newest -> oldest
function useStats(spins: Spin[]) {
  return useMemo(() => {
    // Last white index (rodadas atrás = position in newest-first array)
    const lastWhiteIdx = spins.findIndex((s) => s.color === "white");
    const lastWhite = lastWhiteIdx >= 0 ? spins[lastWhiteIdx] : null;
    const lastWhiteMin = lastWhite ? minutesAgo(lastWhite.createdAt) : 0;

    // Max gap between whites (in rodadas)
    let maxGap = 0;
    let prevIdx = -1;
    for (let i = spins.length - 1; i >= 0; i--) {
      if (spins[i].color === "white") {
        if (prevIdx !== -1) maxGap = Math.max(maxGap, prevIdx - i);
        prevIdx = i;
      }
    }

    // Sequential: solo (1), duplo (2), banguelo (3+) — run lengths of consecutive whites (oldest->newest scan)
    type WhiteRun = { size: number; endIdxNewestFirst: number; startIso: string };
    const runs: WhiteRun[] = [];
    {
      let i = spins.length - 1;
      while (i >= 0) {
        if (spins[i].color === "white") {
          let j = i;
          while (j >= 0 && spins[j].color === "white") j--;
          const size = i - j;
          runs.push({
            size,
            endIdxNewestFirst: j + 1, // newest-first index of the last (most recent) white of this run
            startIso: spins[j + 1].createdAt,
          });
          i = j;
        } else {
          i--;
        }
      }
    }

    const lastSolo = [...runs].reverse().find((r) => r.size === 1) ?? null;
    const lastDuplo = [...runs].reverse().find((r) => r.size === 2) ?? null;
    const lastBanguelo = [...runs].reverse().find((r) => r.size >= 3) ?? null;
    const maxDuploGap = (() => {
      const list = runs.filter((r) => r.size === 2);
      if (list.length < 2) return 0;
      let m = 0;
      for (let k = 1; k < list.length; k++) {
        m = Math.max(m, list[k - 1].endIdxNewestFirst - list[k].endIdxNewestFirst);
      }
      return m;
    })();

    // Contagem antes do branco: number that appeared right before each white
    const beforeWhite = new Map<number, number>();
    for (let i = 0; i < spins.length; i++) {
      if (spins[i].color === "white") {
        const before = spins[i + 1]; // older one
        if (before) {
          beforeWhite.set(before.n, (beforeWhite.get(before.n) ?? 0) + 1);
        }
      }
    }
    const beforeWhiteTop = Array.from(beforeWhite.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([n, count]) => ({ n, count }));

    // Today (since 00:00 BRT)
    const dayStart = ptDayStartIso();
    const today = spins.filter((s) => {
      const t = parseUtcDate(s.createdAt).getTime();
      return !Number.isNaN(t) && t >= dayStart;
    });

    // Frequência das pedras
    const freq: number[] = Array.from({ length: 15 }, () => 0);
    for (const s of today) if (s.n >= 0 && s.n <= 14) freq[s.n]++;
    const freqMax = Math.max(1, ...freq);

    // Cores por hora
    const perHour: Array<{ red: number; black: number; white: number }> = Array.from(
      { length: 24 },
      () => ({ red: 0, black: 0, white: 0 }),
    );
    for (const s of today) {
      const h = hourOf(s.createdAt);
      if (h < 0 || h > 23) continue;
      perHour[h][s.color]++;
    }

    // Médias
    const totalRed = today.filter((s) => s.color === "red").length;
    const totalBlack = today.filter((s) => s.color === "black").length;
    const totalWhite = today.filter((s) => s.color === "white").length;
    const totalAll = today.length || 1;
    // Horas decorridas no dia (fração), mínimo de 1/60h para não estourar a média.
    const hoursElapsed = Math.max(1 / 60, (Date.now() - dayStart) / 3_600_000);

    return {
      lastWhiteMin,
      lastWhiteRodadas: lastWhiteIdx >= 0 ? lastWhiteIdx : 0,
      maxGap,
      lastSolo: lastSolo
        ? { min: minutesAgo(lastSolo.startIso), rodadas: lastSolo.endIdxNewestFirst }
        : null,
      lastDuplo: lastDuplo
        ? { min: minutesAgo(lastDuplo.startIso), rodadas: lastDuplo.endIdxNewestFirst }
        : null,
      maxDuploGap,
      lastBanguelo: lastBanguelo
        ? { min: minutesAgo(lastBanguelo.startIso), rodadas: lastBanguelo.endIdxNewestFirst }
        : null,
      beforeWhiteTop,
      freq,
      freqMax,
      perHour,
      totals: {
        red: totalRed,
        black: totalBlack,
        white: totalWhite,
        redPct: (totalRed / totalAll) * 100,
        blackPct: (totalBlack / totalAll) * 100,
        whitePct: (totalWhite / totalAll) * 100,
        redAvg: totalRed / hoursElapsed,
        blackAvg: totalBlack / hoursElapsed,
        whiteAvg: totalWhite / hoursElapsed,
      },
    };
  }, [spins]);
}

function BrancoIcon({ size = 32 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-md bg-white"
      style={{ width: size, height: size }}
    >
      <img src={BRANCO_IMG} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5">
      {icon}
      <div className="min-w-0 text-[12px] leading-snug text-muted-foreground">{children}</div>
    </div>
  );
}

const B = ({ children }: { children: React.ReactNode }) => (
  <b className="text-foreground">{children}</b>
);

export const LeftStatsDrawer = memo(function LeftStatsDrawer({ open, onClose, spins }: Props) {
  const allSpins = useFullStatsSpins(open, spins);
  const s = useStats(allSpins);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-dvh w-[92vw] max-w-[380px] flex-col border-r border-white/10 bg-background shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Estatísticas
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-white/[0.09] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            <Section title="Análise de Brancos">
              <Row icon={<BrancoIcon />}>
                O último foi há <B>{s.lastWhiteMin} min</B> ({s.lastWhiteRodadas} rodadas atrás)
              </Row>
              <Row icon={<BrancoIcon />}>
                A máxima de brancos é de <B>{s.maxGap} rodadas</B>
              </Row>
            </Section>

            <Section title="Sequencial">
              <Row icon={<BrancoIcon />}>
                {s.lastSolo ? (
                  <>
                    O último solo foi há <B>{s.lastSolo.min} min</B> ({s.lastSolo.rodadas} rodadas
                    atrás)
                  </>
                ) : (
                  "Sem solo no histórico"
                )}
              </Row>
              <Row
                icon={
                  <div className="flex gap-0.5">
                    <BrancoIcon size={22} />
                    <BrancoIcon size={22} />
                  </div>
                }
              >
                {s.lastDuplo ? (
                  <>
                    O último duplo foi há <B>{s.lastDuplo.min} min</B> ({s.lastDuplo.rodadas}{" "}
                    rodadas atrás)
                  </>
                ) : (
                  "Sem duplo no histórico"
                )}
                {s.maxDuploGap > 0 && (
                  <>
                    <br />A máxima de brancos duplos é de <B>{s.maxDuploGap} rodadas</B>
                  </>
                )}
              </Row>
              <Row
                icon={
                  <div className="flex gap-0.5">
                    <BrancoIcon size={18} />
                    <BrancoIcon size={18} />
                    <BrancoIcon size={18} />
                  </div>
                }
              >
                {s.lastBanguelo ? (
                  <>
                    O último banguelo foi há <B>{s.lastBanguelo.min} min</B> (
                    {s.lastBanguelo.rodadas} rodadas atrás)
                  </>
                ) : (
                  "Sem banguelo no histórico"
                )}
              </Row>
            </Section>

            <Section title="Contagem antes do branco">
              {s.beforeWhiteTop.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Sem dados suficientes.</p>
              ) : (
                s.beforeWhiteTop.map(({ n, count }) => {
                  const c = colorOf(n);
                  const bg = c === "red" ? "#DE2143" : c === "black" ? "#16171d" : "#ffffff";
                  const fg = c === "white" ? "#0f1115" : "#ffffff";
                  return (
                    <div key={n} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2">
                      <div
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums"
                        style={{
                          background: bg,
                          color: fg,
                          border: c === "black" ? "1px solid rgba(255,255,255,0.15)" : undefined,
                        }}
                      >
                        {n}
                      </div>
                      <div className="text-[12px] leading-tight">
                        <p className="font-semibold text-foreground">{count}x</p>
                        <p className="text-muted-foreground">antes do branco</p>
                      </div>
                    </div>
                  );
                })
              )}
            </Section>

            <Section title="Frequência das pedras (desde 00:00)">
              <p className="-mt-2 mb-1 text-[11px] text-muted-foreground">
                Quantas vezes cada número saiu hoje
              </p>
              {s.freq.map((count, n) => {
                const c = colorOf(n);
                const bg = c === "red" ? "#DE2143" : c === "black" ? "#16171d" : "#ffffff";
                const fg = c === "white" ? "#0f1115" : "#ffffff";
                const barColor = c === "red" ? "#DE2143" : c === "black" ? "#3a3d47" : "#e8e8e8";
                const pct = (count / s.freqMax) * 100;
                return (
                  <div key={n} className="flex items-center gap-2">
                    <div
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-[11px] font-bold tabular-nums"
                      style={{
                        background: bg,
                        color: fg,
                        border: c === "black" ? "1px solid rgba(255,255,255,0.15)" : undefined,
                      }}
                    >
                      {n}
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: barColor }}
                      />
                    </div>
                    <span className="w-6 text-right text-[11px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                );
              })}
            </Section>

            <Section title="Cores por hora">
              <div className="grid grid-cols-2 gap-2">
                {s.perHour.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2 py-1.5"
                  >
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {String(i).padStart(2, "0")}:00
                    </span>
                    <span
                      className="ml-auto grid h-6 min-w-6 place-items-center rounded px-1 text-[10px] font-bold tabular-nums"
                      style={{
                        background: "#16171d",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {h.black}
                    </span>
                    <span
                      className="grid h-6 min-w-6 place-items-center rounded px-1 text-[10px] font-bold tabular-nums"
                      style={{ background: "#DE2143", color: "#fff" }}
                    >
                      {h.red}
                    </span>
                    <span
                      className="grid h-6 min-w-6 place-items-center rounded px-1 text-[10px] font-bold tabular-nums"
                      style={{ background: "#fff", color: "#0f1115" }}
                    >
                      {h.white}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Médias por hora">
              {(
                [
                  {
                    label: "pretos",
                    swatch: "#16171d",
                    total: s.totals.black,
                    pct: s.totals.blackPct,
                    avg: s.totals.blackAvg,
                    border: true,
                  },
                  {
                    label: "vermelhos",
                    swatch: "#DE2143",
                    total: s.totals.red,
                    pct: s.totals.redPct,
                    avg: s.totals.redAvg,
                    border: false,
                  },
                  {
                    label: "brancos",
                    swatch: "#ffffff",
                    total: s.totals.white,
                    pct: s.totals.whitePct,
                    avg: s.totals.whiteAvg,
                    border: false,
                  },
                ] as const
              ).map((row) => (
                <div
                  key={row.label}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5"
                >
                  <div
                    className="h-9 w-9 shrink-0 rounded-md"
                    style={{
                      background: row.swatch,
                      border: row.border ? "1px solid rgba(255,255,255,0.15)" : undefined,
                    }}
                  />
                  <div className="min-w-0 text-[12px] leading-tight">
                    <p className="font-semibold text-foreground">
                      Média de {row.avg.toFixed(2)} {row.label} por hora
                    </p>
                    <p className="text-muted-foreground">
                      Total de <B>{row.total}</B>{" "}
                      <span className="rounded bg-white/10 px-1 text-foreground">
                        {row.pct.toFixed(2)}%
                      </span>{" "}
                      {row.label} no dia
                    </p>
                  </div>
                </div>
              ))}
            </Section>
          </div>
        </div>
      </aside>
    </>
  );
});
