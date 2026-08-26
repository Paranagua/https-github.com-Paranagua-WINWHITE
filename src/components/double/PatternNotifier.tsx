import { useEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Play,
  Pause,
  Ban,
  Volume2,
  VolumeX,
  Upload,
  Download,
  Bot,
  Pencil,
  Crown,
  ShieldCheck,
  Eye,
  EyeOff,
  PlusCircle,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "./Card";
import {
  ColorPill,
  COLOR_OPTIONS,
  NUMBER_OPTIONS,
  tokenMatches,
  type Token,
} from "./PatternValidator";
import type { Spin } from "./types";

type Occurrence = { id: string; at: string };

export function PatternNotifier({ spins }: { spins: Spin[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Padrão 1");
  const [pattern, setPattern] = useState<Token[]>([]);
  const [mode, setMode] = useState<"exit" | "no-exit">("exit");
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(true);
  const [timeline, setTimeline] = useState<Spin[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);

  // Initialize seen ids so we only react to spins that arrive after Play
  useEffect(() => {
    if (playing) {
      seenIds.current = new Set(spins.map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Watch new spins
  useEffect(() => {
    if (!playing) return;
    const news: Spin[] = [];
    for (const s of spins) {
      if (!seenIds.current.has(s.id)) {
        seenIds.current.add(s.id);
        news.push(s);
      }
    }
    if (news.length === 0) return;
    setTimeline((prev) => [...news.reverse(), ...prev].slice(0, 60));

    if (pattern.length > 0 && spins.length >= pattern.length) {
      const recent = [...spins.slice(0, pattern.length)].reverse();
      const matched = pattern.every((t, i) => tokenMatches(t, recent[i]));
      const shouldFire = mode === "exit" ? matched : !matched && news.length > 0;
      if (matched && mode === "exit") {
        setOccurrences((o) =>
          [
            {
              id: `${spins[0].id}-${Date.now()}`,
              at: new Date().toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }),
            },
            ...o,
          ].slice(0, 50),
        );
        if (sound) beep();
      }
    }
  }, [spins, playing, pattern, mode, sound]);

  function beep() {
    try {
      const ctx =
        audioRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)();
      audioRef.current = ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start();
      o.stop(ctx.currentTime + 0.45);
    } catch {
      /* noop */
    }
  }

  const addToken = (t: Token) => pattern.length < 800 && setPattern((p) => [...p, t]);

  return (
    <Card className="glass-card overflow-hidden !p-0">
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.05] bg-white/[0.02] px-6 py-5">
        <div className="flex items-center gap-4 text-left">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#FF1F3D]/10 text-[#FF1F3D] shadow-[0_0_15px_rgba(255,31,61,0.1)]">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#FF1F3D] font-outfit">
              Controle de alertas
            </div>
            <h2 className="text-xl font-black text-white font-outfit uppercase tracking-tight">
              Notificador de padrão
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSound((s) => !s)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#9CA3AF] hover:text-white"
            title={sound ? "Silenciar" : "Ativar som"}
          >
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => {
              setPattern([]);
              setOccurrences([]);
              setTimeline([]);
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
            title={open ? "Ocultar painel" : "Abrir painel"}
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
              {pattern.length} pedras • {occurrences.length} ocorrências{" "}
              {playing && "• MONITORANDO"}
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
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

              <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
                <div className="space-y-4">
                  {/* Linha do tempo */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Linha do tempo:
                      </p>
                      <button
                        onClick={() => setTimeline([])}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/5 bg-white/[0.03] text-muted-foreground hover:text-foreground"
                        title="Limpar"
                      >
                        <Ban className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                      {timeline.length === 0 ? (
                        <span className="mx-auto text-xs text-muted-foreground">
                          {playing ? "Aguardando novas pedras…" : "Clique no play para começar"}
                        </span>
                      ) : (
                        timeline.map((s) => (
                          <ColorPill key={s.id} token={{ kind: "number", value: s.n }} />
                        ))
                      )}
                    </div>
                  </div>

                  {/* Padrão */}
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

                  {/* Import/Export/Bot/Validar */}
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
                      <ShieldCheck className="h-3.5 w-3.5" /> VALIDAR
                    </button>
                  </div>

                  {/* Ações */}
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Ações
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      <button
                        onClick={() => setPattern((p) => [...p].reverse())}
                        className="grid place-items-center rounded-lg border border-white/5 bg-white/[0.03] py-2 text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPattern((p) => p.slice(0, -1))}
                        className="grid place-items-center rounded-lg border border-white/5 bg-white/[0.03] py-2 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => pattern.length && addToken(pattern[pattern.length - 1])}
                        className="grid place-items-center rounded-lg border border-white/5 bg-white/[0.03] py-2 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPattern([])}
                        className="grid place-items-center rounded-lg border border-double-red/30 bg-double-red/10 py-2 text-double-red hover:bg-double-red/15"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPlaying((p) => !p)}
                        className={`grid place-items-center rounded-xl py-2 font-black transition ${
                          playing
                            ? "bg-[#FF1F3D] text-white shadow-[0_5px_15px_rgba(255,31,61,0.3)]"
                            : "border border-white/5 bg-white/[0.03] text-[#9CA3AF] hover:text-white"
                        }`}
                        title={playing ? "Pausar" : "Iniciar"}
                      >
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Modo entrada */}
                  <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/5">
                    <button
                      onClick={() => setMode("exit")}
                      className={`inline-flex items-center justify-center gap-1.5 py-3 text-[10px] font-black uppercase tracking-widest transition sm:text-[10px] font-outfit ${
                        mode === "exit"
                          ? "bg-[#FF1F3D] text-white shadow-[0_5px_15px_rgba(255,31,61,0.3)]"
                          : "bg-white/[0.02] text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" /> QUANDO SAIR
                    </button>
                    <button
                      onClick={() => setMode("no-exit")}
                      className={`inline-flex items-center justify-center gap-1.5 py-3 text-[10px] font-black uppercase tracking-widest transition sm:text-[10px] font-outfit ${
                        mode === "no-exit"
                          ? "bg-[#FF1F3D] text-white shadow-[0_5px_15px_rgba(255,31,61,0.3)]"
                          : "bg-white/[0.02] text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      <Circle className="h-4 w-4" /> QUANDO NÃO SAIR
                    </button>
                  </div>

                  {/* Cores */}
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

                  {/* Números */}
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
                </div>

                {/* Ocorrências */}
                <aside className="rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Ocorrências:
                    </p>
                    <button
                      onClick={() => setOccurrences([])}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/5 bg-white/[0.03] text-muted-foreground hover:text-foreground"
                    >
                      <Ban className="h-3 w-3" />
                    </button>
                  </div>
                  {occurrences.length === 0 ? (
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhuma ocorrência detectada
                    </div>
                  ) : (
                    <ul className="max-h-64 space-y-1.5 overflow-auto">
                      {occurrences.map((o) => (
                        <li
                          key={o.id}
                          className="flex items-center justify-between rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-[11px] font-semibold text-positive"
                        >
                          <span>Padrão detectado</span>
                          <span className="tabular-nums">{o.at}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
