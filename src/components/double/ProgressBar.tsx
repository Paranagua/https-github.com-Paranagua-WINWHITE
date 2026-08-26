import { memo } from "react";
import { motion } from "framer-motion";

type Props = {
  value: number; // 0..100
  color?: "red" | "black" | "primary";
};

export const ProgressBar = memo(function ProgressBar({ value, color = "primary" }: Props) {
  const bg =
    color === "red"
      ? "var(--gradient-red)"
      : color === "black"
        ? "var(--gradient-black)"
        : "var(--gradient-primary)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="h-full rounded-full"
        style={{ background: bg }}
      />
    </div>
  );
});
