import { memo } from "react";
const BRANCO_IMG = "/images/branco.svg";
import type { Color } from "./types";
import type { StoredSignal } from "@/lib/signalsStore";

export const BLAZE_CARD_W = 62;
export const BLAZE_CARD_TOP_H = 60;
export const BLAZE_GAP_X = 4;
export const BLAZE_GAP_Y = 6;

const PALETTE: Record<
  Color,
  { bg: string; border: string; ring: string; fg: string; shadow?: string }
> = {
  red: { bg: "#f12c4c", border: "transparent", ring: "#ffffff", fg: "#ffffff" },
  black: { bg: "#1e2330", border: "transparent", ring: "#ffffff", fg: "#ffffff" },
  white: {
    bg: "transparent",
    border: "transparent",
    ring: "#DE2143",
    fg: "#DE2143",
    shadow: "none",
  },
};

type Props = {
  n: number;
  color: Color;
  time?: string;
  numbered?: boolean;
  timeHighlight?: boolean;
  dimmed?: boolean;
  selected?: boolean;
  delay?: number;
  signal?: StoredSignal;
  onClick?: () => void;
};

/** Card de resultado no padrão do histórico da Blaze (48px, círculo 32px, hora 11px). */
export const BlazeResultCard = memo(function BlazeResultCard({
  n,
  color,
  time,
  numbered = false,
  timeHighlight = false,
  dimmed = false,
  selected = false,
  delay = 0,
  signal,
  onClick,
}: Props) {
  const c = PALETTE[color];
  const isWhite = color === "white";

  return (
    <div
      className="blaze-result-card relative flex animate-in flex-col items-center bg-transparent border-none shadow-none outline-none fade-in slide-in-from-bottom-2"
      style={{
        width: `var(--blaze-card-w, ${BLAZE_CARD_W}px)`,
        animationDelay: delay > 0 ? `${delay}s` : undefined,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full cursor-pointer items-center justify-center overflow-hidden transition-[transform,opacity,box-shadow,border-color] duration-200 hover:-translate-y-0.5 active:scale-95 shadow-none border-none bg-transparent"
        style={{
          height: `var(--blaze-card-h, ${BLAZE_CARD_TOP_H}px)`,
          borderRadius: 4,
          border: selected
            ? `2px solid var(--primary)`
            : isWhite
              ? `2px solid ${c.border}`
              : `1px solid ${c.border}`,
          background: isWhite ? "transparent" : c.bg,
          boxShadow: isWhite ? c.shadow : "none",
          opacity: dimmed ? 0.25 : 1,
        }}
      >
        {isWhite && !numbered ? (
          <img
            src={BRANCO_IMG}
            alt="Branco"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span
            className="flex items-center justify-center font-bold leading-none tabular-nums"
            style={{
              height: "32px",
              width: "32px",
              borderRadius: "50%",
              border: `3px solid #ffffff`,
              color: "#ffffff",
              fontSize: "14px",
            }}
          >
            {n}
          </span>
        )}
      </button>

      {signal && (
        <div className="absolute top-0 z-10 flex w-full justify-center">
          <span
            className={`inline-flex h-3 items-center rounded-full px-1 text-[7px] font-black tracking-wider shadow-sm sm:h-3.5 sm:px-1.5 sm:text-[8px] ${
              signal.outcome === "green"
                ? "bg-emerald-500 text-black border border-emerald-300"
                : "bg-emerald-500 text-black border border-emerald-300"
            }`}
          >
            SINAL
          </span>
        </div>
      )}

      {time && (
        <span
          className={`mt-[8px] flex items-center justify-center font-bold leading-none tabular-nums text-foreground dark:text-white rounded-md bg-surface-2 dark:bg-[#3f4a56] border-none`}
          style={{
            height: "16px",
            width: "100%",
            fontSize: "9px",
            padding: "0 2px",
          }}
        >
          {time}
        </span>
      )}
    </div>
  );
});
