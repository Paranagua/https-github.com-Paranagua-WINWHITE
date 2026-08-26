import { parseUtcDate } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { Card } from "@/components/double/Card";
import {
  buildA1,
  buildA2,
  buildA3,
  buildA4,
  buildA5,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  buildA1Minuto5,
  buildA2Minuto5,
  type Cycle as EngineCycle,
  type Row,
} from "@/lib/predictive";

type UiCycle = {
  index: number;
  triggerAt: Date;
  triggerLabel: string;
  triggerDetail: string;
  gaps: number[];
  pending: number;
  elapsed: number;
};

const ALL_NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const TOP_N = 5;
const MAX_ZEROS = 14;
const MAX_DETAIL_ROWS = 5;
const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

function diffMinutes(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

type GroupResult = {
  m: number;
  label: string;
  count: number;
  pct: number;
};

function computeTop5(cycles: UiCycle[]): { rows: GroupResult[]; totalRows: number } {
  const rowSets: Set<number>[] = cycles.map((c) => new Set(c.gaps));
  const totalRows = cycles.length;
  const candidates: GroupResult[] = [];

  let maxGap = 0;
  for (const rs of rowSets) for (const v of rs) if (v > maxGap) maxGap = v;

  for (let m = 0; m <= maxGap + 1; m++) {
    let hasM = false;
    let hasMinus = false;
    let hasPlus = false;
    let count = 0;
    for (const rs of rowSets) {
      const inM = rs.has(m);
      const inMinus = m > 0 && rs.has(m - 1);
      const inPlus = rs.has(m + 1);
      if (inM || inMinus || inPlus) {
        count++;
        if (inM) hasM = true;
        if (inMinus) hasMinus = true;
        if (inPlus) hasPlus = true;
      }
    }
    if (count === 0) continue;
    const parts: string[] = [];
    if (hasMinus) parts.push(`${m - 1}`);
    if (hasM) parts.push(`${m}`);
    if (hasPlus) parts.push(`${m + 1}`);
    candidates.push({
      m,
      label: parts.join(" - "),
      count,
      pct: totalRows ? (count / totalRows) * 100 : 0,
    });
  }

  candidates.sort((a, b) => b.count - a.count || a.m - b.m);

  const picked: GroupResult[] = [];
  const used = new Set<number>();
  for (const cand of candidates) {
    const nums = [cand.m - 1, cand.m, cand.m + 1];
    if (nums.some((n) => used.has(n))) continue;
    picked.push(cand);
    nums.forEach((n) => used.add(n));
    if (picked.length >= TOP_N) break;
  }
  return { rows: picked, totalRows };
}

function fmtTime(d: Date) {
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type PanelProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  loading: boolean;
  err: string | null;
  emptyLabel: string;
  cycles: EngineCycle[];
  pedra: number | string;
  now: Date;
  maxZeros?: number;
  detailFormatter?: (c: EngineCycle) => string;
};

function AnalysisPanel({
  eyebrow,
  title,
  subtitle,
  loading,
  err,
  emptyLabel,
  cycles: rawCycles,
  pedra,
  now,
  maxZeros = MAX_ZEROS,
  detailFormatter,
}: PanelProps) {
  const windowed = useMemo<UiCycle[]>(() => {
    // Pegamos os últimos MAX_DETAIL_ROWS (5) gatilhos gerados para esta pedra
    const filtered = rawCycles.filter((c) => c.value === Number(pedra));
    const recent = filtered.slice(-MAX_DETAIL_ROWS);

    return recent.map((r, i) => {
      const gaps = r.gaps ?? [];
      const defaultDetail = detailFormatter
        ? detailFormatter(r)
        : `min ${String(r.triggerAt.getMinutes()).padStart(2, "0")}`;

      return {
        index: i + 1,
        triggerAt: r.triggerAt,
        triggerLabel: `${r.value}`,
        triggerDetail: defaultDetail,
        gaps,
        pending: gaps.length >= maxZeros ? 0 : 1,
        elapsed: diffMinutes(r.triggerAt, now),
      };
    });
  }, [rawCycles, pedra, now, maxZeros, detailFormatter]);

  const { rows: top5, totalRows } = useMemo(() => computeTop5(windowed), [windowed]);
  const details = windowed;
  const fullyCompleted = windowed.filter((c) => c.gaps.length >= maxZeros).length;
  const totalGaps = windowed.reduce((a, c) => a + c.gaps.length, 0);
  const avg = totalGaps
    ? Math.round(windowed.reduce((a, c) => a + c.gaps.reduce((x, y) => x + y, 0), 0) / totalGaps)
    : null;

  const chartData = top5.map((it) => ({ label: it.label, count: it.count }));

  return (
    <Card className="glass-card overflow-hidden">
      <div className="p-6">
        <div className="mb-6 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-1 font-outfit">
              {eyebrow}
            </div>
            <h3 className="text-xl font-black text-white font-outfit uppercase tracking-tight">
              {title}
            </h3>
            {subtitle && <p className="mt-1 text-xs text-[#9CA3AF]">{subtitle}</p>}
            <p className="mt-1 text-[11px] text-[#9CA3AF] font-medium">
              {windowed.length} gatilhos (últimos {MAX_DETAIL_ROWS}) ·{" "}
              <span className="text-white">{fullyCompleted} completos</span> ·{" "}
              <span className="text-white">{totalGaps} zeros coletados</span>
              {avg !== null ? ` · média ${avg} min` : ""}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando estatísticas...
        </div>
      ) : err ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {err}
        </div>
      ) : totalRows === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <>
          <div className="h-72 w-full rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, bottom: 4, left: -12 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  label={{
                    value: "Ocorrências",
                    angle: -90,
                    position: "insideLeft",
                    fill: "rgba(255,255,255,0.4)",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,15,20,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v}x`, "Ocorrências"]}
                />
                <Bar dataKey="count" fill="#34d399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
            <div className="border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Top {TOP_N} · grupos (M-1, M, M+1)
            </div>
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Minutos</th>
                  <th className="px-3 py-2 text-right font-medium">Linhas</th>
                  <th className="px-3 py-2 text-right font-medium">Assertividade</th>
                </tr>
              </thead>
              <tbody>
                {top5.map((it, i) => (
                  <tr
                    key={`${it.m}-${i}`}
                    className={`border-b border-white/5 last:border-0 ${i === 0 ? "bg-emerald-500/5" : ""}`}
                  >
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 text-foreground">{it.label}</td>
                    <td className="px-3 py-2 text-right text-foreground">{it.count}x</td>
                    <td className="px-3 py-2 text-right text-emerald-300">{it.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
            <div className="border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Detalhes dos ciclos · últimos {MAX_DETAIL_ROWS} gatilhos · até {maxZeros} contagens
              até 0
            </div>
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Gatilho</th>
                  <th className="px-3 py-2 text-left font-medium">Detalhe</th>
                  <th className="px-3 py-2 text-left font-medium">Minutos até 0</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {details
                  .slice()
                  .reverse()
                  .map((c) => {
                    const isComplete = c.gaps.length >= maxZeros;
                    return (
                      <tr
                        key={`${c.triggerAt.getTime()}-${c.triggerLabel}-${c.index}`}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-3 py-2 text-muted-foreground">{c.index}</td>
                        <td className="px-3 py-2 text-foreground">{fmtTime(c.triggerAt)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.triggerDetail}</td>
                        <td className="px-3 py-2 text-foreground">
                          {c.gaps.length ? c.gaps.join(" · ") : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {isComplete ? (
                            <span className="text-emerald-300">Completo ({c.gaps.length})</span>
                          ) : (
                            <span className="text-amber-300">
                              ativo · {c.gaps.length}/{maxZeros} · {c.elapsed} min
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

export default function AnaliseSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(1);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchRows = async () => {
      try {
        const { data, error } = await supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("created_at", { ascending: false })
          .limit(3000);

        if (!alive) return;
        if (error) {
          setErr(error.message);
          return;
        }
        setRows(((data ?? []) as Row[]).slice().reverse());
        setErr(null);
      } catch (e) {
        if (alive) {
          setErr(e instanceof Error ? e.message : "Falha ao carregar resultados");
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void fetchRows();
    const interval = setInterval(fetchRows, 15000);

    const channel = supabase
      .channel("analise-section-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "blaze_results" },
        (payload) => {
          if (payload.new && alive) {
            setRows((prev) => [...prev, payload.new as Row].slice(-3000));
          }
        },
      )
      .subscribe();

    return () => {
      alive = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // Análises calculadas em memória com base em blaze_results
  const a1Cycles = useMemo(() => buildA1(rows), [rows]);
  const a2Cycles = useMemo(() => buildA2(rows), [rows]);
  const a3Cycles = useMemo(() => buildA3(rows), [rows]);
  const a4Cycles = useMemo(() => buildA4(rows), [rows]);
  const a5Cycles = useMemo(() => buildA5(rows), [rows]);
  const aSoma17Cycles = useMemo(() => buildASoma17(rows), [rows]);
  const aSoma19Cycles = useMemo(() => buildASoma19(rows), [rows]);
  const aSoma21Cycles = useMemo(() => buildASoma21(rows), [rows]);
  const a1Min5Cycles = useMemo(() => buildA1Minuto5(rows), [rows]);
  const a2Min5Cycles = useMemo(() => buildA2Minuto5(rows), [rows]);

  // Estatísticas agregadas para o seletor superior de pedras 0..14
  const stats = useMemo(() => {
    const s: Record<
      number,
      { total: number; fullyCompleted: number; totalGaps: number; sumGaps: number }
    > = {};
    ALL_NUMBERS.forEach((n) => (s[n] = { total: 0, fullyCompleted: 0, totalGaps: 0, sumGaps: 0 }));

    // Agrega ciclos da A1
    a1Cycles.forEach((c) => {
      const n = c.value;
      if (s[n]) {
        s[n].total++;
        if (c.gaps.length >= MAX_ZEROS) s[n].fullyCompleted++;
        s[n].totalGaps += c.gaps.length;
        s[n].sumGaps += c.gaps.reduce((a, b) => a + b, 0);
      }
    });

    const finalStats: Record<
      number,
      { total: number; fullyCompleted: number; avg: number | null }
    > = {};
    ALL_NUMBERS.forEach((n) => {
      finalStats[n] = {
        total: s[n].total,
        fullyCompleted: s[n].fullyCompleted,
        avg: s[n].totalGaps ? Math.round(s[n].sumGaps / s[n].totalGaps) : null,
      };
    });
    return finalStats;
  }, [a1Cycles]);

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-8 sm:gap-6 sm:px-6 sm:py-10">
      <Card className="glass-card p-6">
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.4em] text-primary font-outfit">
          Catalogador de latência
        </div>
        <h2 className="text-2xl font-black text-white sm:text-3xl font-outfit uppercase tracking-tighter">
          Ciclos de espera até o branco (0)
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Gatilho: o número sai num minuto cuja unidade é igual a ele (ex.: 1 no minuto 51).
          Contamos os minutos até o próximo 0.
        </p>

        <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-[repeat(15,minmax(0,1fr))]">
          {ALL_NUMBERS.map((n) => {
            const st = stats[n] ?? { total: 0, fullyCompleted: 0, avg: null };
            const isSel = selected === n;
            return (
              <button
                key={n}
                onClick={() => setSelected(n)}
                className={`flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-center transition-all duration-300 font-outfit ${
                  isSel
                    ? "border-primary/60 bg-primary/20 text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] scale-105"
                    : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] hover:border-white/20"
                }`}
              >
                <span className="text-lg font-bold tabular-nums">{n}</span>
                <span className="mt-0.5 text-[10px] tabular-nums">
                  {n <= 9 ? `${st.fullyCompleted}/${st.total}` : "—"}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {st.avg !== null ? `${st.avg} min` : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <AnalysisPanel
        key={`${selected}-a1`}
        eyebrow="Análise 1 · Pedra = Minuto"
        title={`PEDRA ${selected}`}
        subtitle="Gatilho: a pedra sai num minuto com o mesmo final (ex: 1 no min 51). Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel={`Nenhum gatilho registrado para a pedra ${selected} recentemente.`}
        cycles={a1Cycles}
        pedra={selected}
        now={now}
      />
      <AnalysisPanel
        key={`${selected}-a2`}
        eyebrow="Análise 2 · Repetição Simples"
        title={`PEDRA ${selected}`}
        subtitle="Gatilho: a pedra sai duas vezes seguidas na roleta. Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de repetição dupla registrado recentemente."
        cycles={a2Cycles}
        pedra={selected}
        now={now}
        detailFormatter={(c) => `Repetição ${c.value}→${c.value}`}
      />
      <AnalysisPanel
        key={`${selected}-a3`}
        eyebrow="Análise 3 · Repetição Casada"
        title={`PEDRA ${selected}`}
        subtitle="Gatilho: repetição da pedra coincidindo com o minuto. Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de repetição casada registrado recentemente."
        cycles={a3Cycles}
        pedra={selected}
        now={now}
        detailFormatter={(c) => `Casada min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`}
      />
      <AnalysisPanel
        key={`${selected}-a4`}
        eyebrow="Análise 4 · Primeira Pedra da Dezena"
        title={`PEDRA ${selected}`}
        subtitle="Primeira pedra registrada na virada do minuto (00, 10, 20, 30, 40, 50). Analisa até 20 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de virada de minuto registrado recentemente."
        cycles={a4Cycles}
        pedra={selected}
        now={now}
        maxZeros={20}
        detailFormatter={(c) =>
          `1ª dezena min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
        }
      />
      <AnalysisPanel
        key={`${selected}-a5`}
        eyebrow="ANÁLISE 5 · SEGUNDA PEDRA DA DEZENA"
        title={`PEDRA ${selected}`}
        subtitle="Segunda pedra registrada na virada do minuto (00, 10, 20, 30, 40, 50). Analisa até 20 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de segunda pedra da dezena registrado recentemente."
        cycles={a5Cycles}
        pedra={selected}
        now={now}
        maxZeros={20}
        detailFormatter={(c) =>
          `2ª dezena min ${String(c.triggerAt.getMinutes()).padStart(2, "0")}`
        }
      />
      <AnalysisPanel
        key={`${selected}-a17`}
        eyebrow="Análise 17 · Primeira Pedra do Minuto 5"
        title={`PEDRA ${selected}`}
        subtitle="Primeira pedra registrada nos minutos de final 5 (05, 15, 25, 35, 45, 55). Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de primeira pedra do minuto 5 registrado recentemente."
        cycles={a1Min5Cycles}
        pedra={selected}
        now={now}
        detailFormatter={(c) => `1ª min 5 (${String(c.triggerAt.getMinutes()).padStart(2, "0")})`}
      />
      <AnalysisPanel
        key={`${selected}-a18`}
        eyebrow="Análise 18 · Segunda Pedra do Minuto 5"
        title={`PEDRA ${selected}`}
        subtitle="Segunda pedra registrada nos minutos de final 5 (05, 15, 25, 35, 45, 55). Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de segunda pedra do minuto 5 registrado recentemente."
        cycles={a2Min5Cycles}
        pedra={selected}
        now={now}
        detailFormatter={(c) => `2ª min 5 (${String(c.triggerAt.getMinutes()).padStart(2, "0")})`}
      />
      <AnalysisPanel
        key="soma-17"
        eyebrow="Análise 14 · Soma 17 Consecutiva"
        title="SOMA 17"
        subtitle="Gatilho: duas pedras consecutivas somando 17. Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de soma 17 registrado recentemente."
        cycles={aSoma17Cycles}
        pedra={17}
        now={now}
        detailFormatter={(c) => `Soma 17 às ${fmtTime(c.triggerAt)}`}
      />
      <AnalysisPanel
        key="soma-19"
        eyebrow="Análise 15 · Soma 19 Consecutiva"
        title="SOMA 19"
        subtitle="Gatilho: duas pedras consecutivas somando 19. Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de soma 19 registrado recentemente."
        cycles={aSoma19Cycles}
        pedra={19}
        now={now}
        detailFormatter={(c) => `Soma 19 às ${fmtTime(c.triggerAt)}`}
      />
      <AnalysisPanel
        key="soma-21"
        eyebrow="Análise 16 · Soma 21 Consecutiva"
        title="SOMA 21"
        subtitle="Gatilho: duas pedras consecutivas somando 21. Analisa até 14 tempos de Branco."
        loading={loading}
        err={err}
        emptyLabel="Nenhum gatilho de soma 21 registrado recentemente."
        cycles={aSoma21Cycles}
        pedra={21}
        now={now}
        detailFormatter={(c) => `Soma 21 às ${fmtTime(c.triggerAt)}`}
      />
    </main>
  );
}
