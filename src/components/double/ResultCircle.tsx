import { memo } from "react";
import { motion } from "framer-motion";
import type { Color } from "./types";
const BRANCO_IMG = "/images/branco.svg";

type Size = "xs" | "sm" | "md" | "lg" | "fluid";

const sizes: Record<Size, string> = {
  xs: "h-5 w-5 text-[9px] rounded-[2px]",
  sm: "h-7 w-7 text-[11px] rounded-[3px]",
  md: "h-9 w-9 sm:h-10 sm:w-10 text-xs sm:text-sm rounded-[4px]",
  lg: "h-14 w-14 text-lg rounded-[6px]",
  fluid: "w-full aspect-square text-[clamp(10px,2.4vw,14px)] rounded-[4px]",
};

type Props = {
  color: Color;
  n?: number;
  size?: Size;
  animate?: boolean;
  delay?: number;
  glow?: boolean;
  pulse?: boolean;
  className?: string;
};

export const ResultCircle = memo(function ResultCircle({
  color,
  n,
  size = "md",
  animate = true,
  delay = 0,
  glow = false,
  pulse = false,
  className,
}: Props) {
  const base =
    "relative grid place-items-center overflow-hidden font-bold tabular-nums shadow-sm transition-transform duration-200 hover:scale-[1.08]";

  const colorClasses =
    color === "red" ? "text-white" : color === "white" ? "text-[#16171d]" : "text-white";

  const bgStyle =
    color === "red"
      ? { background: "#DE2143" }
      : color === "white"
        ? { background: "transparent" }
        : { background: "#16171d" };

  const glowStyle = glow
    ? color === "red"
      ? { boxShadow: "var(--shadow-red-glow), var(--shadow-tile)" }
      : color === "white"
        ? { boxShadow: "none" }
        : { boxShadow: "var(--shadow-tile)" }
    : {};

  const content =
    color === "white" ? (
      <img
        src={BRANCO_IMG}
        alt="Branco"
        className="h-full w-full object-cover scale-110 select-none pointer-events-none"
        draggable={false}
      />
    ) : (
      <span className="flex items-center justify-center rounded-full border-2 border-white/95 h-[70%] w-[70%] text-[0.8em]">
        {n}
      </span>
    );

  if (!animate) {
    return (
      <div
        className={`${base} ${sizes[size]} ${colorClasses} ${className || ""}`}
        style={{ ...bgStyle, ...glowStyle }}
      >
        {content}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{
        scale: pulse ? [1, 1.1, 1] : 1,
        opacity: 1,
      }}
      transition={{
        duration: pulse ? 1.5 : 0.35,
        delay,
        ease: [0.22, 1, 0.36, 1],
        repeat: pulse ? Infinity : 0,
      }}

      className={`${base} ${sizes[size]} ${colorClasses} ${className || ""}`}
      style={{ ...bgStyle, ...glowStyle }}
    >
      {content}
    </motion.div>
  );
});
