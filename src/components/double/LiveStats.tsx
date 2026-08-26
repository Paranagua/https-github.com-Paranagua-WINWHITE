import { memo } from "react";
import { ResultCircle } from "./ResultCircle";
import { cn } from "@/lib/utils";
import fwLogoAsset from "@/assets/fw-logo-link.png.asset.json";
import { RefreshCcw } from "lucide-react";

interface StatsCardProps {
  title: string;
  titleSuffix?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const StatsCard = ({ title, titleSuffix, children, footer, className }: StatsCardProps) => (
  <div
    className={cn(
      "flex flex-col rounded-lg bg-[#0c0c0c] border border-white/5 overflow-hidden",
      className,
    )}
  >
    <div className="flex flex-col items-center pt-3 px-4 bg-[#141414]/30">
      <div className="flex items-center gap-1.5 pb-2.5">
        <span className="text-[12px] font-bold uppercase tracking-wider text-[#eaeaea]">
          {title}
        </span>
        {titleSuffix}
      </div>
      <div className="w-full border-t border-white/5" />
    </div>
    <div className="flex-1 px-4 py-4">{children}</div>
    {footer && (
      <div className="px-4 pb-3">
        <div className="mb-2.5 border-t border-white/5" />
        {footer}
      </div>
    )}
  </div>
);

export const LiveStats = memo(function LiveStats({
  total,
  reds,
  blacks,
  whites,
  redPct,
  blackPct,
  whitePct,
  countdown,
}: {
  total: number;
  reds: number;
  blacks: number;
  whites: number;
  redPct: number;
  blackPct: number;
  whitePct: number;
  countdown: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Plataforma Atual */}
      <StatsCard title="Plataforma Atual">
        <div className="flex flex-col items-center justify-center gap-4 py-3">
          <div className="flex items-center justify-center w-full">
            <img src={fwLogoAsset.url} alt="FW Logo" className="h-24 w-auto object-contain" />
          </div>
          <div className="flex justify-between w-full px-2 mt-2">
            <a
              href="https://blaze.bet.br"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center rounded border border-[#ef4444]/40 bg-black/40 px-4 text-[11px] font-bold text-white/90 transition-all hover:bg-[#ef4444]/10 hover:border-[#ef4444] active:scale-95"
            >
              Blaze.com
            </a>
            <a
              href="https://blaze.bet.br/pt/games/double"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center rounded border border-[#ef4444]/40 bg-black/40 px-4 text-[11px] font-bold text-white/90 transition-all hover:bg-[#ef4444]/10 hover:border-[#ef4444] active:scale-95"
            >
              Double
            </a>
          </div>
        </div>
      </StatsCard>

      {/* 2. Pessoas Entrando */}
      <StatsCard
        title="Pessoas Entrando"
        titleSuffix={
          <span className="text-[13px] font-bold text-[#FBBF24]">
            → {countdown > 3 ? "---" : "---"}
          </span>
        }
        footer={
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-medium text-[#999999]">
              {countdown > 3 ? "Entradas Abertas..." : "Girando..."}
            </span>
            <div
              className={cn(
                "flex items-center justify-center h-4 w-4 rounded-md transition-colors",
                countdown > 3 ? "bg-emerald-500/20" : "bg-red-500/20",
              )}
            >
              <RefreshCcw
                className={cn(
                  "h-3 w-3",
                  countdown > 3 ? "text-[#10b981] animate-spin" : "text-red-500",
                )}
              />
            </div>
          </div>
        }
      >
        <div className="flex justify-between px-2 pt-1">
          {[
            { color: "red", count: 142, val: "R$ 2.036,35" },
            { color: "white", count: 538, val: "R$ 4.432,03" },
            { color: "black", count: 111, val: "R$ 1.112,80" },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-bold text-white bg-[#1A1A1A] px-2 py-0.5 rounded min-w-[32px] text-center">
                {item.count}
              </span>
              <div className="h-8 w-8 rounded-lg overflow-hidden border border-white/10">
                <ResultCircle color={item.color as any} size="fluid" animate={false} />
              </div>
              <span className="text-[9px] font-medium text-[#888888] tabular-nums">{item.val}</span>
            </div>
          ))}
        </div>
      </StatsCard>

      {/* 3. Proporção de Cores */}
      <StatsCard
        title="Proporção de Cores"
        titleSuffix={
          <span className="text-[11px] font-medium text-[#ef4444]">({total} Rodadas)</span>
        }
        footer={
          <div className="text-center px-1">
            <span className="text-[10px] font-medium text-[#999999]">
              Análise dos <span className="text-white">últimos 6 gatilhos</span> (limite 120 min) e
              porcentagem das cores.
            </span>
          </div>
        }
      >
        <div className="flex justify-between px-2 pt-1">
          {[
            { color: "red", count: reds, pct: redPct },
            { color: "white", count: whites, pct: whitePct },
            { color: "black", count: blacks, pct: blackPct },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-bold text-white bg-[#1A1A1A] px-2 py-0.5 rounded min-w-[32px] text-center">
                {item.count} X
              </span>
              <div className="h-8 w-8 rounded-lg overflow-hidden border border-white/10">
                <ResultCircle color={item.color as any} size="fluid" animate={false} />
              </div>
              <span className="text-[9px] font-bold text-white">{item.pct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </StatsCard>

      {/* 4. Puxadas */}
      <StatsCard
        title="Puxadas"
        footer={
          <div className="text-center px-1">
            <span className="text-[10px] font-medium text-[#999999]">
              <span className="text-white">Quantidade</span> de os puxadas.
            </span>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-[#ef4444] mb-1.5">7 Casts</span>
            <div className="flex gap-4">
              <div className="flex flex-col items-center gap-1">
                <ResultCircle color="red" size="xs" animate={false} />
                <span className="text-[9px] font-bold text-white">3 X</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ResultCircle color="black" size="xs" animate={false} />
                <span className="text-[9px] font-bold text-white">3 X</span>
              </div>
            </div>
          </div>

          <div className="w-full border-t border-white/5 my-1" />

          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-[#ef4444] mb-1.5">8 Casais atuais</span>
            <div className="flex gap-1.5">
              <ResultCircle color="white" size="xs" animate={false} />
              <ResultCircle color="red" size="xs" animate={false} />
              <ResultCircle color="red" size="xs" animate={false} />
              <ResultCircle color="black" size="xs" animate={false} />
            </div>
          </div>
        </div>
      </StatsCard>
    </div>
  );
});
