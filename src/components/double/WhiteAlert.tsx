import { motion } from "framer-motion";
import { X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import type { Spin } from "./types";
const BRANCO_IMG = "/images/branco.svg";

type Props = {
  spin: Spin | null;
  onClose: () => void;
  autoCloseTime?: number;
};

export function WhiteAlert({ spin, onClose, autoCloseTime = 5000 }: Props) {
  useEffect(() => {
    if (spin) {
      const timer = setTimeout(onClose, autoCloseTime);
      return () => clearTimeout(timer);
    }
  }, [spin, onClose, autoCloseTime]);

  return (
    <AnimatePresence>
      {spin && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-4 pt-6"
          role="status"
          aria-live="assertive"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/[0.04]"
          />
          <motion.div
            initial={{ y: -24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -24, opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="glass-card pointer-events-auto relative flex items-center gap-4 rounded-2xl px-5 py-4"
            style={{
              boxShadow: "0 24px 70px -16px oklch(0 0 0 / 0.7), 0 0 40px oklch(1 0 0 / 0.12)",
            }}
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-white/40">
              <img src={BRANCO_IMG} alt="Branco" className="h-full w-full object-cover" />
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-white/40" />
            </div>

            <div className="leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Alerta de Branco
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                Branco confirmado · {spin.time}
              </p>
              <p className="text-xs text-muted-foreground">IA Freitas</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors duration-200 hover:bg-white/5 hover:text-foreground"
              aria-label="Fechar alerta"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
