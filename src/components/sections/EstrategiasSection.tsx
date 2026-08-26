import { useEffect, useMemo, useState } from "react";
import { Loader2, Target, TrendingUp, RotateCcw } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { Card } from "@/components/double/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = { id: number; roll: string; color: string; created_at: string };
type C = "R" | "B" | "W";

type StrategyId = "s1" | "s2" | "s3" | "s4" | "s5" | "s6";

type Strategy = {
  id: StrategyId;
  name: string;
  desc: string;
  /**
   * Recebe a sequência de cores em ORDEM CRONOLÓGICA (mais antigo → mais novo)
   * até o índice i (inclusive). Retorna a cor apostada se a regra dispara ali,
   * ou null.
   */
  trigger: (seq: C[], i: number) => "R" | "B" | null;
};

const STRATEGIES: Strategy[] = [
  {
    id: "s1",
    name: "A Quebra do 3",
    desc: "3 cores iguais → aposta na oposta",
    trigger: (s, i) => {
      if (i < 2) return null;
      const a = s[i - 2],
        b = s[i - 1],
        c = s[i];
      if (a === "W" || b === "W" || c === "W") return null;
      if (a === b && b === c) return a === "R" ? "B" : "R";
      return null;
    },
  },
  {
    id: "s2",
    name: "Espera o 4, Entra no 5",
    desc: "4 cores iguais → aposta na oposta",
    trigger: (s, i) => {
      if (i < 3) return null;
      const w = s.slice(i - 3, i + 1);
      if (w.some((x) => x === "W")) return null;
      if (w.every((x) => x === w[0])) return w[0] === "R" ? "B" : "R";
      return null;
    },
  },
  {
    id: "s3",
    name: "O Dobradinho (Alternância)",
    desc: "Alternância ABA → aposta na cor repetida (A)",
    trigger: (s, i) => {
      if (i < 2) return null;
      const a = s[i - 2],
        b = s[i - 1],
        c = s[i];
      if (a === "W" || b === "W" || c === "W") return null;
      if (a === c && a !== b) return a as "R" | "B";
      return null;
    },
  },
  {
    id: "s4",
    name: "A Tríplice Cor (AAB)",
    desc: "AAB → aposta em A (cor que apareceu 2×)",
    trigger: (s, i) => {
      if (i < 2) return null;
      const a = s[i - 2],
        b = s[i - 1],
        c = s[i];
      if (a === "W" || b === "W" || c === "W") return null;
      if (a === b && b !== c) return a as "R" | "B";
      return null;
    },
  },
  {
    id: "s5",
    name: "A Tendência Forte",
    desc: "5+ cores iguais → segue a mesma cor",
    trigger: (s, i) => {
      if (i < 4) return null;
      const w = s.slice(i - 4, i + 1);
      if (w.some((x) => x === "W")) return null;
      if (w.every((x) => x === w[0])) return w[0] as "R" | "B";
      return null;
    },
  },
  {
    id: "s6",
    name: "A Quebra do 5",
    desc: "5 cores iguais → aposta na oposta",
    trigger: (s, i) => {
      if (i < 4) return null;
      const w = s.slice(i - 4, i + 1);
      if (w.some((x) => x === "W")) return null;
      if (w.every((x) => x === w[0])) return w[0] === "R" ? "B" : "R";
      return null;
    },
  },
];

function toC(color: string): C {
  const s = (color ?? "").toLowerCase();
  if (s === "red") return "R";
  if (s === "black") return "B";
  return "W";
}

type Entry = {
  atIdx: number; // índice do gatilho na seq
  bet: "R" | "B";
  result: C | null; // cor da rodada seguinte (null se ainda não saiu)
  hit: boolean | null;
};

function evaluate(strategy: Strategy, seq: C[]): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < seq.length; i++) {
    const bet = strategy.trigger(seq, i);
    if (!bet) continue;
    const next = seq[i + 1] ?? null;
    entries.push({
      atIdx: i,
      bet,
      result: next,
      hit: next === null ? null : next === "W" ? false : next === bet,
    });
  }
  return entries;
}

const SAMPLE_OPTS = [50, 100, 200, 500, 0] as const;

export default function EstrategiasSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<StrategyId>("s1");
  const [sample, setSample] = useState<number>(100);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("blaze_results")
        .select("id, roll, color, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (!alive) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setRows(((data ?? []) as Row[]).slice().reverse());
      setErr(null);
      setLoading(false);
    };
    load();
    const t = setInterval(() => {
      setTick((n) => n + 1);
      load();
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const fullSeq = useMemo(() => rows.map((r) => toC(r.color)), [rows]);
  const seq = useMemo(() => (sample === 0 ? fullSeq : fullSeq.slice(-sample)), [fullSeq, sample]);

  const strategy = STRATEGIES.find((s) => s.id === selected)!;
  const entries = useMemo(() => evaluate(strategy, seq), [strategy, seq]);

  const closed = entries.filter((e) => e.hit !== null);
  const hits = closed.filter((e) => e.hit).length;
  const misses = closed.length - hits;
  const rate = closed.length ? (hits / closed.length) * 100 : 0;

  // Sugestão atual: aplica trigger no último índice
  const currentBet = seq.length ? strategy.trigger(seq, seq.length - 1) : null;

  const last10 = closed.slice(-10);
  const last20Colors = fullSeq.slice(-20);

  // Gráfico: taxa acumulada ao longo das entradas
  const chartData = useMemo(() => {
    let h = 0;
    let t = 0;
    return closed.map((e, i) => {
      t++;
      if (e.hit) h++;
      return { n: i + 1, taxa: Number(((h / t) * 100).toFixed(1)) };
    });
  }, [closed]);

  // Assertividade de todas estratégias (pra tabela comparativa)
  const allStats = useMemo(
    () =>
      STRATEGIES.map((s) => {
        const e = evaluate(s, seq).filter((x) => x.hit !== null);
        const h = e.filter((x) => x.hit).length;
        return {
          id: s.id,
          name: s.name,
          total: e.length,
          hits: h,
          rate: e.length ? (h / e.length) * 100 : 0,
        };
      }),
    [seq],
  );

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-10">
      <Card
        delay={0}
        icon={<Target className="h-4 w-4" />}
        title="Estratégias Personalizadas"
        subtitle="Padrões de cor com assertividade em tempo real"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selected} onValueChange={(v) => setSelected(v as StrategyId)}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(sample)} onValueChange={(v) => setSample(Number(v))}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAMPLE_OPTS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 0 ? "Todo histórico" : `Últimos ${n}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => setTick((t) => t + 1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-muted-foreground hover:bg-white/[0.06]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Atualizar
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
          </div>
        ) : err ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {err}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Descrição */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Regra
              </div>
              <div className="mt-1 text-sm text-foreground">{strategy.desc}</div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Assertividade" value={`${rate.toFixed(1)}%`} accent="emerald" />
              <Kpi label="Entradas" value={String(closed.length)} />
              <Kpi label="Acertos" value={String(hits)} accent="emerald" />
              <Kpi label="Erros" value={String(misses)} accent="red" />
            </div>

            {/* Sugestão atual + últimos resultados */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Sugestão de aposta agora
                </div>
                {currentBet ? (
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      className={`grid h-12 w-12 place-items-center rounded-full text-lg font-black text-white ${
                        currentBet === "R" ? "bg-red-500" : "bg-neutral-800 ring-1 ring-white/20"
                      }`}
                    >
                      {currentBet === "R" ? "🔴" : "⚫"}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        Apostar em {currentBet === "R" ? "Vermelho" : "Preto"}
                      </div>
                      <div className="text-xs text-muted-foreground">Padrão engatilhado</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-muted-foreground">
                    Nenhum padrão engatilhado no momento.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Últimas 10 entradas
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {last10.length === 0 && (
                    <span className="text-xs text-muted-foreground">Sem entradas ainda.</span>
                  )}
                  {last10.map((e, i) => (
                    <span
                      key={i}
                      className={`grid h-7 w-7 place-items-center rounded-md text-xs font-bold ${
                        e.hit ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                      }`}
                      title={`Aposta ${e.bet === "R" ? "🔴" : "⚫"} → ${e.result ?? "?"}`}
                    >
                      {e.hit ? "✅" : "❌"}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Histórico de cores */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Histórico (últimas 20)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {last20Colors.map((c, i) => (
                  <span
                    key={i}
                    className={`h-6 w-6 rounded-full ${
                      c === "R"
                        ? "bg-red-500"
                        : c === "B"
                          ? "bg-neutral-800 ring-1 ring-white/20"
                          : "bg-white"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Gráfico */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Evolução da assertividade
              </div>
              <div className="h-56 w-full">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="n" stroke="#888" fontSize={11} />
                      <YAxis domain={[0, 100]} stroke="#888" fontSize={11} unit="%" />
                      <Tooltip
                        contentStyle={{
                          background: "#0b0b0b",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="taxa"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">
                    Dados insuficientes.
                  </div>
                )}
              </div>
            </div>

            {/* Comparativo */}
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <div className="border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Comparativo — todas as estratégias
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Estratégia</th>
                    <th className="px-3 py-2 text-right font-medium">Entradas</th>
                    <th className="px-3 py-2 text-right font-medium">Acertos</th>
                    <th className="px-3 py-2 text-right font-medium">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {allStats.map((s) => (
                    <tr
                      key={s.id}
                      className={`cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.03] ${
                        s.id === selected ? "bg-emerald-500/5" : ""
                      }`}
                      onClick={() => setSelected(s.id)}
                    >
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.hits}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold tabular-nums ${
                          s.rate >= 60
                            ? "text-emerald-400"
                            : s.rate >= 50
                              ? "text-amber-300"
                              : "text-red-300"
                        }`}
                      >
                        {s.rate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "red"
        ? "text-red-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}
