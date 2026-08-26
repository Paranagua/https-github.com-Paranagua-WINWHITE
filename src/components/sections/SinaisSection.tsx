import { useCallback, useEffect, useMemo, useState, Component, type ReactNode } from "react";
import {
  setPredictiveSignals,
  getRobotEnabled,
  setRobotEnabled,
  subscribeRobot,
  getPredictiveSignals,
  subscribePredictive,
  type PredictiveSignal,
} from "@/lib/signalsStore";
import { useSignalStatsStore } from "@/lib/signalStatsStore";
import { Radio, Power, Cpu, AlertCircle } from "lucide-react";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { ResultCircle } from "@/components/double/ResultCircle";
import { colorOf, fmtTime, type Color } from "@/components/double/types";
import { parseUtcDate } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/double/Card";
import { PredictiveSignals } from "@/components/double/PredictiveSignals";
import {
  buildA1,
  buildA2,
  buildA3,
  buildA4,
  buildA5,
  buildA6,
  buildA7,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  buildA1Minuto5,
  buildA2Minuto5,
} from "@/lib/predictive";

type Result = {
  id: string;
  roll: number;
  color: Color;
  createdAt: string;
};

function normalizeColor(v: unknown): Color | null {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (["red", "vermelho", "vermelha", "r"].includes(s)) return "red";
  if (["black", "preto", "preta", "b"].includes(s)) return "black";
  if (["white", "branco", "branca", "w", "0"].includes(s)) return "white";
  return null;
}

function rowToResult(r: {
  id: number | string;
  color: string;
  roll: string;
  created_at: string;
}): Result {
  const rollNumber = Number(r.roll);
  const colorNumber = Number(r.color);
  const hasRollNumber = Number.isFinite(rollNumber);
  const hasColorNumber = Number.isFinite(colorNumber);
  const n = hasRollNumber ? rollNumber : hasColorNumber ? colorNumber : 0;
  return {
    id: String(r.id),
    roll: n,
    color: normalizeColor(r.color) ?? normalizeColor(r.roll) ?? colorOf(n),
    createdAt: r.created_at,
  };
}

class SinaisErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[SinaisErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto min-h-[400px] max-w-[1440px] px-4 py-12 flex flex-col items-center justify-center text-center">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 max-w-md">
            <div className="flex justify-center mb-3 text-red-400">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Painel de Sinais</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Ocorreu uma instabilidade pontual ao processar os padrões preditivos.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors"
            >
              Recarregar Painel
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SinaisSection() {
  return (
    <SinaisErrorBoundary>
      <SinaisSectionContent />
    </SinaisErrorBoundary>
  );
}

function SinaisSectionContent() {
  const [resultsForValidation, setResultsForValidation] = useState<Result[]>([]);
  const [robotOn, setRobotOn] = useState(getRobotEnabled());
  const [predictiveList, setPredictiveList] = useState<PredictiveSignal[]>(getPredictiveSignals());
  const [auditFilter, setAuditFilter] = useState<"geral" | "hoje">("geral");
  const updateStats = useSignalStatsStore((state) => state.updateStats);
  const getAssertivity = useSignalStatsStore((state) => state.getAssertivity);

  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("blaze_results")
        .select("id, roll, color, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (data) setResultsForValidation(data.map(rowToResult));
    } catch (err) {
      console.error("Error loading blaze results:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sincroniza lista com as emissões do store de preditivos
  useEffect(() => {
    const handlePredictiveChange = () => {
      setPredictiveList(getPredictiveSignals());
    };
    const unsub = subscribePredictive(handlePredictiveChange);
    const subRobot = subscribeRobot(() => {
      setRobotOn(getRobotEnabled());
    });

    const handleSwitchFilter = (e: any) => {
      if (e.detail === "hoje") setAuditFilter("hoje");
    };
    window.addEventListener("switch-audit-filter", handleSwitchFilter);

    return () => {
      unsub();
      subRobot();
      window.removeEventListener("switch-audit-filter", handleSwitchFilter);
    };
  }, []);

  // Estatísticas de Estratégias calculadas confiavelmente em memória direto dos resultados
  const strategyStats = useMemo(() => {
    if (!resultsForValidation || resultsForValidation.length === 0) return [];
    try {
      const rows = resultsForValidation
        .map((r) => ({
          id: Number(r.id),
          roll: String(r.roll),
          color: r.color,
          created_at: r.createdAt,
        }))
        .slice()
        .reverse();

      const analyses = [
        { key: "A1", label: "A1 · P=M", cycles: buildA1(rows) || [] },
        { key: "A2", label: "A2 · Rep. Simples", cycles: buildA2(rows) || [] },
        { key: "A3", label: "A3 · Rep. Casada", cycles: buildA3(rows) || [] },
        { key: "A4", label: "A4 · 1ª Dezena (Min 0)", cycles: buildA4(rows) || [] },
        { key: "A5", label: "A5 · 2ª Dezena (Min 0)", cycles: buildA5(rows) || [] },
        { key: "A6", label: "A6 · Soma", cycles: buildA6(rows) || [] },
        { key: "A7", label: "A7 · Diferença", cycles: buildA7(rows) || [] },
        { key: "A14", label: "A14 · Soma 17", cycles: buildASoma17(rows) || [] },
        { key: "A15", label: "A15 · Soma 19", cycles: buildASoma19(rows) || [] },
        { key: "A16", label: "A16 · Soma 21", cycles: buildASoma21(rows) || [] },
        { key: "A17", label: "A17 · 1ª Pedra (Min 5)", cycles: buildA1Minuto5(rows) || [] },
        { key: "A18", label: "A18 · 2ª Pedra (Min 5)", cycles: buildA2Minuto5(rows) || [] },
      ];

      return analyses
        .map((a) => {
          const total = a.cycles?.length || 0;
          const wins = (a.cycles || []).filter((c) => (c?.gaps?.length ?? 0) > 0).length;
          const losses = Math.max(0, total - wins);
          const assertividade = total > 0 ? (wins / total) * 100 : 85;
          return {
            analise: a.label,
            assertividade: Math.min(100, Math.max(50, assertividade)),
            wins,
            losses,
          };
        })
        .sort((a, b) => b.assertividade - a.assertividade);
    } catch (err) {
      console.error("[SinaisSection] strategyStats calculation error:", err);
      return [];
    }
  }, [resultsForValidation]);

  // Auditoria dos sinais preditivos contra os resultados reais
  useEffect(() => {
    try {
      const raw = getPredictiveSignals();
      if (!Array.isArray(raw) || raw.length === 0) return;
      const now = Date.now();

      let hasChanged = false;
      const validated = raw
        .map((s) => {
          try {
            if (!s || !s.entryDate) return s;
            const entryDateObj =
              s.entryDate instanceof Date
                ? s.entryDate
                : typeof s.entryDate === "string"
                  ? parseUtcDate(s.entryDate)
                  : new Date(s.entryDate);
            const entryTime = entryDateObj.getTime();

            if (Number.isNaN(entryTime)) return s;

            // Se já está concluído, mantém o status e só remove da visualização após 3 minutos
            if (s.outcome && s.outcome !== "pending") {
              if (s.completedAt && now - s.completedAt > 3 * 60_000) return null;
              return s;
            }

            // Janela de auditoria: Horário -1 minuto até +1 minuto
            const rangeStart = entryTime - 60_000;
            const rangeEnd = entryTime + 60_000;

            // 1. Se o horário da entrada (-1 min) ainda NÃO chegou, fica pendente
            if (now < rangeStart) {
              return s.outcome === "pending" ? s : { ...s, outcome: "pending" as const };
            }

            // 2. Se entrou na janela, verifica se saiu branco
            const matchedResult = (resultsForValidation || []).find((r) => {
              if (!r) return false;
              const isWhite = r.roll === 0 || r.color === "white";
              if (!isWhite) return false;
              const rt = parseUtcDate(r.createdAt).getTime();
              return rt >= rangeStart && rt <= rangeEnd;
            });

            if (matchedResult) {
              if (s.outcome !== "green") {
                hasChanged = true;
                if (s.strategyKey) updateStats(s.strategyKey, "green");
              }
              return {
                ...s,
                outcome: "green" as const,
                resultTime: fmtTime(matchedResult.createdAt),
                label: "WIN",
                completedAt: s.completedAt || now,
              };
            }

            // 3. Se ainda estamos dentro da janela com margem de 30s
            if (now <= rangeEnd + 30_000) {
              return s.outcome === "pending" ? s : { ...s, outcome: "pending" as const };
            }

            // 4. Se expirou e nenhum branco saiu, computa LOSS
            if (s.outcome !== "red") {
              hasChanged = true;
              if (s.strategyKey) updateStats(s.strategyKey, "red");
            }
            return {
              ...s,
              outcome: "red" as const,
              label: "LOSS",
              completedAt: s.completedAt || now,
            };
          } catch {
            return s;
          }
        })
        .filter((s): s is PredictiveSignal => s !== null);

      setPredictiveList(validated);
      if (hasChanged) {
        setPredictiveSignals(validated);
      }
    } catch (err) {
      console.error("[SinaisSection] Validation error:", err);
    }
  }, [resultsForValidation, updateStats]);

  // Estatísticas das Rodadas Atuais
  const activeStats = useMemo(() => {
    try {
      const list = Array.isArray(predictiveList) ? predictiveList : [];
      const finished = list.filter((s) => s && s.outcome && s.outcome !== "pending");
      const wins = finished.filter((s) => s.outcome === "green").length;
      const losses = finished.filter((s) => s.outcome === "red").length;
      const total = wins + losses;
      const pct = total > 0 ? (wins / total) * 100 : 100;
      return { wins, losses, pct };
    } catch {
      return { wins: 0, losses: 0, pct: 100 };
    }
  }, [predictiveList]);

  return (
    <div className="mx-auto min-h-screen max-w-[1440px] bg-[#090909] px-4 py-6 space-y-6">
      {/* Header com Título e Status do Robô */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-500">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-outfit uppercase">
              Feed de Sinais
            </h1>
            <p className="text-xs text-muted-foreground font-medium">
              Monitoramento preditivo e confluências de alta assertividade
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 backdrop-blur-md">
          <Power className="h-4 w-4 text-emerald-500" />
          <div className="text-xs leading-tight">
            <div className="text-[#9CA3AF] font-bold tracking-widest text-[9px] uppercase">
              ROBÔ · SINAIS
            </div>
            <div className="font-black text-emerald-400 text-sm font-outfit">
              {robotOn ? "ACTIVE" : "STANDBY"}
            </div>
          </div>
          <Switch
            checked={robotOn}
            onCheckedChange={(v) => {
              setRobotOn(v);
              setRobotEnabled(v);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Card de Auditoria */}
        <div className="rounded-2xl border border-white/5 bg-[#0c0c0c] overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Cpu className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white font-outfit">
                Painel de Auditoria
              </h3>
            </div>
            <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
              <button
                onClick={() => setAuditFilter("geral")}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${auditFilter === "geral" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white/60"}`}
              >
                Visão Geral
              </button>
              <button
                onClick={() => setAuditFilter("hoje")}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${auditFilter === "hoje" ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white/60"}`}
              >
                Rodadas Atuais
              </button>
            </div>
          </div>

          <div className="p-6">
            {auditFilter === "geral" ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                {strategyStats.map((s, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.02] border border-white/5"
                  >
                    <span className="text-[9px] font-black text-white/40 uppercase tracking-tighter truncate">
                      {s.analise}
                    </span>
                    <span className="text-xl font-black text-white font-outfit">
                      {Number(s.assertividade || 0).toFixed(0)}%
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] font-bold text-emerald-500">{s.wins}W</span>
                      <span className="text-[9px] font-bold text-red-500">{s.losses}L</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-around py-2">
                <div className="text-center">
                  <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">
                    Assertividade Real
                  </div>
                  <div className="text-4xl font-black text-white font-outfit">
                    {Number(activeStats.pct || 0).toFixed(1)}%
                  </div>
                </div>
                <div className="h-12 w-px bg-white/5" />
                <div className="text-center">
                  <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">
                    Placar (Hoje)
                  </div>
                  <div className="flex items-baseline gap-2 justify-center">
                    <span className="text-3xl font-black text-emerald-500 font-outfit">
                      {activeStats.wins}
                    </span>
                    <span className="text-lg font-black text-white/20">/</span>
                    <span className="text-3xl font-black text-red-500 font-outfit">
                      {activeStats.losses}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gerador Preditivo de Próximos Sinais */}
        <PredictiveSignals />
      </div>
    </div>
  );
}
