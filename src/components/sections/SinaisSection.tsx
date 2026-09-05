import { useCallback, useEffect, useMemo, useState, Component, type ReactNode } from "react";
import {
  setPredictiveSignals,
  getPredictiveSignals,
  subscribePredictive,
  type PredictiveSignal,
} from "@/lib/signalsStore";
import { useSignalStatsStore } from "@/lib/signalStatsStore";
import { auditSignalWithRounds, deduplicateResults } from "@/lib/signalAuditEngine";
import {
  Radio,
  Cpu,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { setSection } from "@/lib/sectionStore";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { colorOf, fmtTime, type Color } from "@/components/double/types";
import { parseUtcDate } from "@/lib/utils";
import { PredictiveSignals } from "@/components/double/PredictiveSignals";
import {
  extractSignalStrategies,
  extractSignalAnalyses,
  formatStrategyCode,
} from "@/lib/signalHierarchy";

interface PrimaryAnalysisMetadataItem {
  key: string;
  analysisId: number;
  name: string;
  shortLabel: string;
  category: "pedras" | "sequencia" | "somas" | "cores";
  categoryLabel: string;
  badge: string;
  description: string;
}

const ALL_PRIMARY_ANALYSES_METADATA: PrimaryAnalysisMetadataItem[] = [
  // 1. Padrões de Pedra (3 análises)
  {
    key: "A2",
    analysisId: 2,
    name: "Análise 2 · Repetição Simples",
    shortLabel: "A2",
    category: "pedras",
    categoryLabel: "Padrões de Pedra",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Duas pedras iguais consecutivas",
  },
  {
    key: "A19",
    analysisId: 19,
    name: "Análise 19 · Sanduíche Pontas",
    shortLabel: "A19",
    category: "pedras",
    categoryLabel: "Padrões de Pedra",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Mesma pedra nas pontas de 3 giros (X - Y - X)",
  },
  {
    key: "A20",
    analysisId: 20,
    name: "Análise 20 · Sanduíche Meio",
    shortLabel: "A20",
    category: "pedras",
    categoryLabel: "Padrões de Pedra",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Pedra intermediária no padrão sanduíche",
  },

  // 2. Gatilhos de Sequência (5 análises)
  {
    key: "A10",
    analysisId: 10,
    name: "Análise 10 · Sequência 8 → 11",
    shortLabel: "A10",
    category: "sequencia",
    categoryLabel: "Gatilhos de Sequência",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    description: "Transição direta do número 8 para o número 11",
  },
  {
    key: "A11",
    analysisId: 11,
    name: "Análise 11 · Repetição 11 → 11",
    shortLabel: "A11",
    category: "sequencia",
    categoryLabel: "Gatilhos de Sequência",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    description: "Repetição consecutiva do número 11",
  },
  {
    key: "A12",
    analysisId: 12,
    name: "Análise 12 · Sequência 4 → 11",
    shortLabel: "A12",
    category: "sequencia",
    categoryLabel: "Gatilhos de Sequência",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    description: "Transição do número 4 para o número 11",
  },
  {
    key: "A13",
    analysisId: 13,
    name: "Análise 13 · Sequência 4 ↔ 14",
    shortLabel: "A13",
    category: "sequencia",
    categoryLabel: "Gatilhos de Sequência",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    description: "Gatilho reversível entre as pedras 4 e 14",
  },
  {
    key: "A21",
    analysisId: 21,
    name: "Análise 21 · Sequência 7 ↔ 11",
    shortLabel: "A21",
    category: "sequencia",
    categoryLabel: "Gatilhos de Sequência",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    description: "Gatilho reversível entre as pedras 7 e 11",
  },

  // 3. Somas Consecutivas (3 análises)
  {
    key: "A14",
    analysisId: 14,
    name: "Análise 14 · Soma 17",
    shortLabel: "A14",
    category: "somas",
    categoryLabel: "Somas Consecutivas",
    badge: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    description: "Soma de 2 pedras consecutivas igual a 17",
  },
  {
    key: "A15",
    analysisId: 15,
    name: "Análise 15 · Soma 19",
    shortLabel: "A15",
    category: "somas",
    categoryLabel: "Somas Consecutivas",
    badge: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    description: "Soma de 2 pedras consecutivas igual a 19",
  },
  {
    key: "A16",
    analysisId: 16,
    name: "Análise 16 · Soma 21",
    shortLabel: "A16",
    category: "somas",
    categoryLabel: "Somas Consecutivas",
    badge: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    description: "Soma de 2 pedras consecutivas igual a 21",
  },

  // 4. Quebra de Padrões de Cores (7 análises - IDs 50 a 56)
  {
    key: "Q1",
    analysisId: 50,
    name: "Q1 · Alternados",
    shortLabel: "Q1",
    category: "cores",
    categoryLabel: "Quebra de Cores",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Quebra de alternância simples (V-P-V-P-V-P, mín. 6 casas)",
  },
  {
    key: "Q2",
    analysisId: 51,
    name: "Q2 · Alt. Contínuos (2x2)",
    shortLabel: "Q2",
    category: "cores",
    categoryLabel: "Quebra de Cores",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Quebra de padrão 2x2 alternado (V-V-P-P-V-V, mín. 6 casas)",
  },
  {
    key: "Q3",
    analysisId: 52,
    name: "Q3 · Alt. Contínuos Nível 1",
    shortLabel: "Q3",
    category: "cores",
    categoryLabel: "Quebra de Cores",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Quebra de padrão 3x3 alternado (V-V-V-P-P-P, mín. 6 casas)",
  },
  {
    key: "Q4",
    analysisId: 53,
    name: "Q4 · Alt. Contínuos Nível 2",
    shortLabel: "Q4",
    category: "cores",
    categoryLabel: "Quebra de Cores",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Quebra de alternados nível 2 (+2 casas: V-V-V-V-P-P-P-P)",
  },
  {
    key: "Q5",
    analysisId: 54,
    name: "Q5 · Contínuos (5x)",
    shortLabel: "Q5",
    category: "cores",
    categoryLabel: "Quebra de Cores",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Quebra de sequência contínua de 5 giros da mesma cor",
  },
  {
    key: "Q6",
    analysisId: 55,
    name: "Q6 · Contínuos Nível 1 (6x)",
    shortLabel: "Q6",
    category: "cores",
    categoryLabel: "Quebra de Cores",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Quebra de sequência contínua de 6 giros (+1 casa)",
  },
  {
    key: "Q7",
    analysisId: 56,
    name: "Q7 · Contínuos Nível 2 (8x)",
    shortLabel: "Q7",
    category: "cores",
    categoryLabel: "Quebra de Cores",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Quebra de sequência contínua de 8 giros (+2 casas)",
  },
];

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

function getSignalTypeBadge(sig: {
  key?: string;
  category?: string;
  isSupreme?: boolean;
  isRare?: boolean;
  isAlavancagem?: boolean;
  isTop1?: boolean;
  confluence?: string;
  label?: string;
  sources?: Array<{
    analysis: number;
    value: number;
    pct?: number;
    top3?: boolean;
    top5?: boolean;
  }>;
}) {
  const cat = (sig.category || "").toLowerCase();
  const label = (sig.label || "").toUpperCase();
  const conf = (sig.confluence || "").toUpperCase();

  const top1Sources = (sig.sources || []).filter((s: any) => !s.top3 && !s.top5);
  const top3Sources = (sig.sources || []).filter((s: any) => s.top3 || s.top5);
  const distinctTop1 = new Set(top1Sources.map((s: any) => s.analysis));
  const distinctTop3 = new Set(top3Sources.map((s: any) => s.analysis));

  // 1. 🚀 Alavancagem (4+ Top 1)
  if (
    sig.isAlavancagem ||
    cat.includes("alavanc") ||
    distinctTop1.size >= 4 ||
    label.includes("ALAVANC") ||
    conf.includes("ALAVANC")
  ) {
    return {
      name: "Alavancagem",
      short: "Alavanc.",
      icon: "🚀",
      badgeClass: "bg-amber-500/20 border-amber-500/40 text-amber-300",
    };
  }

  // 2. 👑 Supremo (2x ou 3x Top 1 + 2+ Top 2/3)
  if (
    sig.isSupreme ||
    cat.includes("suprem") ||
    cat.includes("winn") ||
    ((distinctTop1.size === 2 || distinctTop1.size === 3) && distinctTop3.size >= 2) ||
    label.includes("SUPREM") ||
    conf.includes("SUPREM") ||
    label.includes("WINN")
  ) {
    return {
      name: "Supremo",
      short: "Supremo",
      icon: "👑",
      badgeClass: "bg-purple-500/20 border-purple-500/40 text-purple-300",
    };
  }

  // 3. 💎 Raro (2x ou 3x Top 1 + 0 ou 1 Top 2/3)
  if (
    sig.isRare ||
    cat.includes("rare") ||
    cat.includes("raro") ||
    distinctTop1.size >= 2 ||
    label.includes("RARO") ||
    conf.includes("RARO")
  ) {
    return {
      name: "Raro",
      short: "Raro",
      icon: "💎",
      badgeClass: "bg-cyan-500/20 border-cyan-500/40 text-cyan-300",
    };
  }

  // 4. ⚡ Top 1 & Top 3 (1x Top 1 + 1+ Top 2/3)
  return {
    name: "Top 1 & Top 3",
    short: "Top 1 & 3",
    icon: "⚡",
    badgeClass: "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
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
  const [predictiveList, setPredictiveList] = useState<PredictiveSignal[]>(getPredictiveSignals());
  const [auditFilter, setAuditFilter] = useState<"geral" | "hoje">("geral");
  const [primaryTabFilter, setPrimaryTabFilter] = useState<
    "todas" | "pedras" | "sequencia" | "somas" | "cores"
  >("todas");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const stats = useSignalStatsStore((state) => state.stats);
  const recentSignals = useSignalStatsStore((state) => state.recentSignals);
  const recordCompletedSignal = useSignalStatsStore((state) => state.recordCompletedSignal);
  const clearStats = useSignalStatsStore((state) => state.clearStats);
  const syncWithServerData = useSignalStatsStore((state) => state.syncWithServerData);

  const [autonomousStatus, setAutonomousStatus] = useState<{
    status: string;
    totalAudited: number;
    lastRoundId: number | null;
    lastRunAt: string | null;
  } | null>(null);

  const syncAutonomous = useCallback(async () => {
    try {
      const res = await fetch("/api/public/autonomous-audit");
      if (res.ok) {
        const data = await res.json();
        if (data) {
          syncWithServerData(data);
          setAutonomousStatus({
            status: data.status,
            totalAudited: data.totalAudited,
            lastRoundId: data.lastRoundId,
            lastRunAt: data.lastRunAt,
          });
        }
      }
    } catch {
      // ignore transient network errors
    }
  }, [syncWithServerData]);

  const [isLoading, setIsLoading] = useState(false);
  const [timeTick, setTimeTick] = useState(Date.now());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from("blaze_results")
        .select("id, roll, color, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (data) setResultsForValidation(data.map(rowToResult));
    } catch (err) {
      console.error("Error loading blaze results:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    syncAutonomous();

    const autonomousInterval = setInterval(() => {
      syncAutonomous();
    }, 4000);

    // Polling contínuo de alta frequência a cada 3.5s para garantia absoluta de dados em tempo real
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("created_at", { ascending: false })
          .limit(25);
        if (data && data.length > 0) {
          const fresh = data.map(rowToResult);
          setResultsForValidation((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newItems = fresh.filter((r) => !existingIds.has(r.id));
            if (newItems.length === 0) return prev;
            return [...newItems, ...prev].slice(0, 500);
          });
        }
      } catch (err) {
        console.error("[SinaisSection] Polling error:", err);
      }
    }, 3500);

    // Atualização em tempo real ao chegar novos giros da Blaze via WebSocket
    const channel = supabase
      .channel("sinais_section_blaze_results")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "blaze_results" },
        (payload) => {
          if (!payload.new) return;
          const newResult = rowToResult(payload.new as any);
          setResultsForValidation((prev) => {
            if (prev.some((r) => r.id === newResult.id)) return prev;
            return [newResult, ...prev].slice(0, 500);
          });
        },
      )
      .subscribe();

    // Timer a cada 2 segundos para reavaliar o avanço do tempo das janelas (M-1, M, M+1)
    const tickInterval = setInterval(() => {
      setTimeTick(Date.now());
    }, 2000);

    const onVisible = () => {
      if (!document.hidden) {
        loadData();
        setTimeTick(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(autonomousInterval);
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      clearInterval(tickInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadData, syncAutonomous]);

  // Sincroniza lista com as emissões do store de preditivos
  useEffect(() => {
    const handlePredictiveChange = () => {
      setPredictiveList(getPredictiveSignals());
    };
    const unsub = subscribePredictive(handlePredictiveChange);

    const handleSwitchFilter = (e: any) => {
      if (e.detail === "hoje") setAuditFilter("hoje");
    };
    window.addEventListener("switch-audit-filter", handleSwitchFilter);

    return () => {
      unsub();
      window.removeEventListener("switch-audit-filter", handleSwitchFilter);
    };
  }, []);

  // Estatísticas de Visão Geral: alimentadas em tempo real agrupadas pelas 18 ANÁLISES PRIMÁRIAS
  const primaryAnalysisStats = useMemo(() => {
    // Agrega a partir de recentSignals para contagem exata por análise primária
    const countsByKey: Record<string, { wins: number; losses: number }> = {};

    ALL_PRIMARY_ANALYSES_METADATA.forEach((m) => {
      countsByKey[m.key] = { wins: 0, losses: 0 };
    });

    // 1. Percorre recentSignals (histórico auditado)
    recentSignals.forEach((sig) => {
      if (sig.outcome !== "green" && sig.outcome !== "red") return;
      if (
        (sig as any).isNoConfluence ||
        sig.category === "no_confluence" ||
        (sig.confluence && sig.confluence.includes("Sem Confluência"))
      ) {
        return;
      }
      const isWin = sig.outcome === "green";
      const matchedKeys = new Set<string>();

      // Mapeamento via sig.sources (ID numérico de análise)
      if (Array.isArray(sig.sources) && sig.sources.length > 0) {
        sig.sources.forEach((src: any) => {
          const m = ALL_PRIMARY_ANALYSES_METADATA.find((item) => item.analysisId === src.analysis);
          if (m) matchedKeys.add(m.key);
        });
      }

      // Mapeamento via sig.strategyKey
      if (sig.strategyKey) {
        const direct = ALL_PRIMARY_ANALYSES_METADATA.find(
          (item) =>
            item.key.toUpperCase() === sig.strategyKey?.toUpperCase() ||
            `A${item.analysisId}` === sig.strategyKey?.toUpperCase(),
        );
        if (direct) matchedKeys.add(direct.key);
      }

      // Mapeamento via sig.confluence ou sig.label
      const confText = `${sig.confluence || ""} ${sig.label || ""}`.toUpperCase();
      ALL_PRIMARY_ANALYSES_METADATA.forEach((item) => {
        const code = item.key.toUpperCase();
        const altCode = `A${item.analysisId}`;
        const re = new RegExp(`\\b(${code}|${altCode})\\b`, "i");
        if (re.test(confText)) {
          matchedKeys.add(item.key);
        }
      });

      matchedKeys.forEach((key) => {
        if (countsByKey[key]) {
          if (isWin) countsByKey[key].wins += 1;
          else countsByKey[key].losses += 1;
        }
      });
    });

    // 2. Mescla com o store stats para assegurar persistência mesmo em recargas
    return ALL_PRIMARY_ANALYSES_METADATA.map((m) => {
      const fromRecent = countsByKey[m.key] || { wins: 0, losses: 0 };
      const s = stats[m.key];
      const sAlt = stats[`A${m.analysisId}`];

      const storeWins = (s?.green || 0) + (sAlt && sAlt !== s ? sAlt.green : 0);
      const storeLosses = (s?.red || 0) + (sAlt && sAlt !== s ? sAlt.red : 0);

      const wins = Math.max(fromRecent.wins, storeWins);
      const losses = Math.max(fromRecent.losses, storeLosses);
      const total = wins + losses;
      const assertividade = total > 0 ? (wins / total) * 100 : null;

      return {
        key: m.key,
        analysisId: m.analysisId,
        name: m.name,
        shortLabel: m.shortLabel,
        category: m.category,
        categoryLabel: m.categoryLabel,
        badge: m.badge,
        description: m.description,
        assertividade,
        wins,
        losses,
        total,
      };
    });
  }, [stats, recentSignals]);

  const displayedPrimaryAnalyses = useMemo(() => {
    if (primaryTabFilter === "todas") return primaryAnalysisStats;
    return primaryAnalysisStats.filter((s) => s.category === primaryTabFilter);
  }, [primaryAnalysisStats, primaryTabFilter]);

  const primaryOverallSummary = useMemo(() => {
    let totalWins = 0;
    let totalLosses = 0;
    let activeAnalyses = 0;
    primaryAnalysisStats.forEach((s) => {
      totalWins += s.wins;
      totalLosses += s.losses;
      if (s.total > 0) activeAnalyses += 1;
    });
    const totalOps = totalWins + totalLosses;
    const avgAssertivity = totalOps > 0 ? (totalWins / totalOps) * 100 : null;
    return {
      totalWins,
      totalLosses,
      totalOps,
      activeAnalyses,
      avgAssertivity,
    };
  }, [primaryAnalysisStats]);

  // Auditoria dos sinais preditivos contra os resultados reais (Regra rigorosa de 6 rodadas: M-1, M, M+1)
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

            // Se já está concluído, mantém o status e só remove da visualização após 3 minutos
            if (s.outcome && s.outcome !== "pending") {
              if (s.completedAt && now - s.completedAt > 3 * 60_000) return null;
              return s;
            }

            const sigTime =
              s.entryDate instanceof Date
                ? s.entryDate.getTime()
                : parseUtcDate(s.entryDate as any).getTime();

            // Se for sinal pendente antigo (> 5 minutos no passado), descarta (sem limite futuro de 60/65 min)
            if (s.outcome === "pending" && !Number.isNaN(sigTime) && now - sigTime > 300_000) {
              return null;
            }

            // Executa a conferência matemática estrita das 6 rodadas
            const auditResult = auditSignalWithRounds(s, resultsForValidation || []);
            const cat =
              (s as any).category ||
              (s.isAlavancagem
                ? "alavancagem"
                : s.isSupreme
                  ? "supreme"
                  : s.isRare
                    ? "rare"
                    : s.isTop1
                      ? "top1_isolated"
                      : undefined);

            const isNoConf =
              (s as any).isNoConfluence ||
              cat === "no_confluence" ||
              (s.confluence && s.confluence.includes("Sem Confluência"));

            if (auditResult.outcome === "green") {
              if (s.outcome !== "green") {
                hasChanged = true;
                if (!isNoConf) {
                  recordCompletedSignal({
                    key: s.key,
                    time: s.time,
                    outcome: "green",
                    label: s.label,
                    confluence: s.confluence,
                    resultTime: auditResult.resultTime,
                    strategyKey: s.strategyKey,
                    confirmedStrategies: s.confirmedStrategies,
                    targetTime: s.time,
                    windowLabel: auditResult.audit.windowLabel,
                    checkedResults: auditResult.audit.checkedResults,
                    winningResultId: auditResult.winningResultId,
                    winningResultCreatedAt: auditResult.audit.winningResultCreatedAt,
                    audit: auditResult.audit,
                    sources: s.sources,
                    category: cat,
                    isSupreme: s.isSupreme,
                    isRare: s.isRare,
                    isAlavancagem: s.isAlavancagem,
                    isTop1: s.isTop1,
                  });
                }
              }
              return {
                ...s,
                outcome: "green" as const,
                resultTime: auditResult.resultTime,
                label: "WIN",
                completedAt: s.completedAt || auditResult.completedAt || now,
                winningResultId: auditResult.winningResultId,
                audit: auditResult.audit,
              };
            }

            if (auditResult.outcome === "red") {
              if (s.outcome !== "red") {
                hasChanged = true;
                if (!isNoConf) {
                  recordCompletedSignal({
                    key: s.key,
                    time: s.time,
                    outcome: "red",
                    label: s.label,
                    confluence: s.confluence,
                    strategyKey: s.strategyKey,
                    confirmedStrategies: s.confirmedStrategies,
                    targetTime: s.time,
                    windowLabel: auditResult.audit.windowLabel,
                    checkedResults: auditResult.audit.checkedResults,
                    winningResultId: null,
                    winningResultCreatedAt: null,
                    audit: auditResult.audit,
                    sources: s.sources,
                    category: cat,
                    isSupreme: s.isSupreme,
                    isRare: s.isRare,
                    isAlavancagem: s.isAlavancagem,
                    isTop1: s.isTop1,
                  });
                }
              }
              return {
                ...s,
                outcome: "red" as const,
                label: "LOSS",
                completedAt: s.completedAt || auditResult.completedAt || now,
                audit: auditResult.audit,
              };
            }

            // Continua PENDING enquanto as 6 rodadas não estiverem completas
            return {
              ...s,
              outcome: "pending" as const,
              audit: auditResult.audit,
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
  }, [resultsForValidation, recordCompletedSignal, timeTick]);

  // Estatísticas das Rodadas Atuais: calculadas com base nos 10 ÚLTIMOS sinais do histórico
  const last10Signals = useMemo(() => {
    return (recentSignals || []).slice(0, 10);
  }, [recentSignals]);

  const last10Stats = useMemo(() => {
    const total = last10Signals.length;
    const wins = last10Signals.filter((s) => s.outcome === "green").length;
    const losses = last10Signals.filter((s) => s.outcome === "red").length;
    const pct = total > 0 ? (wins / total) * 100 : 100;
    return { total, wins, losses, pct };
  }, [last10Signals]);

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

        <div className="flex items-center gap-3">
          {/* Badge Motor Autônomo 24/7 */}
          <div
            className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 shadow-sm"
            title={`Motor Autônomo ativo no servidor 24/7. Captura de WIN/LOSS independente de abas abertas. Total auditado: ${autonomousStatus?.totalAudited ?? 0} sinais.`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="hidden sm:inline">Motor Autônomo 24/7</span>
            <span className="sm:hidden">Autônomo</span>
            {autonomousStatus?.lastRoundId && (
              <span className="hidden md:inline text-[10px] text-emerald-400/80 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">
                #{autonomousStatus.lastRoundId}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSection("validador")}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-lg shadow-emerald-500/5"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Auditar Porcentagens</span>
            <span className="sm:hidden">Validador</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Card de Auditoria */}
        <div className="rounded-2xl border border-white/5 bg-[#0c0c0c] overflow-hidden shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white font-outfit">
                  Painel de Auditoria
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {auditFilter === "geral"
                    ? "Auditoria das 18 Análises Primárias em tempo real (Padrões de Pedra, Sequências, Somas e Quebra de Cores)"
                    : `Assertividade dos últimos ${last10Stats.total} de 10 sinais`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {showClearConfirm ? (
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg p-1">
                  <span className="text-[10px] text-red-300 font-bold px-1.5">Zerar dados?</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearStats();
                      const current = getPredictiveSignals();
                      const resetSignals = (current || []).map((s) => ({
                        ...s,
                        outcome: "pending" as const,
                        label: undefined,
                        resultTime: undefined,
                        completedAt: undefined,
                      }));
                      setPredictiveSignals(resetSignals);
                      setPredictiveList(resetSignals);
                      setShowClearConfirm(false);
                    }}
                    className="px-2 py-1 bg-red-500 text-white rounded text-[10px] font-black uppercase hover:bg-red-600 transition-colors"
                  >
                    Sim, Limpar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2 py-1 bg-white/10 text-white/70 rounded text-[10px] font-bold hover:bg-white/20 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  title="Limpar histórico de auditoria e recomeçar do zero"
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Limpar Dados</span>
                </button>
              )}

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
                  Rodadas Atuais (10 Sinais)
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {auditFilter === "geral" ? (
              <div className="space-y-5">
                {/* Barra de Filtros por Categoria de Análise Primária e KPIs Rápidos */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
                  <div className="flex flex-wrap items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => setPrimaryTabFilter("todas")}
                      className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                        primaryTabFilter === "todas"
                          ? "bg-white/15 text-white shadow-sm"
                          : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      Todas ({primaryAnalysisStats.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrimaryTabFilter("pedras")}
                      className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                        primaryTabFilter === "pedras"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "text-emerald-400/50 hover:text-emerald-300"
                      }`}
                    >
                      Padrões de Pedra (
                      {primaryAnalysisStats.filter((s) => s.category === "pedras").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrimaryTabFilter("sequencia")}
                      className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                        primaryTabFilter === "sequencia"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          : "text-cyan-400/50 hover:text-cyan-300"
                      }`}
                    >
                      Gatilhos de Sequência (
                      {primaryAnalysisStats.filter((s) => s.category === "sequencia").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrimaryTabFilter("somas")}
                      className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                        primaryTabFilter === "somas"
                          ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                          : "text-violet-400/50 hover:text-violet-300"
                      }`}
                    >
                      Somas Consecutivas (
                      {primaryAnalysisStats.filter((s) => s.category === "somas").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrimaryTabFilter("cores")}
                      className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                        primaryTabFilter === "cores"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "text-amber-400/50 hover:text-amber-300"
                      }`}
                    >
                      Quebra de Cores (
                      {primaryAnalysisStats.filter((s) => s.category === "cores").length})
                    </button>
                  </div>

                  {/* Resumo consolidado de todas as análises primárias */}
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span>Ativas:</span>
                      <strong className="text-white font-mono">
                        {primaryOverallSummary.activeAnalyses}/{primaryAnalysisStats.length}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span>Operações:</span>
                      <strong className="text-white font-mono">
                        {primaryOverallSummary.totalOps}
                      </strong>
                      <span className="text-[10px] text-emerald-400 font-bold">
                        ({primaryOverallSummary.totalWins}W
                      </span>
                      <span className="text-[10px] text-red-400 font-bold">
                        {primaryOverallSummary.totalLosses}L)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span>Assertividade Média:</span>
                      <strong
                        className={`font-mono font-bold ${
                          primaryOverallSummary.avgAssertivity !== null &&
                          primaryOverallSummary.avgAssertivity >= 70
                            ? "text-emerald-400"
                            : primaryOverallSummary.avgAssertivity !== null
                              ? "text-amber-400"
                              : "text-white/40"
                        }`}
                      >
                        {primaryOverallSummary.avgAssertivity !== null
                          ? `${primaryOverallSummary.avgAssertivity.toFixed(1)}%`
                          : "--"}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Grid de Análises Primárias */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {displayedPrimaryAnalyses.map((s) => {
                    const hasData = s.total > 0;
                    const winRate = s.assertividade !== null ? s.assertividade : 0;
                    return (
                      <div
                        key={s.key}
                        className="flex flex-col justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all group"
                      >
                        <div>
                          {/* Cabeçalho do Card */}
                          <div className="flex items-center justify-between gap-1 mb-2">
                            <span
                              className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.badge}`}
                            >
                              {s.category === "pedras"
                                ? "Pedras"
                                : s.category === "sequencia"
                                  ? "Sequência"
                                  : s.category === "somas"
                                    ? "Somas"
                                    : "Quebra Cores"}
                            </span>
                            <span className="text-[10px] font-mono font-black text-white/60">
                              {s.shortLabel}
                            </span>
                          </div>

                          {/* Nome da Estratégia */}
                          <h4
                            className="text-xs font-bold text-white tracking-tight line-clamp-1 mb-1 group-hover:text-primary transition-colors"
                            title={s.name}
                          >
                            {s.name}
                          </h4>

                          {/* Descrição resumida da regra */}
                          <p
                            className="text-[9px] text-muted-foreground/70 line-clamp-1 mb-3"
                            title={s.description}
                          >
                            {s.description}
                          </p>

                          {/* Assertividade em destaque */}
                          <div className="flex items-baseline gap-1.5 mb-2">
                            <span
                              className={`text-2xl font-black font-outfit ${
                                hasData
                                  ? winRate >= 70
                                    ? "text-emerald-400"
                                    : winRate >= 50
                                      ? "text-amber-400"
                                      : "text-red-400"
                                  : "text-zinc-600 font-normal"
                              }`}
                            >
                              {s.assertividade !== null ? `${s.assertividade.toFixed(0)}%` : "--"}
                            </span>
                            {hasData && (
                              <span className="text-[9px] text-muted-foreground">
                                assertividade
                              </span>
                            )}
                          </div>

                          {/* Barra de Progresso visual */}
                          {hasData && (
                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-2.5 flex">
                              <div
                                style={{ width: `${winRate}%` }}
                                className="h-full bg-emerald-500 rounded-full"
                              />
                              <div
                                style={{ width: `${100 - winRate}%` }}
                                className="h-full bg-red-500/80 rounded-full"
                              />
                            </div>
                          )}
                        </div>

                        {/* Rodapé: Vitórias, Derrotas e Total de Operações */}
                        <div className="flex items-center justify-between text-[10px] font-bold pt-2 border-t border-white/5 mt-auto">
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                s.wins > 0 ? "text-emerald-400 font-black" : "text-zinc-600"
                              }
                            >
                              {s.wins}W
                            </span>
                            <span
                              className={s.losses > 0 ? "text-red-400 font-black" : "text-zinc-600"}
                            >
                              {s.losses}L
                            </span>
                          </div>
                          <span className="text-[9px] text-white/40 font-mono">
                            {s.total} {s.total === 1 ? "op." : "ops."}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {primaryAnalysisStats.every((s) => s.total === 0) && (
                  <p className="text-center text-[11px] text-muted-foreground/60 py-2">
                    ✨ Painel das análises primárias pronto. Os dados são auditados e contabilizados
                    automaticamente conforme as rodadas reais da Blaze forem acontecendo.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-around gap-6 py-2">
                  <div className="text-center">
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">
                      Assertividade (Últimos 10 Sinais)
                    </div>
                    <div className="text-4xl sm:text-5xl font-black text-white font-outfit">
                      {last10Stats.total > 0 ? `${last10Stats.pct.toFixed(1)}%` : "--"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {last10Stats.total > 0
                        ? `Amostra: ${last10Stats.total} ${last10Stats.total === 1 ? "sinal" : "sinais"} concluídos`
                        : "Aguardando conclusão de sinais"}
                    </div>
                  </div>

                  <div className="hidden sm:block h-16 w-px bg-white/5" />

                  <div className="text-center">
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">
                      Placar (Últimos 10)
                    </div>
                    <div className="flex items-baseline gap-2 justify-center">
                      <span className="text-3xl sm:text-4xl font-black text-emerald-500 font-outfit">
                        {last10Stats.wins}W
                      </span>
                      <span className="text-xl font-black text-white/20">/</span>
                      <span className="text-3xl sm:text-4xl font-black text-red-500 font-outfit">
                        {last10Stats.losses}L
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {last10Stats.total > 0
                        ? `${last10Stats.wins} vitórias em ${last10Stats.total} rodadas`
                        : "0 entradas registradas"}
                    </div>
                  </div>
                </div>

                {/* Linha dos 10 Últimos Sinais */}
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between text-[11px] text-white/50 font-bold uppercase tracking-wider">
                    <span>Sequência dos 10 Últimos Sinais (Mais Recente → Mais Antigo)</span>
                    <span>{last10Stats.total}/10 Registrados</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2">
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const sig = last10Signals[idx];
                      if (!sig) {
                        return (
                          <div
                            key={idx}
                            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-dashed border-white/10 bg-white/[0.01] text-zinc-600 text-center min-h-[72px]"
                          >
                            <span className="text-[9px] font-bold opacity-40">#{idx + 1}</span>
                            <span className="text-[10px] font-medium opacity-40">Aguardando</span>
                          </div>
                        );
                      }

                      const isGreen = sig.outcome === "green";
                      const typeBadge = getSignalTypeBadge(sig);

                      return (
                        <div
                          key={sig.key || idx}
                          title={`Sinal: ${sig.time} | Janela (6 rodadas): ${sig.windowLabel || sig.audit?.windowLabel || "--"} | ${isGreen ? `WIN em ${sig.resultTime || "--"}${sig.winningResultId || sig.audit?.winningResultId ? ` (ID: ${sig.winningResultId || sig.audit?.winningResultId})` : ""}` : `LOSS (${sig.checkedResults || sig.audit?.checkedResults || 6} rodadas confirmadas sem branco)`}`}
                          className={`flex flex-col justify-between p-2 rounded-xl border text-left transition-all relative overflow-hidden min-h-[72px] ${
                            isGreen
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-500/5"
                              : "border-red-500/30 bg-red-500/10 text-red-300 shadow-sm shadow-red-500/5"
                          }`}
                        >
                          {/* Topo: Lado Esquerdo = Tipo do Sinal | Lado Direito = Horário */}
                          <div className="flex items-center justify-between gap-1 w-full pb-1 border-b border-white/5">
                            <div className="flex items-center gap-0.5">
                              <span
                                className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-black uppercase tracking-tight border ${typeBadge.badgeClass}`}
                                title={typeBadge.name}
                              >
                                <span>{typeBadge.icon}</span>
                                <span className="truncate max-w-[48px]">{typeBadge.short}</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-0.5 text-[9px] font-bold font-mono opacity-80">
                              <Clock className="h-2.5 w-2.5" />
                              <span>{sig.time}</span>
                            </div>
                          </div>

                          {/* Centro: Status WIN / LOSS e Horário de Resolução */}
                          <div className="flex items-center justify-between gap-1 my-1">
                            <div className="flex items-center gap-1">
                              {isGreen ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                              )}
                              <span className="text-xs font-black font-outfit">
                                {isGreen ? "WIN" : "LOSS"}
                              </span>
                            </div>

                            {isGreen && sig.resultTime && (
                              <span className="text-[8px] font-mono font-bold text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded border border-emerald-500/30">
                                {sig.resultTime}
                              </span>
                            )}
                          </div>

                          {/* Base: Análise Primária Geradora ANTES + Confluências de Estratégia sem percentual */}
                          <div className="flex flex-wrap items-center gap-1 mt-1 max-w-full">
                            {extractSignalAnalyses(sig).map((ana, aIdx) => (
                              <span
                                key={`an-${aIdx}`}
                                className="text-[7.5px] font-mono font-bold text-emerald-300 bg-emerald-500/15 px-1 py-0.2 rounded border border-emerald-500/30"
                                title="Análise Primária Geradora"
                              >
                                {ana.text}
                              </span>
                            ))}
                            {extractSignalStrategies(sig).map((st, sIdx) => (
                              <span
                                key={`st-${sIdx}`}
                                className="text-[7.5px] font-mono opacity-80 text-amber-300 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20"
                                title="Confluência"
                              >
                                +{st}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
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
