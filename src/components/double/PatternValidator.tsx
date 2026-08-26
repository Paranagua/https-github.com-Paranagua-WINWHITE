import { useMemo, useState } from "react";
import {
  ShieldCheck,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle2,
  Circle,
  Bell,
  Bot,
  Upload,
  Download,
  Pencil,
  Crown,
  Minus,
  Plus,
  Eye,
  EyeOff,
  HelpCircle,
  PlusCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Card } from "./Card";
import { ResultCircle } from "./ResultCircle";
import type { Spin, Color } from "./types";

export type Token =
  | { kind: "color"; value: Color | "red-black" | "red-white" | "black-white" | "any" }
  | { kind: "number"; value: number };

const NUM_COLOR: Record<number, Color> = {
  0: "white",
  1: "red",
  2: "red",
  3: "red",
  4: "red",
  5: "red",
  6: "red",
  7: "red",
  8: "black",
  9: "black",
  10: "black",
  11: "black",
  12: "black",
  13: "black",
  14: "black",
};

function dotClass(c: Color) {
  return c === "red" ? "bg-double-red" : c === "black" ? "bg-double-black" : "bg-white";
}

const GRAD: Record<Color, string> = {
  red: "var(--gradient-red)",
  black: "var(--gradient-black)",
  white: "var(--gradient-white)",
};

export function ColorPill({ token, size = 28 }: { token: Token; size?: number }) {
  if (token.kind === "number") {
    return (
      <ResultCircle color={NUM_COLOR[token.value]} n={token.value} size="sm" animate={false} />
    );
  }
  const v = token.value;
  const style: React.CSSProperties = {
    width: size,
    height: size,
    boxShadow: "var(--shadow-tile)",
  };
  const ring = "ring-1 ring-white/10";
  if (v === "red" || v === "black" || v === "white") {
    return (
      <span
        className={`inline-block rounded-full ${ring}`}
        style={{ ...style, background: GRAD[v] }}
      />
    );
  }
  const [a, b]: [Color, Color] =
    v === "red-black"
      ? ["red", "black"]
      : v === "red-white"
        ? ["red", "white"]
        : v === "black-white"
          ? ["black", "white"]
          : ["red", "black"]; // any → red/black with white dot overlay
  return (
    <span className={`relative inline-block overflow-hidden rounded-full ${ring}`} style={style}>
      <span
        className="absolute inset-0"
        style={{ background: GRAD[a], clipPath: "polygon(0 0,100% 0,0 100%)" }}
      />
      <span
        className="absolute inset-0"
        style={{ background: GRAD[b], clipPath: "polygon(100% 0,100% 100%,0 100%)" }}
      />
      {v === "any" && (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: size * 0.32, height: size * 0.32, background: GRAD.white }}
        />
      )}
    </span>
  );
}

export function tokenMatches(t: Token, spin: Spin): boolean {
  if (t.kind === "number") return spin.n === t.value;
  const v = t.value;
  if (v === "any") return true;
  if (v === "red" || v === "black" || v === "white") return spin.color === v;
  if (v === "red-black") return spin.color === "red" || spin.color === "black";
  if (v === "red-white") return spin.color === "red" || spin.color === "white";
  if (v === "black-white") return spin.color === "black" || spin.color === "white";
  return false;
}

type Target =
  | { kind: "color"; value: Color }
  | { kind: "group"; value: "red-black" | "red-white" | "black-white" };

function targetMatches(t: Target, spin: Spin): boolean {
  if (t.kind === "color") return spin.color === t.value;
  if (t.value === "red-black") return spin.color === "red" || spin.color === "black";
  if (t.value === "red-white") return spin.color === "red" || spin.color === "white";
  return spin.color === "black" || spin.color === "white";
}

export const COLOR_OPTIONS: Token[] = [
  { kind: "color", value: "any" },
  { kind: "color", value: "red" },
  { kind: "color", value: "black" },
  { kind: "color", value: "white" },
  { kind: "color", value: "red-black" },
  { kind: "color", value: "black-white" },
  { kind: "color", value: "red-white" },
];

export const NUMBER_OPTIONS: Token[] = [
  { kind: "number", value: 0 },
  ...Array.from({ length: 14 }, (_, i) => ({ kind: "number" as const, value: i + 1 })),
];

const TARGETS: { label: string; value: Target; dot: Color | "group" }[] = [
  { label: "Vermelhos", value: { kind: "color", value: "red" }, dot: "red" },
  { label: "Pretos", value: { kind: "color", value: "black" }, dot: "black" },
  { label: "Branco", value: { kind: "color", value: "white" }, dot: "white" },
];

type Stats = {
  wins: number;
  winsNoGale: number;
  winsG1: number;
  winsG2: number;
  losses: number;
  streakW: number;
  streakL: number;
  total: number;
};

function evaluate(spins: Spin[], pattern: Token[], target: Target, gales: number): Stats {
  const s: Stats = {
    wins: 0,
    winsNoGale: 0,
    winsG1: 0,
    winsG2: 0,
    losses: 0,
    streakW: 0,
    streakL: 0,
    total: 0,
  };
  if (pattern.length === 0 || spins.length < pattern.length + 1) return s;
  // chronological order (oldest → newest)
  const chrono = [...spins].reverse();
  let curW = 0,
    curL = 0;
  for (let i = 0; i <= chrono.length - pattern.length - 1; i++) {
    const window = chrono.slice(i, i + pattern.length);
    const ok = pattern.every((t, k) => tokenMatches(t, window[k]));
    if (!ok) continue;
    s.total++;
    let won = false;
    let usedGale = -1;
    for (let g = 0; g <= gales; g++) {
      const next = chrono[i + pattern.length + g];
      if (!next) break;
      if (targetMatches(target, next)) {
        won = true;
        usedGale = g;
        break;
      }
    }
    if (won) {
      s.wins++;
      if (usedGale === 0) s.winsNoGale++;
      else if (usedGale === 1) s.winsG1++;
      else if (usedGale >= 2) s.winsG2++;
      curW++;
      curL = 0;
    } else {
      s.losses++;
      curL++;
      curW = 0;
    }
    if (curW > s.streakW) s.streakW = curW;
    if (curL > s.streakL) s.streakL = curL;
  }
  return s;
}

function pct(a: number, b: number) {
  if (!b) return "0.00%";
  return `${((a / b) * 100).toFixed(2)}%`;
}

export function PatternValidator({ spins }: { spins: Spin[] }) {
  const [mode, setMode] = useState<"exit" | "no-exit">("exit");
  const [statsMode, setStatsMode] = useState<"individual" | "analytical">("individual");
  const [pattern, setPattern] = useState<Token[]>([]);
  const [target, setTarget] = useState<Target>({ kind: "color", value: "red" });
  const [gales, setGales] = useState(2);
  const [name, setName] = useState("Padrão 1");
  const [open, setOpen] = useState(false);

  const stats = useMemo(
    () => evaluate(spins, pattern, target, gales),
    [spins, pattern, target, gales],
  );

  const currentlyMatches = useMemo(() => {
    if (pattern.length === 0 || spins.length < pattern.length) return false;
    const recent = [...spins.slice(0, pattern.length)].reverse();
    return pattern.every((t, i) => tokenMatches(t, recent[i]));
  }, [spins, pattern]);

  const addToken = (t: Token) => {
    if (pattern.length >= 800) return;
    setPattern((p) => [...p, t]);
  };

  return (
    <Card className="glass-card overflow-hidden !p-0">
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.05] bg-white/[0.02] px-6 py-5">
        <div className="flex items-center gap-4 text-left">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#FF1F3D]/10 text-[#FF1F3D] shadow-[0_0_15px_rgba(255,31,61,0.1)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#FF1F3D] font-outfit">
              Auditoria de estratégia
            </div>
            <h2 className="text-xl font-black text-white font-outfit uppercase tracking-tight">
              Validador de padrão
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPattern([]);
              setOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF1F3D] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_5px_15px_rgba(255,31,61,0.3)] hover:opacity-90 font-outfit"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">NOVO</span>
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#9CA3AF] hover:text-white"
          >
            {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="p-6">
        <AnimatePresence initial={false} mode="wait">
          {!open ? (
            <motion.div
              key="closed"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center py-4 text-xs font-black uppercase tracking-widest text-[#9CA3AF] font-outfit"
            >
              {pattern.length} pedras • {stats.wins}V / {stats.losses}D{" "}
              {currentlyMatches && "• ATIVO"}
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {/* Header row: name + premium hint */}
              <div className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/30">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-20 bg-transparent outline-none"
                  />
                  <Pencil className="h-3 w-3 opacity-70 shrink-0" />
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">Seja premium e gerencie múltiplos padrões</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
                {/* LEFT: builder */}
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Padrão:
                    </p>
                    <div className="flex min-h-14 flex-wrap items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      {pattern.length === 0 ? (
                        <span className="mx-auto text-xs text-muted-foreground">
                          Clique nas cores ou números para definir um padrão
                        </span>
                      ) : (
                        pattern.map((t, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPattern((p) => p.filter((_, j) => j !== i))}
                            className="transition hover:scale-95"
                            title="Remover"
                          >
                            <ColorPill token={t} />
                          </button>
                        ))
                      )}
                    </div>
                    <div className="mx-auto mt-2 w-fit rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {pattern.length} / 800
                    </div>
                  </div>

                  {/* Import / Export / Bot / Notify */}
                  <div className="grid grid-cols-2 gap-2">
                    <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                      <Upload className="h-3.5 w-3.5" /> EXPORTAR
                    </button>
                    <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                      <Download className="h-3.5 w-3.5" /> IMPORTAR
                    </button>
                    <button className="relative inline-flex items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground opacity-60">
                      <Bot className="h-3.5 w-3.5" /> + BOT
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                        PREMIUM
                      </span>
                    </button>
                    <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                      <Bell className="h-3.5 w-3.5" /> NOTIFICAR
                    </button>
                  </div>

                  {/* Ações */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Ações
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => setPattern((p) => [...p].reverse())}
                        className="grid place-items-center rounded-lg border border-white/5 bg-white/[0.03] py-2 text-muted-foreground hover:text-foreground"
                        title="Inverter"
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPattern((p) => p.slice(0, -1))}
                        className="grid place-items-center rounded-lg border border-white/5 bg-white/[0.03] py-2 text-muted-foreground hover:text-foreground"
                        title="Remover último"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => pattern.length && addToken(pattern[pattern.length - 1])}
                        className="grid place-items-center rounded-lg border border-white/5 bg-white/[0.03] py-2 text-muted-foreground hover:text-foreground"
                        title="Repetir último"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPattern([])}
                        className="grid place-items-center rounded-lg border border-double-red/30 bg-double-red/10 py-2 text-double-red hover:bg-double-red/15"
                        title="Limpar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Modo entrada */}
                  <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/5">
                    <button
                      onClick={() => setMode("exit")}
                      className={`inline-flex items-center justify-center gap-1.5 px-2 py-3 text-[10px] font-black uppercase tracking-widest transition sm:text-[10px] font-outfit ${
                        mode === "exit"
                          ? "bg-[#FF1F3D] text-white shadow-[0_5px_15px_rgba(255,31,61,0.3)]"
                          : "bg-white/[0.03] text-[#9CA3AF]"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">QUANDO SAIR</span>
                    </button>
                    <button
                      onClick={() => setMode("no-exit")}
                      className={`inline-flex items-center justify-center gap-1.5 px-2 py-3 text-[10px] font-black uppercase tracking-widest transition sm:text-[10px] font-outfit ${
                        mode === "no-exit"
                          ? "bg-[#FF1F3D] text-white shadow-[0_5px_15px_rgba(255,31,61,0.3)]"
                          : "bg-white/[0.03] text-[#9CA3AF]"
                      }`}
                    >
                      <Circle className="h-4 w-4 shrink-0" />
                      <span className="truncate">QUANDO NÃO SAIR</span>
                    </button>
                  </div>

                  {/* Montar usando cores */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Montar usando cores:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => addToken(t)}
                          className="rounded-md p-1 ring-1 ring-white/5 transition hover:ring-primary/40"
                        >
                          <ColorPill token={t} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Montar usando números */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Montar usando números:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {NUMBER_OPTIONS.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => addToken(t)}
                          className="transition hover:scale-95"
                        >
                          <ColorPill token={t} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gales + Vitória */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Gales:
                      </p>
                      <div className="inline-flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5">
                        <button
                          onClick={() => setGales((g) => Math.max(0, g - 1))}
                          className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-semibold">{gales}</span>
                        <button
                          onClick={() => setGales((g) => Math.min(5, g + 1))}
                          className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Vitória em:
                      </p>
                      <div className="flex gap-1">
                        {TARGETS.map((tg) => (
                          <button
                            key={tg.label}
                            onClick={() => setTarget(tg.value)}
                            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition ${
                              JSON.stringify(target) === JSON.stringify(tg.value)
                                ? "border-primary/50 bg-primary/10 text-foreground"
                                : "border-white/5 bg-white/[0.03] text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${dotClass(tg.dot as Color)}`}
                            />
                            {tg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {currentlyMatches && (
                    <div className="flex items-center gap-2 rounded-xl border border-positive/40 bg-positive/10 px-3 py-2 text-xs font-semibold text-positive">
                      <CheckCircle2 className="h-4 w-4" />
                      Padrão ativo agora — entrada em{" "}
                      {target.kind === "color" ? target.value : target.value}
                    </div>
                  )}
                </div>

                {/* RIGHT: stats */}
                <aside className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:p-4">
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1 text-[11px] sm:text-xs">
                    <button
                      onClick={() => setStatsMode("individual")}
                      className={`rounded-md px-2 py-1.5 font-medium transition ${
                        statsMode === "individual"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      onClick={() => setStatsMode("analytical")}
                      className={`rounded-md px-2 py-1.5 font-medium transition ${
                        statsMode === "analytical"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      Analítico
                    </button>
                  </div>

                  <StatRow
                    label="Vitórias:"
                    value={stats.wins}
                    pct={pct(stats.wins, stats.total)}
                  />
                  <StatRow label="Seq. vitórias:" value={stats.streakW} />
                  <StatRow
                    label="Vitória (sem gale):"
                    value={stats.winsNoGale}
                    pct={pct(stats.winsNoGale, stats.total)}
                  />
                  <StatRow
                    label="Vitória (gale 1):"
                    value={stats.winsG1}
                    pct={pct(stats.winsG1, stats.total)}
                  />
                  <StatRow
                    label="Vitória (gale 2):"
                    value={stats.winsG2}
                    pct={pct(stats.winsG2, stats.total)}
                  />
                  <StatRow
                    label="Derrotas:"
                    value={stats.losses}
                    pct={pct(stats.losses, stats.total)}
                  />
                  <StatRow label="Seq. derrotas:" value={stats.streakL} />
                </aside>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function StatRow({ label, value, pct }: { label: string; value: number; pct?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-white/5 pb-1.5 text-[11px] last:border-0 sm:text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="min-w-[1.75rem] rounded-md bg-white/5 px-1.5 py-0.5 text-center font-semibold tabular-nums">
          {value}
        </span>
        {pct !== undefined && (
          <>
            <span className="text-muted-foreground">•</span>
            <span className="min-w-[3rem] rounded-md bg-white/5 px-1.5 py-0.5 text-center font-semibold tabular-nums">
              {pct}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
