import { memo, ReactNode } from "react";
import { motion } from "framer-motion";

type Props = {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  delay?: number;
  className?: string;
  isRare?: boolean;
  isSupreme?: boolean;
  isAlavancagem?: boolean;
  outcome?: "pending" | "green" | "red";
};

export const Card = memo(function Card({
  title,
  subtitle,
  icon,
  action,
  children,
  delay = 0,
  className = "",
  isRare,
  isSupreme,
  isAlavancagem,
  outcome,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm ${className} ${
        outcome === "green"
          ? "ring-1 ring-emerald-500/20"
          : outcome === "red"
            ? "ring-1 ring-red-500/20"
            : ""
      }`}
    >
      {outcome && outcome !== "pending" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 2, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: -5 }}
            className={`border-4 px-6 py-2 text-4xl font-black uppercase tracking-tighter ${
              outcome === "green"
                ? "border-emerald-500 text-emerald-500"
                : "border-red-500 text-red-500"
            }`}
            style={{ textShadow: "0 0 20px rgba(0,0,0,0.5)" }}
          >
            {outcome === "green" ? "✅ WIN" : "❌ LOSS"}
          </motion.div>
        </div>
      )}

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {isAlavancagem && (
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-white px-2 py-0.5 text-[9px] font-black tracking-wider text-slate-950 shadow-[0_0_15px_rgba(255,255,255,0.4)] animate-pulse">
            <span>🚀 ALAVANCAGEM</span>
          </div>
        )}
        {isSupreme && !isAlavancagem && (
          <div className="flex items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/10 px-2 py-0.5 text-[9px] font-black tracking-wider text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.25)] animate-pulse">
            <span>👑 SUPREMO</span>
          </div>
        )}
        {isRare && !isSupreme && !isAlavancagem && (
          <div className="flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black tracking-wider text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
            <span>💎 RARO</span>
          </div>
        )}
      </div>

      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <span className="text-primary">{icon}</span>}
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-[14px] font-medium tracking-tight text-[#eaeaea]">
                  {title}
                </h2>
              )}
              {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
});
