import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
const BRANCO_IMG = "/images/branco.svg";
import type { Spin } from "./types";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

const COLORS = ["#ffffff", "#ffe9a8", "#ffd166", "#8ecbff", "#ff7a92", "#c9a2ff"];

/** Fogos de artifício em canvas — leve, sem dependências, encerra sozinho. */
function Fireworks({ running }: { running: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const parts: Particle[] = [];
    const burst = (x: number, y: number) => {
      const n = 46;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const sp = 1.8 + Math.random() * 3.6;
        parts.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          maxLife: 60 + Math.random() * 40,
          color: Math.random() < 0.25 ? "#ffffff" : color,
          size: 1.4 + Math.random() * 2.2,
        });
      }
    };

    let raf = 0;
    let frame = 0;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    burst(W() * 0.5, H() * 0.34);

    const tick = () => {
      frame++;
      if (frame % 26 === 0 && frame < 260) {
        burst(W() * (0.15 + Math.random() * 0.7), H() * (0.15 + Math.random() * 0.45));
      }
      ctx.clearRect(0, 0, W(), H());
      ctx.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.035;
        p.vx *= 0.985;
        p.vy *= 0.985;
        const t = 1 - p.life / p.maxLife;
        if (t <= 0) {
          parts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, t);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t + 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [running]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

type Props = {
  spin: Spin | null;
  onClose: () => void;
};

/** Celebração em tela cheia quando sai um branco. */
export function WhiteCelebration({ spin, onClose }: Props) {
  useEffect(() => {
    if (!spin) return;
    const t = setTimeout(onClose, 2500); // Fecha automaticamente após 2.5 segundos (mais rápido)
    return () => clearTimeout(t);
  }, [spin, onClose]);

  return (
    <AnimatePresence>
      {spin && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden"
          role="status"
          aria-live="assertive"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-background/80 backdrop-blur-[3px]" />
          <Fireworks running />

          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 210, damping: 16 }}
            className="relative flex flex-col items-center gap-6 px-6 text-center"
          >
            <div className="relative">
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, oklch(1 0 0 / 0.45) 0%, oklch(1 0 0 / 0.12) 45%, transparent 70%)",
                  animation: "kingGlow 1.6s ease-in-out infinite",
                }}
              />
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-white/25" />
              <motion.img
                src={BRANCO_IMG}
                alt="Branco"
                animate={{ y: [0, -12, 0], scale: [1, 1.04, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="relative h-40 w-40 rounded-full object-cover ring-4 ring-primary/70 sm:h-56 sm:w-56"
                style={{
                  boxShadow: "0 0 90px oklch(1 0 0 / 0.55), 0 30px 80px -20px oklch(0 0 0 / 0.8)",
                }}
                draggable={false}
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">
                Alerta de Branco
              </p>
              <h2
                className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-6xl"
                style={{ textShadow: "0 0 40px oklch(1 0 0 / 0.55)" }}
              >
                BRANCO!
              </h2>
              <p className="mt-2 text-sm text-white/75 sm:text-base">
                Confirmado às {spin.time} · IA Freitas
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/20"
            >
              Fechar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Feedback rápido ao ligar/desligar o alerta de branco. */
export function WhiteAlertToggleFx({
  state,
  onDone,
}: {
  state: "on" | "off" | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(onDone, 900); // Reduzido para 0.9 segundos para ser extremamente ágil
    return () => clearTimeout(t);
  }, [state, onDone]);

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.9 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
            mass: 0.8,
          }}
          className="pointer-events-none fixed left-1/2 top-6 z-[100] -translate-x-1/2"
        >
          <div
            className="glass-card flex items-center gap-4 rounded-2xl px-5 py-3 shadow-2xl"
            style={{
              boxShadow: "0 20px 50px -12px rgba(0,0,0,0.5), 0 0 20px rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-primary/50">
              <img src={BRANCO_IMG} alt="" className="h-full w-full object-cover" />
              {state === "on" && (
                <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
              )}
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                Alerta de Branco
              </p>
              <p
                className={`text-base font-black tracking-tight ${state === "on" ? "text-white" : "text-white/80"}`}
              >
                {state === "on" ? "ATIVADO" : "DESATIVADO"}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
