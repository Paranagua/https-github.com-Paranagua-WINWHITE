import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Radio, Target } from "lucide-react";
import { Card } from "./Card";
import type { Spin } from "./types";

type Props = {
  spins: Spin[];
};

function parseTime(t: string): { h: number; m: number } | null {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

function addMinutes(base: { h: number; m: number }, add: number): string {
  const total = base.h * 60 + base.m + add;
  const h = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(h / 60)).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}`;
}

export function SignalGenerator({ spins }: Props) {
  const [signal, setSignal] = useState<{ base: string; entries: string[] } | null>(null);
  const [error, setError] = useState<string>("");
  const [showEntries, setShowEntries] = useState(true);

  useEffect(() => {
    if (signal) setShowEntries(true);
  }, [signal]);

  const generate = () => {
    setError("");
    const lastWhite = spins.find((s) => s.color === "white");
    if (!lastWhite) {
      setError("Nenhum branco encontrado no histórico.");
      setSignal(null);
      return;
    }
    const base = parseTime(lastWhite.time);
    if (!base) {
      setError("Horário inválido.");
      return;
    }
    setSignal({
      base: lastWhite.time,
      entries: [addMinutes(base, 11), addMinutes(base, 16), addMinutes(base, 21)],
    });
  };

  return (
    <Card title="Gerar sinal" icon={<Radio className="h-3.5 w-3.5" />} delay={0.24}>
      <button
        type="button"
        onClick={generate}
        className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <Target className="h-4 w-4" />
        Gerar sinal de branco
      </button>

      {signal && !error && (
        <button
          type="button"
          onClick={() => setShowEntries((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.09] hover:text-foreground"
        >
          {showEntries ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showEntries ? "Ocultar entradas" : "Mostrar entradas"}
        </button>
      )}

      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}

        {signal && !error && showEntries && (
          <motion.div
            key={signal.base + signal.entries.join(",")}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5"
          >
            <ul className="space-y-2">
              {signal.entries.map((time, i) => (
                <motion.li
                  key={time + i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.07 }}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {i + 1}ª entrada
                  </span>
                  <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                    {time}
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
