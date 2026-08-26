import { memo } from "react";
import { motion } from "framer-motion";

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
};

export const Switch = memo(function Switch({ checked, onChange, label, id }: Props) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2.5 select-none">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-300 ${
          checked ? "border-primary/40 bg-primary" : "border-border bg-surface-2"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-md ${
            checked ? "ml-[22px]" : "ml-0.5"
          }`}
        />
      </button>
      {label && <span className="text-xs font-medium text-foreground/80">{label}</span>}
    </label>
  );
});
