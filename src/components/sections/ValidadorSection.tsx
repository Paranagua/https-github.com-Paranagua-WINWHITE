import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Award,
  Filter,
  BarChart3,
  Flame,
  Zap,
  HelpCircle,
  RefreshCw,
  Search,
  ChevronDown,
  Layers,
  Sparkles,
  Trash2,
} from "lucide-react";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { parseUtcDate } from "@/lib/utils";
import { fmtTime, colorOf, type Color } from "@/components/double/types";
import { Card } from "@/components/double/Card";
import {
  buildA2,
  buildA3,
  buildA4,
  buildA5,
  buildA8_11,
  buildA11_11,
  buildA4_11,
  buildA4_14,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  buildA1Minuto5,
  buildA2Minuto5,
  buildA1Minuto1,
  buildA2Minuto1,
  buildA1Minuto2,
  buildA2Minuto2,
  buildA1Minuto3,
  buildA2Minuto3,
  buildA1Minuto4,
  buildA2Minuto4,
  buildA1Minuto6,
  buildA2Minuto6,
  buildA1Minuto7,
  buildA2Minuto7,
  buildA1Minuto8,
  buildA2Minuto8,
  buildA1Minuto9,
  buildASandwichPontas,
  buildASandwichMeio,
  buildA7_11,
  computeTop,
  isValidCycle,
  MIN_CYCLES,
  MAX_CYCLES,
  type Cycle,
  type Row,
} from "@/lib/predictive";
import { computeAllSumTriggerProjections } from "@/lib/sum19Strategies";
import { useSignalStatsStore } from "@/lib/signalStatsStore";

type SignalAuditItem = {
  id: string;
  timeStr: string;
  timestamp: number;
  strategyKey: string;
  strategyLabel: string;
  sourceValue: number;
  predictedMinute: number;
  projectedPct: number; // Porcentagem teórica estatística calculada pelo motor
  category: "alavancagem" | "supreme" | "rare" | "top1_top3";
  sourcesCount: number;
  top1Count: number;
  // Auditoria real
  status: "green" | "red" | "pending";
  matchedRoll?: number;
  matchedColor?: Color;
  matchedTime?: string;
  minuteDiff?: number;
};

export default function SignalPercentageValidator() {
  const [loading, setLoading] = useState(true);
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [timeTick, setTimeTick] = useState(Date.now());
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStrategy, setFilterStrategy] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [maxSignalsToEvaluate, setMaxSignalsToEvaluate] = useState<number>(300);

  // Modo de alimentação: "from_now" (alimentar a partir de agora / base limpa) ou "all" (histórico completo)
  const [feedMode, setFeedMode] = useState<"from_now" | "all">(() => {
    return (
      (localStorage.getItem("freitas_validador_feed_mode") as "from_now" | "all") || "from_now"
    );
  });

  const [baselineTime, setBaselineTime] = useState<number>(() => {
    const saved = localStorage.getItem("freitas_validador_baseline_time");
    if (saved && !Number.isNaN(Number(saved))) return Number(saved);
    const now = Date.now();
    localStorage.setItem("freitas_validador_baseline_time", String(now));
    return now;
  });

  const clearValidatorBase = useCallback(() => {
    const now = Date.now();
    setBaselineTime(now);
    localStorage.setItem("freitas_validador_baseline_time", String(now));
    setFeedMode("from_now");
    localStorage.setItem("freitas_validador_feed_mode", "from_now");
  }, []);

  const handleFeedModeChange = useCallback((mode: "from_now" | "all") => {
    setFeedMode(mode);
    localStorage.setItem("freitas_validador_feed_mode", mode);
  }, []);

  // Carrega histórico recente para validação
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("blaze_results")
        .select("id, roll, color, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (data) {
        const rows: Row[] = data
          .map((r) => ({
            id: Number(r.id),
            roll: String(r.roll),
            color: String(r.color),
            created_at: r.created_at,
          }))
          .reverse(); // Ordem cronológica
        setRawRows(rows);
      }
    } catch (err) {
      console.error("[SignalValidator] Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();

    // Polling contínuo de alta frequência a cada 3.5s para garantia de dados
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("blaze_results")
          .select("id, roll, color, created_at")
          .order("created_at", { ascending: false })
          .limit(25);
        if (data && data.length > 0) {
          const fresh = data.map((r) => ({
            id: Number(r.id),
            roll: String(r.roll),
            color: String(r.color),
            created_at: r.created_at,
          }));
          setRawRows((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const newRows = fresh.filter((item) => !existingIds.has(item.id)).reverse();
            if (newRows.length === 0) return prev;
            return [...prev, ...newRows];
          });
        }
      } catch (err) {
        console.error("[SignalValidator] Polling error:", err);
      }
    }, 3500);

    // Inscrição em tempo real para novos giros via WebSocket
    const channel = supabase
      .channel("validador_section_blaze_results")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "blaze_results" },
        (payload) => {
          if (!payload.new) return;
          const r = payload.new as any;
          const newRow: Row = {
            id: Number(r.id),
            roll: String(r.roll),
            color: String(r.color),
            created_at: r.created_at,
          };
          setRawRows((prev) => {
            if (prev.some((item) => item.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
        },
      )
      .subscribe();

    // Timer a cada 2 segundos para reavaliar janelas temporais de status pendente
    const tickInterval = setInterval(() => {
      setTimeTick(Date.now());
    }, 2000);

    const onVisible = () => {
      if (!document.hidden) {
        loadHistory();
        setTimeTick(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      clearInterval(tickInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadHistory]);

  // Executa o Backtesting / Auditoria de todos os sinais gerados pelo motor no histórico
  const auditResults = useMemo(() => {
    if (rawRows.length < 50) return { signals: [], stats: null, byStrategy: [] };

    const signals: SignalAuditItem[] = [];
    const allResults = rawRows;

    // Conexão com os Sinais Reais Empregados ao Vivo (Capturados no Armazenamento de Auditoria)
    const recordedLive = useSignalStatsStore.getState().recentSignals || [];
    const recordedKeys = new Set<string>();

    for (const rec of recordedLive) {
      if (!rec || !rec.time) continue;
      const recTime = rec.timestamp || Date.now();
      if (feedMode === "from_now" && recTime < baselineTime - 60_000) continue;

      recordedKeys.add(rec.key);
      const cat: SignalAuditItem["category"] =
        rec.category === "alavancagem" || rec.isAlavancagem
          ? "alavancagem"
          : rec.category === "supreme" || rec.isSupreme
            ? "supreme"
            : rec.category === "rare" || rec.isRare
              ? "rare"
              : "top1_top3";

      signals.push({
        id: `live-${rec.key}`,
        timeStr: rec.time,
        timestamp: recTime,
        strategyKey: rec.strategyKey || "Soma 19/17",
        strategyLabel: rec.label || `Sinal ${rec.time}`,
        sourceValue: (rec.sources && rec.sources[0]?.value) || 0,
        predictedMinute: Number.parseInt(rec.time.split(":")[1] || "0", 10),
        projectedPct: 80.0,
        category: cat,
        sourcesCount: rec.sources?.length || 2,
        top1Count: (rec.sources || []).filter((s: any) => !s.top3 && !s.top5).length,
        status: rec.outcome === "green" ? "green" : rec.outcome === "red" ? "red" : "pending",
        matchedRoll: rec.audit?.winningResultRoll ?? undefined,
        matchedColor: "white",
        matchedTime: rec.resultTime || rec.audit?.winningResultTime || undefined,
      });
    }

    // Calcula também todos os gatilhos de Soma 19 e Soma 17
    const sumProjections = computeAllSumTriggerProjections(allResults);
    const sumMapBySlot = new Map<number, typeof sumProjections>();
    for (const sp of sumProjections) {
      const slot = sp.targetTimestamp;
      const list = sumMapBySlot.get(slot) || [];
      list.push(sp);
      sumMapBySlot.set(slot, list);
    }
    // Constrói todas as análises suportadas
    const strategyEngines = [
      { key: "A2", label: "A2 · Rep. Simples", fn: buildA2, isTop1: true },
      { key: "A3", label: "A3 · 2ª Pedra (Min 9)", fn: buildA3, isTop1: true },
      { key: "A4", label: "A4 · 1ª Dezena (Min 0)", fn: buildA4, isTop1: true },
      { key: "A5", label: "A5 · 2ª Dezena (Min 0)", fn: buildA5, isTop1: true },
      { key: "A10", label: "A10 · 8→11", fn: buildA8_11, isTop1: false },
      { key: "A11", label: "A11 · 11→11", fn: buildA11_11, isTop1: false },
      { key: "A12", label: "A12 · 4→11", fn: buildA4_11, isTop1: false },
      { key: "A13", label: "A13 · 4↔14", fn: buildA4_14, isTop1: false },
      { key: "A14", label: "A14 · Soma 17", fn: buildASoma17, isTop1: false },
      { key: "A15", label: "A15 · Soma 19", fn: buildASoma19, isTop1: false },
      { key: "A16", label: "A16 · Soma 21", fn: buildASoma21, isTop1: false },
      { key: "A17", label: "A17 · 1ª Pedra (Min 5)", fn: buildA1Minuto5, isTop1: false },
      { key: "A18", label: "A18 · 2ª Pedra (Min 5)", fn: buildA2Minuto5, isTop1: false },
      { key: "A19", label: "A19 · Sanduíche (P)", fn: buildASandwichPontas, isTop1: false },
      { key: "A20", label: "A20 · Sanduíche (M)", fn: buildASandwichMeio, isTop1: false },
      { key: "A21", label: "A21 · 7↔11", fn: buildA7_11, isTop1: false },
      { key: "A22", label: "A22 · 1ª Pedra (Min 1)", fn: buildA1Minuto1, isTop1: false },
      { key: "A23", label: "A23 · 2ª Pedra (Min 1)", fn: buildA2Minuto1, isTop1: false },
      { key: "A24", label: "A24 · 1ª Pedra (Min 2)", fn: buildA1Minuto2, isTop1: false },
      { key: "A25", label: "A25 · 2ª Pedra (Min 2)", fn: buildA2Minuto2, isTop1: false },
      { key: "A26", label: "A26 · 1ª Pedra (Min 3)", fn: buildA1Minuto3, isTop1: false },
      { key: "A27", label: "A27 · 2ª Pedra (Min 3)", fn: buildA2Minuto3, isTop1: false },
      { key: "A28", label: "A28 · 1ª Pedra (Min 4)", fn: buildA1Minuto4, isTop1: false },
      { key: "A29", label: "A29 · 2ª Pedra (Min 4)", fn: buildA2Minuto4, isTop1: false },
      { key: "A30", label: "A30 · 1ª Pedra (Min 6)", fn: buildA1Minuto6, isTop1: false },
      { key: "A31", label: "A31 · 2ª Pedra (Min 6)", fn: buildA2Minuto6, isTop1: false },
      { key: "A32", label: "A32 · 1ª Pedra (Min 7)", fn: buildA1Minuto7, isTop1: false },
      { key: "A33", label: "A33 · 2ª Pedra (Min 7)", fn: buildA2Minuto7, isTop1: false },
      { key: "A34", label: "A34 · 1ª Pedra (Min 8)", fn: buildA1Minuto8, isTop1: false },
      { key: "A35", label: "A35 · 2ª Pedra (Min 8)", fn: buildA2Minuto8, isTop1: false },
      { key: "A36", label: "A36 · 1ª Pedra (Min 9)", fn: buildA1Minuto9, isTop1: false },
    ];

    // Para cada ponto no histórico (com janela mínima de aquecimento de 50 giros)
    // Simulamos a emissão exata do sinal no momento em que ocorreu o gatilho
    const timeSlots = new Map<number, { top1: any[]; top3: any[] }>();

    for (const strat of strategyEngines) {
      const cycles = strat.fn(allResults);
      const byVal = new Map<number, Cycle[]>();
      for (const c of cycles) {
        if (!byVal.has(c.value)) byVal.set(c.value, []);
        byVal.get(c.value)!.push(c);
      }

      for (const [val, cList] of byVal.entries()) {
        // Regra: Ciclos válidos (com no mínimo um resultado obtido: gaps.length >= 1)
        const validList = cList.filter(isValidCycle);

        // Regra: Mínimo de 5 ciclos válidos (4 passados + 1 gatilho ativo) para envio de sinais.
        // Análises de 0 a 4 ciclos válidos no total são bloqueadas e NÃO geram sinais.
        if (validList.length < 5) continue;

        // Itera ciclos para projetar a partir do 5º ciclo válido (índice 4, com 4 ciclos anteriores para análise)
        for (let idx = 4; idx < validList.length; idx++) {
          // Se idx === 4 (5º ciclo): analisa os 4 anteriores (índices 0..3).
          // Se idx >= 5 (6º ciclo em diante): analisa os 5 ciclos anteriores mais recentes (janela deslizante de 5).
          const pastCycles = validList.slice(Math.max(0, idx - 5), idx);
          if (pastCycles.length < 4) continue;

          const currentTrigger = validList[idx];
          if (!currentTrigger?.triggerAt) continue;

          const topGroups = computeTop(pastCycles, 3);
          if (topGroups.length === 0) continue;

          topGroups.forEach((group, rankIdx) => {
            const isTop1 = strat.isTop1 && rankIdx === 0;
            // Regra: Top 1 >= 65% para gerar sinal
            if (isTop1 && group.pct < 65) return;
            // Regra: Top 3 >= 55%
            if (!isTop1 && group.pct < 55) return;

            let targetMinute = group.m;
            if (["A17", "A18"].includes(strat.key)) targetMinute += 1;
            const projectedDate = new Date(
              currentTrigger.triggerAt.getTime() + targetMinute * 60000,
            );
            const slotKey = Math.floor(projectedDate.getTime() / 60000) * 60000;

            if (!timeSlots.has(slotKey)) {
              timeSlots.set(slotKey, { top1: [], top3: [] });
            }

            const payload = {
              strategyKey: strat.key,
              strategyLabel: strat.label,
              value: val,
              pct: group.pct,
              isTop1,
              rank: rankIdx + 1,
              triggerAt: currentTrigger.triggerAt,
            };

            if (isTop1) {
              timeSlots.get(slotKey)!.top1.push(payload);
            } else {
              timeSlots.get(slotKey)!.top3.push(payload);
            }
          });
        }
      }
    }

    // Agora auditamos os sinais projetados nos slots temporais contra os giros reais
    let sortedSlots = Array.from(timeSlots.entries()).sort((a, b) => b[0] - a[0]);

    // Se estiver no modo "alimentar a partir de agora", filtra apenas slots a partir do momento em que a base foi limpa
    if (feedMode === "from_now") {
      sortedSlots = sortedSlots.filter(([slotTime]) => slotTime >= baselineTime - 60_000);
    }

    const nowTime = Date.now();

    for (const [slotTime, data] of sortedSlots.slice(0, maxSignalsToEvaluate)) {
      // Bloqueio de envio: se já houve branco no minuto anterior (M-1), o sinal é inválido para envio
      const whiteInM1 = allResults.some((r) => {
        const rTime = parseUtcDate(r.created_at).getTime();
        const isWhite = Number(r.roll) === 0 || r.color === "white";
        return isWhite && rTime >= slotTime - 60_000 && rTime < slotTime;
      });
      if (whiteInM1) continue;

      const distinctTop1 = new Set(data.top1.map((p) => p.strategyKey));
      const distinctTop3 = new Set(data.top3.map((p) => p.strategyKey));
      const totalSources = distinctTop1.size + distinctTop3.size;

      if (totalSources === 0) continue;

      let category: SignalAuditItem["category"] = "top1_top3";
      if (distinctTop1.size >= 4) {
        category = "alavancagem";
      } else if ((distinctTop1.size === 2 || distinctTop1.size === 3) && distinctTop3.size >= 2) {
        category = "supreme";
      } else if ((distinctTop1.size === 2 || distinctTop1.size === 3) && distinctTop3.size < 2) {
        category = "rare";
      } else if (distinctTop1.size === 1 && distinctTop3.size >= 1) {
        category = "top1_top3";
      } else {
        // Top 1 isolado e Top 3 apenas não são válidos para envio de sinais
        continue;
      }

      // Porcentagem média entre as fontes confluentes do sinal
      const allPcts = [...data.top1.map((p) => p.pct), ...data.top3.map((p) => p.pct)];
      const avgPct =
        allPcts.length > 0
          ? Math.round((allPcts.reduce((a, b) => a + b, 0) / allPcts.length) * 10) / 10
          : 0;

      const primary = data.top1[0] || data.top3[0];
      const slotDate = new Date(slotTime);

      // Verificação de alta precisão: Janela de 3 minutos completos (6 casas / 2 casas por minuto)
      // Minuto M - 1: [slotTime - 60_000, slotTime - 1]
      // Minuto M:     [slotTime, slotTime + 59_999]
      // Minuto M + 1: [slotTime + 60_000, slotTime + 119_999]
      const windowStart = slotTime - 60_000;
      const windowEnd = slotTime + 120_000 - 1; // Fim do segundo 59 do minuto M+1

      // O sinal expira somente após o encerramento do minuto M+1 (+ 35 segundos para receber os giros)
      const isPast = nowTime > windowEnd + 35_000;

      let status: "green" | "red" | "pending" = isPast ? "red" : "pending";
      let matchedRoll: number | undefined;
      let matchedColor: Color | undefined;
      let matchedTime: string | undefined;

      const hit = allResults.find((r) => {
        const rTime = parseUtcDate(r.created_at).getTime();
        const isWhite = Number(r.roll) === 0 || r.color === "white";
        return isWhite && rTime >= windowStart - 3_000 && rTime <= windowEnd + 3_000;
      });

      if (hit) {
        status = "green";
        matchedRoll = Number(hit.roll);
        matchedColor = "white";
        matchedTime = fmtTime(hit.created_at);
      }

      const matchingSums = sumMapBySlot.get(slotTime) || [];
      const sumLabels = matchingSums.map((s) => s.code).join(", ");
      const displayLabel =
        matchingSums.length > 0
          ? `${primary.strategyLabel} + Gatilho ${sumLabels}`
          : primary.strategyLabel;
      const displayKey =
        matchingSums.length > 0
          ? `${matchingSums[0].code} (${matchingSums[0].sumType})`
          : primary.strategyKey;

      signals.push({
        id: `audit-${slotTime}-${primary.strategyKey}`,
        timeStr: fmtTime(slotDate),
        timestamp: slotTime,
        strategyKey: displayKey,
        strategyLabel: displayLabel,
        sourceValue: primary.value,
        predictedMinute: slotDate.getMinutes(),
        projectedPct: avgPct,
        category,
        sourcesCount: totalSources,
        top1Count: distinctTop1.size,
        status,
        matchedRoll,
        matchedColor,
        matchedTime,
      });
    }

    // Métricas Globais e Comparativo Estatístico Real vs Projetado
    const finished = signals.filter((s) => s.status !== "pending");
    const wins = finished.filter((s) => s.status === "green").length;
    const total = finished.length;
    const realAssertivity = total > 0 ? (wins / total) * 100 : 0;

    // Assertividade Média Projetada (Teórica)
    const avgProjectedPct =
      total > 0 ? finished.reduce((acc, s) => acc + s.projectedPct, 0) / total : 0;

    // Estatísticas por Categoria de Confluência
    const catKeys: SignalAuditItem["category"][] = ["alavancagem", "supreme", "rare", "top1_top3"];

    const byCategory = catKeys.map((cat) => {
      const items = finished.filter((s) => s.category === cat);
      const w = items.filter((s) => s.status === "green").length;
      const t = items.length;
      const realPct = t > 0 ? (w / t) * 100 : 0;
      const projAvg = t > 0 ? items.reduce((acc, s) => acc + s.projectedPct, 0) / t : 0;
      return {
        category: cat,
        total: t,
        wins: w,
        losses: t - w,
        realPct,
        projectedAvg: projAvg,
        diff: realPct - projAvg,
      };
    });

    // Estatísticas por Estratégia
    const stratMap = new Map<
      string,
      { wins: number; total: number; projSum: number; label: string }
    >();
    finished.forEach((s) => {
      if (!stratMap.has(s.strategyKey)) {
        stratMap.set(s.strategyKey, { wins: 0, total: 0, projSum: 0, label: s.strategyLabel });
      }
      const st = stratMap.get(s.strategyKey)!;
      st.total += 1;
      st.projSum += s.projectedPct;
      if (s.status === "green") st.wins += 1;
    });

    const byStrategy = Array.from(stratMap.entries())
      .map(([k, v]) => ({
        key: k,
        label: v.label,
        total: v.total,
        wins: v.wins,
        losses: v.total - v.wins,
        realPct: v.total > 0 ? (v.wins / v.total) * 100 : 0,
        projectedAvg: v.total > 0 ? v.projSum / v.total : 0,
      }))
      .sort((a, b) => b.realPct - a.realPct);

    return {
      signals,
      stats: {
        totalEvaluated: total,
        totalWins: wins,
        totalLosses: total - wins,
        realAssertivity,
        avgProjectedPct,
        discrepancy: realAssertivity - avgProjectedPct,
        byCategory,
      },
      byStrategy,
    };
  }, [rawRows, maxSignalsToEvaluate, feedMode, baselineTime, timeTick]);

  // Filtros da tabela
  const filteredSignals = useMemo(() => {
    return auditResults.signals.filter((s) => {
      if (filterCategory !== "all" && s.category !== filterCategory) return false;
      if (filterStrategy !== "all" && s.strategyKey !== filterStrategy) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTime = s.timeStr.toLowerCase().includes(q);
        const matchStrat =
          s.strategyLabel.toLowerCase().includes(q) || s.strategyKey.toLowerCase().includes(q);
        if (!matchTime && !matchStrat) return false;
      }
      return true;
    });
  }, [auditResults.signals, filterCategory, filterStrategy, filterStatus, searchQuery]);

  return (
    <div className="mx-auto min-h-screen max-w-[1440px] bg-[#090909] px-4 py-6 space-y-6 text-foreground">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-outfit uppercase">
                Validador de Porcentagem & Sinais
              </h1>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black text-emerald-400 border border-emerald-500/30">
                AUDITORIA REAL (M-1, M, M+1)
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Auditoria de alta precisão: janela exata de 3 minutos (1 min antes, horário do sinal,
              1 min depois — 6 casas)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Modo */}
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1 text-xs">
            <button
              onClick={() => handleFeedModeChange("from_now")}
              className={`rounded-lg px-3 py-1.5 font-bold transition-colors ${
                feedMode === "from_now"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Alimentar de Agora
            </button>
            <button
              onClick={() => handleFeedModeChange("all")}
              className={`rounded-lg px-3 py-1.5 font-bold transition-colors ${
                feedMode === "all"
                  ? "bg-white/20 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Histórico Completo
            </button>
          </div>

          {/* Botão Limpar Base */}
          <button
            onClick={clearValidatorBase}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
            title="Limpa a base do validador e começa a registrar os sinais a partir deste momento"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar Base
          </button>

          {/* Botão Recalcular */}
          <button
            onClick={loadHistory}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {feedMode === "from_now" && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-xs text-emerald-400">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>
              <strong>Base Ativa:</strong> Alimentando sinais e rodadas em tempo real a partir de{" "}
              <strong>{fmtTime(new Date(baselineTime))}</strong>.
            </span>
          </div>
          <button
            onClick={clearValidatorBase}
            className="text-[11px] font-bold underline hover:text-emerald-300 transition-colors"
          >
            Reiniciar agora
          </button>
        </div>
      )}

      {/* Resumo Direto: A Porcentagem é Verdadeira? */}
      <div className="rounded-2xl border border-white/10 bg-[#0f0f11] p-6 shadow-2xl space-y-4">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/10 p-3 text-primary shrink-0">
            <HelpCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-base font-black uppercase text-white font-outfit">
              Como funciona a porcentagem exibida em cada sinal?
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-4xl">
              <strong>Sim, a porcentagem é 100% matemática e verdadeira</strong>: ela representa a
              <strong> taxa de frequência histórica real</strong> em que o Branco saiu no minuto
              projetado (janela M-1, M, M+1) após o gatilho daquela análise específica acontecer nos
              últimos ciclos.
              <br />
              Abaixo você pode auditar sinal a sinal e conferir se o sinal que prometeu, por
              exemplo, <strong>80% de assertividade</strong> realmente converteu em{" "}
              <strong>GREEN</strong>.
            </p>
          </div>
        </div>

        {/* Métricas Principais da Auditoria */}
        {auditResults.stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Sinais Auditados
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-outfit mt-1">
                {auditResults.stats.totalEvaluated}
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                {auditResults.stats.totalWins} Green / {auditResults.stats.totalLosses} Red
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                Assertividade Real
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-outfit mt-1">
                {auditResults.stats.realAssertivity.toFixed(1)}%
              </div>
              <div className="text-[10px] text-emerald-500/80 mt-0.5">Taxa de acertos reais</div>
            </div>

            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                Média Projetada
              </div>
              <div className="text-2xl sm:text-3xl font-black text-cyan-300 font-outfit mt-1">
                {auditResults.stats.avgProjectedPct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-cyan-500/80 mt-0.5">Porcentagem Teórica</div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Fidelidade Estatística
              </div>
              <div
                className={`text-2xl sm:text-3xl font-black font-outfit mt-1 ${
                  Math.abs(auditResults.stats.discrepancy) <= 5
                    ? "text-emerald-400"
                    : "text-amber-400"
                }`}
              >
                {auditResults.stats.discrepancy > 0 ? "+" : ""}
                {auditResults.stats.discrepancy.toFixed(1)}%
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Variação Real vs Teórico</div>
            </div>
          </div>
        )}
      </div>

      {/* Desempenho por Categoria de Confluência */}
      <div className="rounded-2xl border border-white/5 bg-[#0c0c0c] p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white font-outfit">
            Assertividade Real por Tipo de Sinal & Confluência
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {auditResults.stats?.byCategory.map((cat) => {
            const labelMap: Record<string, { name: string; badge: string }> = {
              alavancagem: {
                name: "🚀 Alavancagem (4+ Top 1)",
                badge: "bg-white text-black font-black",
              },
              supreme: {
                name: "👑 Supremo (2-3x Top 1 + 2+ Top 2/3)",
                badge: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
              },
              rare: {
                name: "💎 Raro (2-3x Top 1)",
                badge: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
              },
              top1_top3: {
                name: "⚡ Top 1 & Top 3",
                badge: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
              },
            };

            const info = labelMap[cat.category] || {
              name: cat.category,
              badge: "bg-white/10 text-white",
            };

            return (
              <div
                key={cat.category}
                className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${info.badge}`}>
                    {info.name}
                  </span>
                  <span className="text-xs font-bold text-zinc-400 tabular-nums">
                    {cat.wins}W / {cat.losses}L
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">
                      Assertividade Real
                    </div>
                    <div className="text-2xl font-black text-white font-outfit">
                      {cat.realPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">
                      Teórico
                    </div>
                    <div className="text-sm font-black text-zinc-400 font-outfit">
                      {cat.projectedAvg.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, cat.realPct))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabela Detalhada com Filtros */}
      <div className="rounded-2xl border border-white/5 bg-[#0c0c0c] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-black uppercase tracking-widest text-white font-outfit">
                Registro Individual de Sinais & Conferência
              </h3>
            </div>

            {/* Controles de Busca e Filtro */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar horário ou análise..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/40 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-primary"
                />
              </div>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary"
              >
                <option value="all">Todas Categorias</option>
                <option value="alavancagem">🚀 Alavancagem (4+ Top 1)</option>
                <option value="supreme">👑 Supremo (2-3x Top 1 + 2+ Top 2/3)</option>
                <option value="rare">💎 Raro (2-3x Top 1)</option>
                <option value="top1_top3">⚡ Top 1 & Top 3</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary"
              >
                <option value="all">Todos Status</option>
                <option value="green">Apenas GREEN (Win)</option>
                <option value="red">Apenas RED (Loss)</option>
                <option value="pending">Pendentes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/5 bg-white/[0.01] text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
              <tr>
                <th className="px-6 py-3">Horário</th>
                <th className="px-6 py-3">Estratégia / Gatilho</th>
                <th className="px-6 py-3">Categoria</th>
                <th className="px-6 py-3 text-right">Porcentagem Teórica</th>
                <th className="px-6 py-3 text-center">Conferência Real</th>
                <th className="px-6 py-3 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-zinc-500">
                    {loading
                      ? "Carregando auditoria..."
                      : "Nenhum sinal encontrado com os filtros selecionados."}
                  </td>
                </tr>
              ) : (
                filteredSignals.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-3 font-bold text-white font-outfit text-sm">
                      {s.timeStr}
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-semibold text-zinc-200">{s.strategyLabel}</div>
                      <div className="text-[10px] text-zinc-500">
                        Pedra Gatilho: {s.sourceValue} · {s.sourcesCount} fonte(s)
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {s.category === "alavancagem" ? (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-black">
                          🚀 ALAVANCAGEM
                        </span>
                      ) : s.category === "supreme" ? (
                        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[9px] font-black text-purple-300 border border-purple-500/30">
                          👑 SUPREMO
                        </span>
                      ) : s.category === "rare" ? (
                        <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[9px] font-black text-cyan-300 border border-cyan-500/30">
                          💎 RARO
                        </span>
                      ) : s.category === "top1_top3" ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-black text-amber-300 border border-amber-500/30">
                          ⚡ TOP 1 + TOP 3
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold text-zinc-400 border border-white/10">
                          {s.category === "top1_isolated" ? "🎯 TOP 1" : "📊 TOP 3"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right font-black text-white font-outfit text-sm">
                      {s.projectedPct.toFixed(1)}%
                    </td>
                    <td className="px-6 py-3 text-center">
                      {s.status === "green" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Branco saiu às {s.matchedTime}
                        </span>
                      ) : s.status === "red" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400">
                          <XCircle className="h-3.5 w-3.5" /> Sem Branco na Janela
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400">
                          <Clock className="h-3.5 w-3.5" /> Aguardando Horário
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className={`rounded-md px-2 py-1 text-[10px] font-black ${
                          s.status === "green"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : s.status === "red"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-white/5 text-zinc-400 border border-white/10"
                        }`}
                      >
                        {s.status === "green"
                          ? "WIN (GREEN)"
                          : s.status === "red"
                            ? "LOSS (RED)"
                            : "PENDENTE"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
