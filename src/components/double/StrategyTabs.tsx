import { useState } from "react";
import { ShieldCheck, Megaphone, Dice5, ChevronDown } from "lucide-react";
import { PatternValidator } from "./PatternValidator";
import { PatternNotifier } from "./PatternNotifier";
import type { Spin } from "./types";

type TabId = "notifier" | "validator" | "simulator";

const TABS: {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
}[] = [
  { id: "notifier", label: "Notificador", icon: Megaphone },
  { id: "validator", label: "Validador de padrão", icon: ShieldCheck },
  { id: "simulator", label: "Simulador", icon: Dice5, soon: true },
];

export function StrategyTabs({ spins }: { spins: Spin[] }) {
  const [tab, setTab] = useState<TabId | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {TABS.map((t) => {
        const active = tab === t.id;
        const Icon = t.icon;
        return (
          <div key={t.id} className="group flex flex-col">
            <button
              role="tab"
              aria-selected={active}
              onClick={() => !t.soon && setTab((cur) => (cur === t.id ? null : t.id))}
              disabled={t.soon}
              className={`flex w-full items-center justify-between rounded-lg border border-white/5 p-3 text-left transition-all ${
                active
                  ? "bg-primary/10 border-primary/30"
                  : t.soon
                    ? "cursor-not-allowed opacity-30"
                    : "bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-primary text-white" : "bg-white/5 text-muted-foreground"}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`text-[12px] font-semibold tracking-tight ${active ? "text-primary" : "text-foreground"}`}
                >
                  {t.label}
                </span>
              </div>
              {!t.soon && (
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${active ? "rotate-180 text-primary" : ""}`}
                />
              )}
              {t.soon && (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] font-bold text-muted-foreground uppercase">
                  Breve
                </span>
              )}
            </button>
            {active && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                {t.id === "notifier" && <PatternNotifier spins={spins} />}
                {t.id === "validator" && <PatternValidator spins={spins} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
