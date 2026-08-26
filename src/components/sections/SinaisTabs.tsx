import { useState } from "react";
import { cn } from "@/lib/utils";
import { Radio, BarChart3, Target, Layers, ShieldCheck } from "lucide-react";
import { PredictiveSignals } from "@/components/double/PredictiveSignals";
import { Card } from "@/components/double/Card";
import { Button } from "@/components/ui/button";

export function SinaisTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: "sinais" | "analises";
  setActiveTab: (tab: "sinais" | "analises") => void;
}) {
  return (
    <div className="flex rounded-lg bg-black/40 p-1 border border-white/5 w-fit">
      <button
        onClick={() => setActiveTab("sinais")}
        className={cn(
          "px-6 py-2 text-[11px] font-black uppercase tracking-widest rounded-md transition-all flex items-center gap-2",
          activeTab === "sinais"
            ? "bg-primary text-white"
            : "text-muted-foreground hover:text-white",
        )}
      >
        <Radio className="h-3.5 w-3.5" />
        Sinais
      </button>
      <button
        onClick={() => setActiveTab("analises")}
        className={cn(
          "px-6 py-2 text-[11px] font-black uppercase tracking-widest rounded-md transition-all flex items-center gap-2",
          activeTab === "analises"
            ? "bg-primary text-white"
            : "text-muted-foreground hover:text-white",
        )}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Análises
      </button>
    </div>
  );
}

export function AnalysesTab({ topStrategies, auditStats }: any) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {topStrategies.map((strat: any, i: number) => {
          const isA8A9 = strat.analise.includes("A8") || strat.analise.includes("A9");
          const isHighTrend = strat.pct >= 85 && strat.total >= 5;

          return (
            <Card
              key={i}
              className={cn(
                "p-5 border-primary/20 bg-primary/[0.02] relative overflow-hidden group hover:border-primary/40 transition-all",
                isHighTrend && "ring-1 ring-orange-500/50",
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">
                    {strat.analise.replace("Analise", "Estratégia ").replace("A", "A")}
                  </div>
                  <div className="text-3xl font-black text-primary font-outfit">
                    {strat.pct.toFixed(1)}%
                  </div>
                </div>
                {isHighTrend && (
                  <span className="flex items-center gap-1 rounded bg-orange-500/20 px-2 py-0.5 text-[8px] font-black text-orange-500 animate-pulse border border-orange-500/30">
                    🔥 ALTA TENDÊNCIA
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 text-[10px] font-bold">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-white/30 uppercase tracking-tighter">Acertos</span>
                    <span className="text-emerald-400">{strat.wins}W</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white/30 uppercase tracking-tighter">Erros</span>
                    <span className="text-red-400">{strat.total - strat.wins}L</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-white/30 uppercase tracking-tighter block">Total</span>
                  <span className="text-white">{strat.total}</span>
                </div>
              </div>

              {isA8A9 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="text-[9px] text-white/40 italic">
                    {strat.analise.includes("A8")
                      ? "Gatilho: Branco Duplo (⚪⚪). Projeção baseada em delta temporal + adjacentes."
                      : "Gatilho: Pão de Branco (⚪🔴⚪). Projeção baseada em peso 30 + valor da carne."}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Detalhes de A8 e A9 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 bg-white/[0.01] border-white/5">
          <h4 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Estratégia A8: Branco Duplo
          </h4>
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>
              Esta estratégia monitora a saída consecutiva de dois brancos (⚪⚪). O cálculo de
              projeção utiliza a fórmula:
            </p>
            <div className="p-3 bg-black/40 rounded-lg font-mono text-primary/80">
              Delta = (Hora_B1 + Min_B1 + Min_B2) + Vizinhos
            </div>
            <p>A auditoria é realizada em uma janela de ±1 minuto do horário projetado.</p>
          </div>
        </Card>

        <Card className="p-6 bg-white/[0.01] border-white/5">
          <h4 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Estratégia A9: Pão de Branco
          </h4>
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>
              Identifica o padrão sanduíche com brancos nas pontas (⚪🔴⚪ ou ⚪⚫⚪). A fórmula de
              projeção é:
            </p>
            <div className="p-3 bg-black/40 rounded-lg font-mono text-primary/80">
              Delta = 30 + Valor_Carne + Vizinhos
            </div>
            <p>
              Ideal para capturar ciclos de repetição de curto prazo baseados no recheio do padrão.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
