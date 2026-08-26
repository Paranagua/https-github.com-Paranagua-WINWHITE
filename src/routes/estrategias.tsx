import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Cpu,
  Power,
  ShieldCheck,
  RotateCcw,
  Info,
  SlidersHorizontal,
  ListChecks,
  Search,
  XCircle,
  RefreshCw,
  CheckCircle2,
  Flame,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/double/Card";
import { ResultCircle } from "@/components/double/ResultCircle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/estrategias")({
  head: () => ({
    meta: [
      { title: "Catalogador de Estratégias — Freitas da Blaze" },
      {
        name: "description",
        content: "Analise padrões e automatize entradas baseadas em estatísticas.",
      },
    ],
  }),
  component: EstrategiasPage,
});

type Dot = "red" | "black" | "white" | "empty";
type Tile = "W" | "G1" | "G2" | "H";

type Strategy = {
  id: number;
  pattern: Dot[];
  target: Dot;
  streak?: number;
  assertividade: number;
  gale: "G1" | "G2";
  history: Tile[];
};

const DOT_STYLE: Record<Dot, React.CSSProperties> = {
  red: { background: "var(--gradient-red)", boxShadow: "var(--shadow-tile)" },
  black: { background: "var(--gradient-black)", boxShadow: "var(--shadow-tile)" },
  white: {
    background: "var(--gradient-white)",
    boxShadow: "0 0 10px oklch(1 0 0 / 0.35), var(--shadow-tile)",
  },
  empty: { background: "transparent" },
};
const DOT_RING: Record<Dot, string> = {
  red: "ring-1 ring-white/10",
  black: "ring-1 ring-white/10",
  white: "ring-1 ring-white/40",
  empty: "ring-1 ring-white/15 border border-dashed border-white/15",
};

const TILE_CLASS: Record<Tile, string> = {
  W: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  G1: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  G2: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  H: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

function seeded(i: number, n: number) {
  return Math.abs(Math.sin(i * 999 + n * 17));
}

function genStrategies(): Strategy[] {
  const list: Strategy[] = [];
  for (let i = 1; i <= 48; i++) {
    const pattern: Dot[] = Array.from({ length: 5 }, (_, k) => {
      const r = seeded(i, k);
      if (r < 0.5) return "red";
      if (r < 0.85) return "black";
      return "white";
    });
    const trgR = seeded(i, 99);
    const target: Dot = trgR < 0.15 ? "white" : trgR < 0.6 ? "red" : "black";
    const streak = seeded(i, 5) < 0.35 ? Math.floor(seeded(i, 6) * 60) + 5 : undefined;
    const assert = Math.max(85, 100 - Math.floor(seeded(i, 7) * 16));
    const history: Tile[] = Array.from({ length: 9 + Math.floor(seeded(i, 8) * 4) }, (_, k) => {
      const r = seeded(i, k + 30);
      if (r < 0.55) return "W";
      if (r < 0.78) return "G1";
      if (r < 0.92) return "G2";
      return "H";
    });
    list.push({ id: i, pattern, target, streak, assertividade: assert, gale: "G2", history });
  }
  return list.sort((a, b) => b.assertividade - a.assertividade);
}

const ALL_STRATEGIES = genStrategies();

export default function EstrategiasPage() {
  const [robotOn, setRobotOn] = useState(false);
  const [gale, setGale] = useState<"sem" | "g1" | "g2">("g2");
  const [minAssert, setMinAssert] = useState(0);
  const [maxAssert, setMaxAssert] = useState(100);
  const [mode, setMode] = useState("manual");
  const [qty, setQty] = useState("todas");
  const [rounds, setRounds] = useState("500");
  const [orderBy, setOrderBy] = useState("taxa");

  const filtered = useMemo(
    () =>
      ALL_STRATEGIES.filter(
        (s) => s.assertividade >= minAssert && s.assertividade <= (maxAssert || 100),
      ),
    [minAssert, maxAssert],
  );

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] tracking-widest text-muted-foreground font-mono">
              [ PATTERN · CATALOG <span className="text-red-500">●</span> ]
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-400">
              <Cpu className="h-4 w-4" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              Catalogador de Estratégias
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Analise padrões e automatize entradas baseadas em estatísticas.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-2">
          <button
            onClick={() => setRobotOn((v) => !v)}
            className={`grid h-10 w-10 place-items-center rounded-full ${robotOn ? "bg-emerald-500 text-black" : "bg-surface-2 text-muted-foreground"}`}
          >
            <Power className="h-4 w-4" />
          </button>
          <div className="text-xs leading-tight">
            <div className="text-muted-foreground">ROBÔ · ESTRATÉGIAS</div>
            <div
              className={`font-black text-base ${robotOn ? "text-emerald-400" : "text-muted-foreground"}`}
            >
              {robotOn ? "ON" : "OFF"}
            </div>
          </div>
        </div>
      </div>

      {/* Regras de Controle */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <h2 className="font-bold text-lg">Regras de Controle por Estratégia</h2>
          </div>
          <Button
            variant="outline"
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            <RotateCcw className="h-4 w-4" /> Resetar e Reativar
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5">
          <RuleColumn
            dot="text-red-400"
            label="LOSS · STREAK"
            icon={<XCircle className="h-4 w-4" />}
            value={0}
            desc="Pausa a estratégia ao atingir o limite de losses consecutivos."
            options={[
              "Meta Unificada (soma de todas as estratégias)",
              "Reativar somente no dia seguinte",
            ]}
          />
          <RuleColumn
            dot="text-teal-400"
            label="RECOVERY · WINS"
            icon={<RefreshCw className="h-4 w-4" />}
            value={5}
            desc="Após o limite de perdas, aguarda X vitórias consecutivas para reativar a estratégia."
            options={["Reativar somente com 100% Win Rate"]}
          />
          <RuleColumn
            dot="text-emerald-400"
            label="WIN · TARGET"
            icon={<CheckCircle2 className="h-4 w-4" />}
            value={0}
            desc="Pausa a estratégia após bater a meta de wins acumulados."
            options={[
              "Meta Unificada (soma de todas as estratégias)",
              "Reativar somente no dia seguinte",
            ]}
          />
        </div>
      </Card>

      {/* Filtros + Estratégias */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Filtros */}
        <Card className="!p-0 overflow-hidden h-fit">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border border-t-2 border-t-red-500">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-red-500/10 text-red-400">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <h2 className="font-bold text-lg leading-tight">
              Filtros do
              <br />
              Catalogador
            </h2>
          </div>

          <div className="p-5 space-y-5">
            <Field
              label="MODO DE OPERAÇÃO"
              hint="Você seleciona manualmente os padrões que deseja operar."
            >
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual (Padrões Fixos)</SelectItem>
                  <SelectItem value="auto">Automático</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="QUANTIDADE DE PADRÕES">
              <Select value={qty} onValueChange={setQty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="top10">Top 10</SelectItem>
                  <SelectItem value="top20">Top 20</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="ANALISAR ÚLTIMAS RODADAS">
              <Select value={rounds} onValueChange={setRounds}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 Rodadas</SelectItem>
                  <SelectItem value="300">300 Rodadas</SelectItem>
                  <SelectItem value="500">500 Rodadas</SelectItem>
                  <SelectItem value="1000">1000 Rodadas</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="ORDENAR POR">
              <Select value={orderBy} onValueChange={setOrderBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="taxa">Taxa de Acerto (%)</SelectItem>
                  <SelectItem value="ocorrencias">Ocorrências</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div>
              <label className="text-[10px] tracking-widest font-mono text-muted-foreground">
                GALE
              </label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["sem", "g1", "g2"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGale(g)}
                    className={`rounded-lg border py-3 text-xs font-bold ${
                      gale === g
                        ? "border-red-500/50 bg-red-500/15 text-red-300"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {g === "sem" ? "Sem\nGale" : g === "g1" ? "Gale 1" : "Gale 2"}
                  </button>
                ))}
              </div>
            </div>

            <Field label="MÍNIMO DE ASSERTIVIDADE (%)">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">%</span>
                <Input
                  type="number"
                  value={minAssert}
                  onChange={(e) => setMinAssert(Number(e.target.value) || 0)}
                />
              </div>
            </Field>

            <Field label="MÁXIMO DE ASSERTIVIDADE (%)">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">%</span>
                <Input
                  type="number"
                  value={maxAssert}
                  onChange={(e) => setMaxAssert(Number(e.target.value) || 0)}
                />
              </div>
            </Field>

            <Button className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl h-11 shadow-lg shadow-red-500/30">
              <Search className="h-4 w-4" /> Buscar Estratégias
            </Button>
          </div>
        </Card>

        {/* Estratégias Encontradas */}
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border border-t-2 border-t-red-500">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-red-500/10 text-red-400">
                <ListChecks className="h-4 w-4" />
              </div>
              <h2 className="font-bold text-lg">Estratégias Encontradas</h2>
            </div>
            <div className="text-[11px] tracking-widest font-mono text-amber-300 border border-amber-500/40 rounded-full px-3 py-1">
              [ ● {filtered.length} ESTRATÉGIAS ]
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 p-4">
            {filtered.map((s) => (
              <StrategyCard key={s.id} s={s} />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-14 text-center text-sm text-muted-foreground">
                Nenhuma estratégia dentro do intervalo de assertividade.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StrategyCard({ s }: { s: Strategy }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4 hover:border-red-500/40 transition-colors">
      {/* Pattern row */}
      <div className="flex items-center gap-1.5 mb-3">
        {s.pattern.map((d, i) => (
          <Stone key={i} dot={d} />
        ))}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-0.5" />
        <span className="relative">
          <Stone dot={s.target} highlight />
        </span>
        {s.streak && (
          <span className="ml-1 rounded-md bg-surface-2 border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {s.streak}×
          </span>
        )}
      </div>

      {/* Stat */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-2xl font-black text-emerald-400 leading-none">
            {s.assertividade}%
          </div>
          <div className="text-[10px] tracking-widest font-mono text-muted-foreground mt-1">
            ASSERTIVIDADE
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono text-muted-foreground">
            #{String(s.id).padStart(2, "0")}
          </div>
          <div className="text-[10px] tracking-widest font-mono text-muted-foreground">
            {s.gale}
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <div className="text-[9px] tracking-widest font-mono text-muted-foreground mb-1.5">
          ÚLTIMOS RESULTADOS
        </div>
        <div className="grid grid-cols-4 gap-1">
          {s.history.map((t, i) => (
            <span
              key={i}
              className={`h-6 grid place-items-center rounded-md border text-[10px] font-bold font-mono ${TILE_CLASS[t]}`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stone({ dot, highlight = false }: { dot: Dot; highlight?: boolean }) {
  if (dot === "empty") {
    return (
      <span className="h-7 w-7 rounded-full ring-1 ring-white/15 border border-dashed border-white/15" />
    );
  }
  return (
    <span className={highlight ? "ring-2 ring-white/50 rounded-full" : ""}>
      <ResultCircle color={dot} size="sm" animate={false} />
    </span>
  );
}

function RuleColumn({
  dot,
  label,
  icon,
  value,
  desc,
  options,
}: {
  dot: string;
  label: string;
  icon: React.ReactNode;
  value: number;
  desc: string;
  options: string[];
}) {
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 text-[10px] tracking-widest font-mono ${dot}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {label}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 h-11">
        <span className="text-muted-foreground">{icon}</span>
        <Input
          type="number"
          defaultValue={value}
          className="flex-1 border-0 bg-transparent p-0 h-auto focus-visible:ring-0 shadow-none"
        />
        <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
      {options.map((opt) => (
        <label
          key={opt}
          className="flex items-start gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2.5 cursor-pointer"
        >
          <Checkbox className="mt-0.5" />
          <span className="text-xs text-muted-foreground flex-1">{opt}</span>
          <Info className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5" />
        </label>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] tracking-widest font-mono text-muted-foreground">{label}</label>
      <div className="mt-2">{children}</div>
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-1.5">{hint}</p>}
    </div>
  );
}
