import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type HistoryRange = {
  /** YYYY-MM-DD (São Paulo) */
  from: string;
  /** YYYY-MM-DD (São Paulo) */
  to: string;
  label: string;
  /** True when "Hoje" — realtime is only enabled in this mode. */
  isLive: boolean;
};

function spDateKey(d: Date) {
  // Convert to America/Sao_Paulo (UTC-3, no DST).
  const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return sp.toISOString().slice(0, 10);
}

export function todayRange(): HistoryRange {
  const k = spDateKey(new Date());
  return { from: k, to: k, label: "Hoje", isLive: true };
}

export function HistoryFilters({
  value,
  onChange,
}: {
  value: HistoryRange;
  onChange: (r: HistoryRange) => void;
}) {
  const [open, setOpen] = useState(false);

  const today = spDateKey(new Date());
  const yesterday = spDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const sevenAgo = spDateKey(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

  const opts = [
    { id: "today", label: "Hoje", range: { from: today, to: today, label: "Hoje", isLive: true } },
    {
      id: "yesterday",
      label: "Ontem",
      range: { from: yesterday, to: yesterday, label: "Ontem", isLive: false },
    },
    {
      id: "7d",
      label: "7 dias",
      range: { from: sevenAgo, to: today, label: "Últimos 7 dias", isLive: false },
    },
  ] as const;

  const activeId =
    value.from === today && value.to === today
      ? "today"
      : value.from === yesterday && value.to === yesterday
        ? "yesterday"
        : value.from === sevenAgo && value.to === today
          ? "7d"
          : "custom";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.range)}
          className={cn(
            "h-9 rounded-lg border px-3 text-xs font-medium transition-colors",
            activeId === o.id
              ? "border-positive/40 bg-positive/10 text-positive"
              : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-9 gap-2 rounded-lg border px-3 text-xs font-medium",
              activeId === "custom"
                ? "border-positive/40 bg-positive/10 text-positive"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {activeId === "custom"
              ? format(new Date(`${value.from}T12:00:00`), "dd 'de' MMM", { locale: ptBR })
              : "Calendário"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={activeId === "custom" ? new Date(`${value.from}T12:00:00`) : undefined}
            onSelect={(d) => {
              if (!d) return;
              const k = spDateKey(d);
              onChange({
                from: k,
                to: k,
                label: format(d, "dd 'de' MMMM", { locale: ptBR }),
                isLive: k === today,
              });
              setOpen(false);
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
