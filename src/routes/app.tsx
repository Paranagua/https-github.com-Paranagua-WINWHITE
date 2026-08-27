"use client";

import { createFileRoute } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Activity,
  Bell,
  Flame,
  Loader2,
  Moon,
  Settings,
  Sparkles,
  Sun,
  TrendingUp,
  Wifi,
  WifiOff,
  Maximize2,
  X,
  Clock,
  ChevronDown,
  BarChart3,
  Crown,
  Send,
} from "lucide-react";

import { useVipStatus } from "@/lib/auth/vipStore";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { setSection } from "@/lib/sectionStore";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { Card } from "@/components/double/Card";
import { ResultCircle } from "@/components/double/ResultCircle";
import { Switch } from "@/components/double/Switch";
import { WhiteCelebration, WhiteAlertToggleFx } from "@/components/double/WhiteCelebration";
import { StrategyTabs } from "@/components/double/StrategyTabs";
import { LeftStatsDrawer } from "@/components/double/LeftStatsDrawer";
import { LiveStats } from "@/components/double/LiveStats";

import { colorOf, fmtTime, type Spin } from "@/components/double/types";
import {
  BlazeResultCard,
  BLAZE_CARD_W,
  BLAZE_GAP_X,
  BLAZE_GAP_Y,
} from "@/components/double/BlazeResultCard";

import {
  getSignals,
  subscribeSignals,
  type StoredSignal,
  getRobotEnabled,
  subscribeRobot,
} from "@/lib/signalsStore";
import { Sidebar } from "@/components/Sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useSection } from "@/lib/sectionStore";
import { useSidebarStore } from "@/lib/sidebarStore";
import { cn } from "@/lib/utils";
import freitasLogo from "@/assets/freitas-logo.jpg.asset.json";
import SinaisPage from "@/components/sections/SinaisSection";
import AnaliseSection from "@/components/sections/AnaliseSection";
import EstrategiasSection from "@/components/sections/EstrategiasSection";
import HostmanSection from "@/components/sections/HostmanSection";
import ValidadorSection from "@/components/sections/ValidadorSection";

function SectionFallback() {
  return (
    <div className="flex h-[400px] w-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-red-500" />
    </div>
  );
}

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Freitas da Blaze — Análise do Histórico da Blaze" },
      {
        name: "description",
        content:
          "Freitas da Blaze: análise do histórico da Blaze em tempo real, sequências, frequência e alerta de branco.",
      },
      { property: "og:title", content: "Freitas da Blaze — Análise do Histórico da Blaze" },
      {
        property: "og:description",
        content:
          "Freitas da Blaze: análise do histórico da Blaze em tempo real, sequências, frequência e alerta de branco.",
      },
    ],
  }),
  component: Index,
});

const POLL_MS = 10000;
const PAGE_SIZE = 150;

type Row = {
  id: number;
  roll: string;
  color: string;
  created_at: string;
};

type FilterId = "hoje" | "ontem" | "7d" | "30d" | "custom";

function normalizeColor(v: string): Spin["color"] | null {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (["red", "vermelho", "vermelha", "r"].includes(s)) return "red";
  if (["black", "preto", "preta", "b"].includes(s)) return "black";
  if (["white", "branco", "branca", "w"].includes(s)) return "white";
  return null;
}

function rowToSpin(r: Row): Spin {
  const rollNumber = Number(r.roll);
  const colorNumber = Number(r.color);
  const hasRollNumber = Number.isFinite(rollNumber);
  const hasColorNumber = Number.isFinite(colorNumber);
  const n = hasRollNumber ? rollNumber : hasColorNumber ? colorNumber : 0;
  const color = normalizeColor(r.color) ?? normalizeColor(r.roll) ?? colorOf(n);
  return {
    id: String(r.id),
    n,
    color,
    time: fmtTime(r.created_at),
    createdAt: r.created_at,
  };
}

function dedupeById<T extends { id: number | string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const key = String(item.id);
    if (!key || key === "undefined" || key === "null") continue;
    if (!byId.has(key)) byId.set(key, item);
  }
  return Array.from(byId.values());
}

const spSecondsFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function spTimeWithSeconds(spin: Spin): string {
  const raw = (spin.createdAt ?? "").trim();
  if (!raw) return spin.time;
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  const d = new Date(hasTz ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return spin.time;
  return spSecondsFormatter.format(d);
}

const BRANCO_IMG = "/images/branco.svg";

// Retorna YYYY-MM-DD para uma data no fuso America/Sao_Paulo.
function spYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Constrói um instante ISO UTC a partir de uma data (YYYY-MM-DD) e hora (HH:mm[:ss]) no fuso SP (UTC-3, sem DST).
function spToUtcIso(ymd: string, hms: string): string {
  const time = hms.length === 5 ? `${hms}:00` : hms;
  return new Date(`${ymd}T${time}-03:00`).toISOString();
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

function computeRange(
  filter: FilterId,
  customStart: string,
  customEnd: string,
  timeStart: string,
  timeEnd: string,
): { start: string | null; end: string | null; includesNow: boolean } {
  const today = spYmd();
  const now = new Date().toISOString();
  const tStart = timeStart || "00:00";
  const tEnd = timeEnd || "23:59:59.999";

  if (filter === "hoje") {
    return {
      start: spToUtcIso(today, tStart),
      end: spToUtcIso(today, tEnd),
      includesNow: true,
    };
  }
  if (filter === "ontem") {
    const y = addDaysYmd(today, -1);
    return { start: spToUtcIso(y, tStart), end: spToUtcIso(y, tEnd), includesNow: false };
  }
  if (filter === "7d") {
    return { start: spToUtcIso(addDaysYmd(today, -6), tStart), end: now, includesNow: true };
  }
  if (filter === "30d") {
    return { start: spToUtcIso(addDaysYmd(today, -29), tStart), end: now, includesNow: true };
  }
  // custom
  if (!customStart && !customEnd) return { start: null, end: null, includesNow: true };
  const s = customStart || customEnd;
  const e = customEnd || customStart;
  return {
    start: spToUtcIso(s, tStart),
    end: spToUtcIso(e, tEnd),
    includesNow: new Date(spToUtcIso(e, tEnd)).getTime() >= Date.now(),
  };
}

const ColumnBlock = memo(function ColumnBlock({
  col,
  spins,
  highlightN,
  setHighlightN,
  highlightKey,
  inverse,
  numerado,
  destaqueHorario,
  exibirSegundos,
  contarColunas,
  futureSlots,
  slotPredictions,
  cycleSlotPrediction,
  signalsByHM,
}: any) {
  const isActive = highlightKey === String(col);
  const filtered = spins.filter((s: any) => s.time.endsWith(String(col)));
  const rows = chunk(filtered, 2);

  return (
    <div
      className={`flex flex-col gap-y-2 rounded-lg border border-transparent p-1 transition-colors duration-300`}
    >
      {rows.map((pair: any[], rIdx: number) => (
        <div key={rIdx} className="flex gap-x-0">
          <BlazeResultCardWrapper
            item={pair[0]}
            isActive={isActive}
            highlightKey={highlightKey}
            highlightN={highlightN}
            setHighlightN={setHighlightN}
            numerado={numerado}
            destaqueHorario={destaqueHorario}
            exibirSegundos={exibirSegundos}
            signalsByHM={signalsByHM}
          />
          <BlazeResultCardWrapper
            item={pair[1]}
            isActive={isActive}
            highlightKey={highlightKey}
            highlightN={highlightN}
            setHighlightN={setHighlightN}
            numerado={numerado}
            destaqueHorario={destaqueHorario}
            exibirSegundos={exibirSegundos}
            signalsByHM={signalsByHM}
          />
        </div>
      ))}
    </div>
  );
});

const BlazeResultCardWrapper = memo(function BlazeResultCardWrapper({
  item,
  isActive,
  highlightKey,
  highlightN,
  setHighlightN,
  numerado,
  destaqueHorario,
  exibirSegundos,
  signalsByHM,
}: any) {
  if (!item) return <div className="h-[64px] w-[52px]" />;
  return (
    <div className="flex flex-col items-center">
      <BlazeResultCard
        n={item.n}
        color={item.color}
        time={exibirSegundos ? spTimeWithSeconds(item) : item.time}
        numbered={numerado}
        timeHighlight={destaqueHorario}
        signal={signalsByHM.get(item.time)?.[0]}
        dimmed={
          (highlightKey !== null && !isActive) || (highlightN.size > 0 && !highlightN.has(item.n))
        }
        selected={highlightN.has(item.n)}
        onClick={() =>
          setHighlightN?.((h: Set<number>) => {
            const next = new Set(h);
            if (next.has(item.n)) next.delete(item.n);
            else next.add(item.n);
            return next;
          })
        }
      />
    </div>
  );
});

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

function Index() {
  const section = useSection();
  // Sync router with section if needed, though they currently live in /app
  // This helps if we ever move to deep routes but keep the section store
  useEffect(() => {
    // If we're at /app, make sure the UI matches the section store
    // (This is redundant now but good for future router migration)
  }, [section]);

  const [inverse, setInverse] = useState(false);
  const [viewMode, setViewMode] = useState<"colunas" | "lista">("colunas");
  const { isCollapsed, toggle } = useSidebarStore();
  const isVip = useVipStatus();

  // Sempre que inicia no celular ou tablet, o histórico deve estar com coluna fixa desabilitada e sentido inverso habilitado
  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      setViewMode("lista");
      setInverse(true);
    }
  }, []);

  // Protect current section if VIP is lost
  useEffect(() => {
    if (section !== "dashboard" && section !== "videos" && section !== "hostman" && !isVip) {
      setSection("dashboard");
      toast.error("Membro VIP Expirado", {
        description: "Você foi redirecionado para o Histórico pois não possui acesso VIP.",
      });
    }
  }, [section, isVip]);

  const [whiteAlert, setWhiteAlert] = useState(true);
  const [alertFx, setAlertFx] = useState<"on" | "off" | null>(null);
  const toggleWhiteAlert = useCallback((next: boolean) => {
    setWhiteAlert(next);
    setAlertFx(next ? "on" : "off");
  }, []);
  const [realtime, setRealtime] = useState(true);
  const [robotOn, setRobotOn] = useState(getRobotEnabled());

  useEffect(() => {
    const sub = subscribeRobot(() => {
      setRobotOn(getRobotEnabled());
    });
    return sub;
  }, []);
  const [numerado, setNumerado] = useState(false);
  const [destaqueHorario, setDestaqueHorario] = useState(false);
  const [exibirSegundos, setExibirSegundos] = useState(false);
  const [contarColunas, setContarColunas] = useState(false);
  const [contarLinhas, setContarLinhas] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [futureSlots, setFutureSlots] = useState<0 | 10 | 20 | 30>(0);
  const [highlightN, setHighlightN] = useState<Set<number>>(() => new Set());
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [slotPredictions, setSlotPredictions] = useState<Record<string, "white" | "red" | "black">>(
    {},
  );
  const cycleSlotPrediction = (key: string) =>
    setSlotPredictions((prev) => {
      const cur = prev[key];
      const next =
        cur === undefined ? "white" : cur === "white" ? "red" : cur === "red" ? "black" : undefined;
      const copy = { ...prev };
      if (next === undefined) delete copy[key];
      else copy[key] = next;
      return copy;
    });

  const [spins, setSpins] = useState<Spin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [whiteFlash, setWhiteFlash] = useState<Spin | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setStatsOpen(true);
    window.addEventListener("open-stats-drawer", handleOpen);
    return () => window.removeEventListener("open-stats-drawer", handleOpen);
  }, []);

  const [countdown, setCountdown] = useState(15);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const ThemeToggle = () => (
    <button
      type="button"
      onClick={toggleTheme}
      className="grid h-8 w-8 place-items-center rounded-xl border border-white/5 bg-white/5 text-muted-foreground transition-all duration-300 hover:bg-white/[0.08] hover:text-foreground active:scale-90 sm:h-10 sm:w-10 lg:h-11 lg:w-11"
      aria-label="Trocar brilho"
      title="Alternar entre modo claro e escuro"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );

  // Filtros
  const [filter, setFilter] = useState<FilterId>("hoje");
  const today = useMemo(() => spYmd(), []);
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [appliedTick, setAppliedTick] = useState(0);

  const range = useMemo(
    () => computeRange(filter, customStart, customEnd, timeStart, timeEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, appliedTick],
  );

  const seen = useRef<Set<string>>(new Set());
  const lastWhiteId = useRef<string | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const buildQuery = useCallback(
    (from: number, to: number) => {
      let q = supabase
        .from("blaze_results")
        .select("id, roll, color, created_at")
        .order("id", { ascending: false })
        .range(from, to);
      if (range.start) q = q.gte("created_at", range.start);
      if (range.end) q = q.lte("created_at", range.end);
      return q;
    },
    [range.start, range.end],
  );

  const loadInitial = useCallback(async () => {
    const { data, error } = await buildQuery(0, PAGE_SIZE - 1);
    if (error) throw error;
    return (data ?? []) as Row[];
  }, [buildQuery]);

  // Carga inicial ao trocar filtro.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setHasMore(true);
    seen.current = new Set();
    isFirstLoad.current = true;
    (async () => {
      try {
        const rows = await loadInitial();
        if (!alive) return;
        const uniq = dedupeById(rows);
        seen.current = new Set(uniq.map((r) => String(r.id)));
        setSpins(uniq.map(rowToSpin));
        setHasMore(rows.length === PAGE_SIZE);
        setStatus("live");
        setErrorMsg("");
      } catch (error) {
        setStatus("error");
        setErrorMsg(error instanceof Error ? error.message : "Falha ao carregar histórico");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const offset = spins.length;
      const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      setSpins((prev) => {
        const merged = dedupeById([...prev, ...rows.map(rowToSpin)]);
        seen.current = new Set(merged.map((s) => s.id));
        return merged;
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      setStatus("error");
      setErrorMsg(error instanceof Error ? error.message : "Falha ao carregar mais");
    } finally {
      setLoadingMore(false);
    }
  }, [buildQuery, hasMore, loadingMore, spins.length]);

  // Realtime — só insere se a nova rodada está no intervalo ativo.
  useEffect(() => {
    if (!realtime) return;
    const channel = supabase
      .channel("blaze_results_inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "blaze_results" },
        (payload: any) => {
          const r = payload.new as Row;
          const key = String(r?.id);
          if (!r || seen.current.has(key)) return;
          const t = new Date(r.created_at).getTime();
          if (range.start && t < new Date(range.start).getTime()) return;
          if (range.end && t > new Date(range.end).getTime()) return;
          seen.current.add(key);
          setSpins((prev) => {
            if (prev.some((s) => s.id === key)) return prev;
            return dedupeById([rowToSpin(r), ...prev]);
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [range.start, range.end, realtime]);

  // Polling leve e Processamento de Gatilhos em Background
  useEffect(() => {
    if (!range.includesNow || !realtime) return;
    let alive = true;

    const poll = async () => {
      if (!alive) return;
      // Removido document.hidden para processar gatilhos em segundo plano
      try {
        const { data, error } = await buildQuery(0, PAGE_SIZE - 1);
        if (error) throw error;
        if (!alive) return;
        const rows = (data ?? []) as Row[];
        const fresh = rows.filter((r) => !seen.current.has(String(r.id)));

        if (fresh.length > 0) {
          setSpins((prev) => {
            const merged = dedupeById([...fresh.map(rowToSpin), ...prev]);
            seen.current = new Set(merged.map((s) => s.id));
            return merged;
          });
        }
        setStatus("live");
        setErrorMsg("");
      } catch (error) {
        if (!alive) return;
        setStatus("error");
        setErrorMsg(error instanceof Error ? error.message : "Falha ao atualizar");
      }
    };

    const timer = setInterval(poll, POLL_MS);
    // Notificamos mudanças mesmo com a aba "escondida" para garantir que Gatilhos e Sinais
    // continuem sendo calculados em background.
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [buildQuery, range.includesNow, realtime]);

  // Countdown estético
  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? 15 : c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // White alert.
  useEffect(() => {
    if (spins.length === 0) return;
    const newestWhite = spins.find((s) => s.color === "white");
    if (!newestWhite) return;
    if (newestWhite.id === lastWhiteId.current) return;
    lastWhiteId.current = newestWhite.id;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    if (!whiteAlert) return;
    setWhiteFlash(newestWhite);
    try {
      // Assinatura premium: um chime luminoso acompanha o início dos fogos.
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const context = new AudioContextClass();
        const now = context.currentTime;
        const master = context.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
        master.connect(context.destination);
        [659.25, 783.99, 987.77].forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, now + index * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.42, now + index * 0.09 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
          oscillator.connect(gain).connect(master);
          oscillator.start(now + index * 0.09);
          oscillator.stop(now + 1.85);
        });
        window.setTimeout(() => void context.close(), 2200);
      }
    } catch (error) {
      console.error("White alert audio failed:", error);
    }
    const t = setTimeout(() => setWhiteFlash(null), 3000); // Reduzido para 3 segundos para sumir mais rápido
    return () => clearTimeout(t);
  }, [spins, whiteAlert]);

  // spins já é dedup no setter (loadInitial/loadMore/poll/realtime), evita O(n) por render.
  const visibleSpins = spins;
  // Rendering de listas longas é deferrable para manter cliques/toggles responsivos.
  const deferredSpins = useDeferredValue(visibleSpins);

  // Stats
  const total = visibleSpins.length;
  const counts = useMemo(
    () =>
      visibleSpins.reduce(
        (acc, spin) => {
          acc[spin.color] += 1;
          acc.byNumber[spin.n] = (acc.byNumber[spin.n] ?? 0) + 1;
          return acc;
        },
        { red: 0, black: 0, white: 0, byNumber: {} as Record<number, number> },
      ),
    [visibleSpins],
  );
  const reds = counts.red;
  const blacks = counts.black;
  const whites = counts.white;
  const redPct = total ? (reds / total) * 100 : 0;
  const blackPct = total ? (blacks / total) * 100 : 0;
  const whitePct = total ? (whites / total) * 100 : 0;
  const last = visibleSpins[0];
  const lastWhiteIdx = visibleSpins.findIndex((s) => s.color === "white");
  const lastWhiteAgo = lastWhiteIdx >= 0 ? lastWhiteIdx : visibleSpins.length;

  const lastWhiteMinutesAgo = useMemo(() => {
    if (lastWhiteIdx < 0) return null;
    return Math.floor(lastWhiteIdx / 2);
  }, [lastWhiteIdx]);

  const maxGapToday = useMemo(() => {
    let maxGap = 0;
    let currentGap = 0;
    let maxGapStartSpin: Spin | null = null;
    let currentGapStartSpin: Spin | null = null;

    // Work with spins from today only
    const todayYmd = spYmd();
    const todaySpins = visibleSpins.filter((s) => {
      const raw = (s.createdAt ?? "").trim();
      if (!raw) return false;
      const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
      const d = new Date(hasTz ? raw : `${raw.replace(" ", "T")}Z`);
      return spYmd(d) === todayYmd;
    });

    if (todaySpins.length === 0) return { gap: 0, startTime: null };

    // Spins are ordered newest to oldest [0 is newest]
    // To find gaps between whites, we iterate from oldest to newest
    const reversedToday = [...todaySpins].reverse();

    // Start of the day until the first white of the day is also a gap,
    // but usually "Casas do Branco" refers to gaps BETWEEN whites or since the last white.
    // The user photo says "O máximo de hoje foi de 70 casas, começando no branco das 10:11"
    // This implies the gap started AFTER a white at 10:11.

    for (const spin of reversedToday) {
      if (spin.color === "white") {
        if (currentGap > maxGap) {
          maxGap = currentGap;
          maxGapStartSpin = currentGapStartSpin;
        }
        currentGap = 0;
        currentGapStartSpin = spin;
      } else {
        currentGap++;
      }
    }

    // Check if the current ongoing gap is the maximum
    if (currentGap > maxGap) {
      maxGap = currentGap;
      maxGapStartSpin = currentGapStartSpin;
    }

    return {
      gap: maxGap,
      startTime: maxGapStartSpin ? maxGapStartSpin.time : null,
    };
  }, [visibleSpins]);

  const freq = useMemo(
    () => Array.from({ length: 15 }, (_, n) => ({ n, count: counts.byNumber[n] ?? 0 })),
    [counts.byNumber],
  );

  const storedSignals = useSyncExternalStore(subscribeSignals, getSignals, getSignals);

  type GridRow = { key: string; label: string; order: number; cells: Spin[][] };

  const gridRows: GridRow[] = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const rowMap = new Map<string, GridRow>();
    for (const s of deferredSpins) {
      const raw = (s.createdAt ?? "").trim();
      if (!raw) continue;
      const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
      const d = new Date(hasTz ? raw : `${raw.replace(" ", "T")}Z`);
      if (Number.isNaN(d.getTime())) continue;
      const parts = formatter.formatToParts(d);
      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
      const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
      const tens = Math.floor(minute / 10);
      const unit = minute % 10;

      // Filtro de Coluna no modo Colunas Fixas removido para permitir ver todas as pedras
      // (a seleção visual agora é feita via opacidade/dimmed)

      const key = `${hour}:${tens}`;
      let row = rowMap.get(key);
      if (!row) {
        row = {
          key,
          label: `${String(hour).padStart(2, "0")}:${tens}0`,
          order: hour * 6 + tens,
          cells: Array.from({ length: 10 }, () => []),
        };
        rowMap.set(key, row);
      }
      row.cells[unit].push(s);
    }
    // Garante que blocos com sinais pendentes/verdes apareçam mesmo sem spins ainda.
    for (const s of storedSignals) {
      const d = new Date(s.targetIso);
      if (Number.isNaN(d.getTime())) continue;
      const parts = formatter.formatToParts(d);
      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
      const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
      const tens = Math.floor(minute / 10);
      const unit = minute % 10;

      // Filtro de Coluna no modo Colunas Fixas para sinais removido

      const key = `${hour}:${tens}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          key,
          label: `${String(hour).padStart(2, "0")}:${tens}0`,
          order: hour * 6 + tens,
          cells: Array.from({ length: 10 }, () => []),
        });
      }
    }
    // Adiciona blocos futuros vazios (+10/+20/+30 minutos à frente do agora).
    if (futureSlots > 0) {
      const now = new Date(Date.now() + futureSlots * 60_000);
      const start = new Date();
      // gera todos os blocos de 10min entre agora e agora+futureSlots
      const stepMs = 10 * 60_000;
      for (let t = start.getTime(); t <= now.getTime(); t += stepMs) {
        const d = new Date(t);
        const parts = formatter.formatToParts(d);
        const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
        const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
        const tens = Math.floor(minute / 10);
        const key = `${hour}:${tens}`;

        // No filtro de coluna, a lógica de blocos futuros pode ser complexa.
        // Mantemos a simplicidade: se o bloco de 10min existe, ele é exibido.
        // O unit filter acima já garante que apenas a coluna certa dentro desse bloco apareça.

        if (!rowMap.has(key)) {
          rowMap.set(key, {
            key,
            label: `${String(hour).padStart(2, "0")}:${tens}0`,
            order: hour * 6 + tens,
            cells: Array.from({ length: 10 }, () => []),
          });
        }
      }
    }
    // Pré-ordena cada célula por tempo (antes era feito por célula em cada render).
    const rows = Array.from(rowMap.values());
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.length > 1) {
          cell.sort((a, b) => {
            const at = new Date(a.createdAt ?? "").getTime();
            const bt = new Date(b.createdAt ?? "").getTime();
            return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
          });
        }
      }
    }
    return rows.sort((a, b) => b.order - a.order);
  }, [deferredSpins, storedSignals, futureSlots, viewMode, highlightKey]);

  const applyCustom = () => setAppliedTick((v) => v + 1);
  const historyGridTemplate = `repeat(10, var(--colW, 120px))`;

  // Contagens auxiliares dos toggles "Contar colunas" / "Contar linhas".
  const colCounts = useMemo(() => {
    const acc = Array.from({ length: 10 }, () => 0);
    for (const row of gridRows) {
      row.cells.forEach((cell, i) => {
        acc[i] += cell.length;
      });
    }
    return acc;
  }, [gridRows]);

  /** Percentual de vermelho / preto / branco por coluna (00–09). */
  const colStats = useMemo(() => {
    const acc = Array.from({ length: 10 }, () => ({ red: 0, black: 0, white: 0, total: 0 }));
    for (const row of gridRows) {
      row.cells.forEach((cell, i) => {
        for (const spin of cell) {
          if (spin.color === "red") acc[i].red += 1;
          else if (spin.color === "black") acc[i].black += 1;
          else if (spin.color === "white") acc[i].white += 1;
          else continue;
          acc[i].total += 1;
        }
      });
    }
    return acc.map((c) => ({
      ...c,
      redPct: c.total ? (c.red / c.total) * 100 : 0,
      blackPct: c.total ? (c.black / c.total) * 100 : 0,
      whitePct: c.total ? (c.white / c.total) * 100 : 0,
    }));
  }, [gridRows]);

  const signalsByHM = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const map = new Map<string, StoredSignal[]>();
    for (const s of storedSignals) {
      const d = new Date(s.targetIso);
      if (Number.isNaN(d.getTime())) continue;
      const key = fmt.format(d); // "HH:MM"
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [storedSignals]);

  return (
    <div className="relative flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar lateral fixa com transição suave - Mobile overlay support */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out lg:relative lg:z-0 lg:block lg:shrink-0",
          isCollapsed ? "w-0 lg:w-[80px]" : "w-[260px]",
        )}
      >
        <Sidebar />
      </div>

      {/* Background overlay for mobile when menu is open */}
      {!isCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={toggle}
        />
      )}

      {/* Área principal scrollable - flex-1 garante que ocupa o resto do espaço */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <AppHeader />

        <div className="flex-1 overflow-y-auto scrollbar-none">
          {section === "sinais" ? (
            <Suspense fallback={<SectionFallback />}>
              <SinaisPage />
            </Suspense>
          ) : section === "validador" ? (
            <Suspense fallback={<SectionFallback />}>
              <ValidadorSection />
            </Suspense>
          ) : section === "analise" ? (
            <Suspense fallback={<SectionFallback />}>
              <AnaliseSection />
            </Suspense>
          ) : section === "estrategias" ? (
            <Suspense fallback={<SectionFallback />}>
              <EstrategiasSection />
            </Suspense>
          ) : section === "hostman" ? (
            <Suspense fallback={<SectionFallback />}>
              <HostmanSection />
            </Suspense>
          ) : section !== "dashboard" ? (
            <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-10 sm:gap-6 sm:px-6 sm:py-16">
              <Card delay={0.05}>
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Seção
                  </div>
                  <h2 className="text-2xl font-semibold text-foreground capitalize">{section}</h2>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Conteúdo desta seção em construção. Em breve você verá aqui os dados específicos
                    de <span className="capitalize text-foreground">{section}</span>.
                  </p>
                </div>
              </Card>
            </main>
          ) : (
            <main className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
              {/* Novas métricas estilo Blaze Dashboard */}
              <LiveStats
                total={total}
                reds={reds}
                blacks={blacks}
                whites={whites}
                redPct={redPct}
                blackPct={blackPct}
                whitePct={whitePct}
                countdown={countdown}
              />

              <section className="space-y-3 sm:space-y-5 lg:space-y-6">
                {/* Seção de Resumo Rápido (Último Giro, Último Branco, Casas do Branco) */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Card className="flex flex-col p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-[13px] font-bold text-white uppercase tracking-tight">
                          Último Giro
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Flame className="h-3 w-3 text-red-500 fill-red-500" />
                          <span className="text-[11px] text-muted-foreground">
                            Rodada mais recente.
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <ResultCircle
                          n={last?.n ?? 0}
                          color={last?.color ?? "white"}
                          size="sm"
                          className="rounded-md shadow-lg"
                        />
                        <span className="text-[10px] font-medium text-muted-foreground mt-1.5 tabular-nums">
                          {last ? spTimeWithSeconds(last) : "--:--:--"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-auto border-t border-white/5 pt-3">
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-bold text-white">
                          {last
                            ? 180 + ((last.n * 23 + (last.color === "red" ? 45 : 12)) % 320)
                            : 240}
                        </span>{" "}
                        pessoas apostaram no{" "}
                        <span className="font-bold text-white capitalize">
                          {last?.color === "red"
                            ? "Vermelho"
                            : last?.color === "black"
                              ? "Preto"
                              : "Branco"}
                        </span>{" "}
                        nessa rodada.
                      </p>
                    </div>
                  </Card>

                  <Card className="flex flex-col p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-[13px] font-bold text-white uppercase tracking-tight">
                          Último Branco
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock className="h-3 w-3 text-red-500" />
                          <span className="text-[11px] text-muted-foreground">
                            {lastWhiteAgo} rodadas atrás.
                            {lastWhiteMinutesAgo !== null && (
                              <span className="block mt-0.5">
                                {lastWhiteMinutesAgo >= 60
                                  ? `${Math.floor(lastWhiteMinutesAgo / 60)}h ${lastWhiteMinutesAgo % 60}min atrás`
                                  : `${lastWhiteMinutesAgo} minutos atrás`}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                          <img src={BRANCO_IMG} alt="Branco" className="h-5 w-5 object-contain" />
                        </div>
                        <span className="text-[10px] font-bold text-white mt-1.5 tabular-nums">
                          {visibleSpins[lastWhiteIdx]?.time ?? "--:--"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-auto border-t border-white/5 pt-3">
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-bold text-white">
                          {lastWhiteIdx >= 0 ? 850 + ((lastWhiteIdx * 67) % 950) : 1120}
                        </span>{" "}
                        pessoas pegaram esse branco.
                      </p>
                    </div>
                  </Card>

                  <Card className="flex flex-col p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-[13px] font-bold text-white uppercase tracking-tight">
                          Casas do Branco
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <BarChart3 className="h-3 w-3 text-red-500" />
                          <span className="text-[11px] text-muted-foreground">
                            <span className="font-bold text-white">
                              {lastWhiteIdx >= 0 ? lastWhiteIdx : total}
                            </span>{" "}
                            resultados, desde o último branco.
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto border-t border-white/5 pt-3">
                      <p className="text-[11px] text-muted-foreground">
                        O máximo de hoje foi de{" "}
                        <span className="font-bold text-white">{maxGapToday.gap}</span> casas,{" "}
                        {maxGapToday.startTime ? (
                          <>
                            começando no branco das{" "}
                            <span className="font-bold text-white">{maxGapToday.startTime}</span>
                          </>
                        ) : (
                          "sem brancos registrados hoje"
                        )}
                        .
                      </p>
                    </div>
                  </Card>
                </div>

                <Card
                  title="Giros anteriores"
                  subtitle={`${total} rodadas · horário de Brasília`}
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  delay={0.08}
                  action={
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setFullscreen(true)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                        aria-label="Tela cheia"
                        title="Tela cheia"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  }
                >
                  {/* Filtros de período */}
                  <div className="mb-3 flex flex-wrap gap-1 sm:mb-4 sm:gap-1.5">
                    {(
                      [
                        ["hoje", "Hoje"],
                        ["ontem", "Ontem"],
                        ["7d", "Últimos 7 dias"],
                        ["30d", "Últimos 30 dias"],
                        ["custom", "Personalizado"],
                      ] as [FilterId, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFilter(id)}
                        className={`rounded-full border px-2 py-1 text-[10px] font-medium transition-colors sm:px-3 sm:py-1.5 sm:text-[11px] ${
                          filter === id
                            ? "border-border bg-surface-2 text-foreground"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {filter === "custom" && (
                    <div className="mb-3 grid gap-2 rounded-xl border border-border bg-surface p-3 sm:mb-4 sm:grid-cols-[repeat(4,1fr)_auto] sm:items-end">
                      <FieldInput
                        label="Data inicial"
                        type="date"
                        value={customStart}
                        onChange={setCustomStart}
                      />
                      <FieldInput
                        label="Data final"
                        type="date"
                        value={customEnd}
                        onChange={setCustomEnd}
                      />
                      <FieldInput
                        label="Hora inicial"
                        type="time"
                        value={timeStart}
                        onChange={setTimeStart}
                        placeholder="00:00"
                      />
                      <FieldInput
                        label="Hora final"
                        type="time"
                        value={timeEnd}
                        onChange={setTimeEnd}
                        placeholder="23:59"
                      />
                      <button
                        type="button"
                        onClick={applyCustom}
                        className="h-9 rounded-lg bg-[#DE2143] px-4 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        Pesquisar
                      </button>
                    </div>
                  )}

                  {/* Painel de controles alinhado */}
                  <div className="mb-3 rounded-2xl border border-white/5 bg-white/[0.02] p-2 sm:mb-4 sm:p-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-[11px] sm:gap-x-6">
                      <div className="flex shrink-0 items-center">
                        <Switch checked={realtime} onChange={setRealtime} label="Tempo real" />
                      </div>

                      <div className="flex shrink-0 items-center">
                        <Switch
                          checked={viewMode === "colunas"}
                          onChange={(v) => setViewMode(v ? "colunas" : "lista")}
                          label="Colunas fixas"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Switch
                          checked={contarColunas}
                          onChange={setContarColunas}
                          label="Contar colunas"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Switch checked={inverse} onChange={setInverse} label="Sentido inverso" />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Switch checked={numerado} onChange={setNumerado} label="Numerado" />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Switch
                          checked={exibirSegundos}
                          onChange={setExibirSegundos}
                          label="Exibir segundos"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Switch
                          checked={whiteAlert}
                          onChange={toggleWhiteAlert}
                          label="Alerta de branco"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Switch
                          checked={destaqueHorario}
                          onChange={setDestaqueHorario}
                          label="Destaque horário"
                        />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <div
                          className={`flex items-center gap-2 rounded-full border px-2.5 py-1 transition-all ${isVip ? "border-red-500/30 bg-red-500/10 text-red-500" : "border-white/5 bg-white/5 text-muted-foreground opacity-60"}`}
                        >
                          <Crown className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider font-outfit">
                            {isVip ? "VIP Ativo" : "Básico"}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                              title="Slots futuros"
                            >
                              <Clock className="h-3.5 w-3.5" />
                              <span>Slots: {futureSlots === 0 ? "Off" : `+${futureSlots}`}</span>
                              <ChevronDown className="h-3 w-3 opacity-70" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[7rem]">
                            {([0, 10, 20, 30] as const).map((v) => (
                              <DropdownMenuItem
                                key={v}
                                onSelect={() => setFutureSlots(v)}
                                className={futureSlots === v ? "bg-accent/20" : ""}
                              >
                                {v === 0 ? "Off" : `+${v} min`}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  {/* Cabeçalho das estatísticas por coluna */}
                  {viewMode === "colunas" && contarColunas && (
                    <div className="mb-3 w-full border-b border-white/5 pb-3 overflow-x-auto scrollbar-none">
                      <div className="grid grid-cols-10 gap-x-0 gap-y-0 min-w-[1200px] w-full">
                        {Array.from({ length: 10 }).map((_, ci) => {
                          const stats = colStats[ci];
                          return (
                            <button
                              key={`col-stats-${ci}`}
                              onClick={() => {
                                const key = `col-${ci}`;
                                if (highlightKey === key) {
                                  setHighlightKey(null);
                                  setHighlightN(new Set());
                                  return;
                                }
                                setHighlightKey(key);
                                // Selecionar todos os números de ambas as pedras desta coluna (posição 0 e 1)
                                const next = new Set<number>();
                                gridRows.forEach((row) => {
                                  const cells = row.cells[ci];
                                  // Pega os números das duas primeiras pedras da célula (pedra esquerda e pedra direita)
                                  if (cells[0]) next.add(cells[0].n);
                                  if (cells[1]) next.add(cells[1].n);
                                });
                                setHighlightN(next);
                              }}
                              className={`flex w-full flex-col gap-0.5 overflow-hidden rounded-[4px] p-1 text-left transition-all duration-300 ${highlightKey === `col-${ci}` ? "bg-primary/25" : "bg-surface hover:bg-surface-2"}`}
                              style={{ width: "100%" }}
                            >
                              <div className="flex items-center justify-between px-0.5 text-[8px] font-bold tabular-nums">
                                <span className="text-foreground">B: {stats.white}</span>
                                <span className="text-muted-foreground/60">
                                  {stats.whitePct.toFixed(0)}%
                                </span>
                              </div>
                              <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-2">
                                <div className="flex h-full w-full">
                                  <div
                                    className="h-full bg-[#DE2143] transition-all duration-500"
                                    style={{ width: `${stats.redPct}%` }}
                                  />
                                  <div
                                    className="h-full bg-slate-800 transition-all duration-500"
                                    style={{ width: `${stats.blackPct}%` }}
                                  />
                                  <div
                                    className="h-full bg-white transition-all duration-500"
                                    style={{ width: `${stats.whitePct}%` }}
                                  />
                                </div>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between px-0.5 text-[7px] font-medium text-muted-foreground/60 tabular-nums uppercase">
                                <span>V: {stats.red}</span>
                                <span>P: {stats.black}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div
                    className={
                      fullscreen
                        ? "fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur-md sm:p-6"
                        : "overflow-hidden rounded-2xl border border-border bg-card"
                    }
                  >
                    {fullscreen && (
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Histórico — tela cheia
                          </p>
                          <h2 className="truncate text-lg font-semibold">
                            {total} rodadas · horário de Brasília
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFullscreen(false)}
                          className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                          aria-label="Fechar tela cheia"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <div
                      className={
                        fullscreen
                          ? "min-h-0 flex-1 overflow-auto rounded-2xl border border-white/5 bg-black/20"
                          : ""
                      }
                      style={{
                        direction: inverse && viewMode === "colunas" ? "rtl" : "ltr",
                        scrollbarWidth: "none",
                      }}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando histórico…
                        </div>
                      ) : visibleSpins.length === 0 ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">
                          {status === "error"
                            ? `Erro ao buscar histórico: ${errorMsg}`
                            : "Nenhum resultado no período selecionado."}
                        </div>
                      ) : viewMode === "colunas" ? (
                        <div className="history-scroll w-full overflow-x-auto p-1 sm:p-2 lg:p-3 no-scrollbar">
                          <div className="flex flex-col gap-0 min-w-[1200px] w-full">
                            {/* Cabeçalho 0-9 interno para Colunas Fixas */}
                            <div className="grid grid-cols-10 gap-x-0 gap-y-0 mb-2 sticky top-0 z-10 bg-[#090B0D]/90 backdrop-blur-sm w-full">
                              {Array.from({ length: 10 }).map((_, ci) => (
                                <button
                                  key={`header-inner-${ci}`}
                                  className={`flex h-[23px] w-full items-center justify-center rounded-[4px] border border-white/5 text-[14px] font-bold tabular-nums transition-all duration-300 ${highlightKey === `col-${ci}` ? "bg-red-500 text-white" : "bg-white/[0.03] text-white/40 hover:bg-white/10"}`}
                                  onClick={() => {
                                    const key = `col-${ci}`;
                                    if (highlightKey === key) {
                                      setHighlightKey(null);
                                      setHighlightN(new Set());
                                      return;
                                    }
                                    setHighlightKey(key);
                                    // Selecionar todos os números de ambas as pedras desta coluna (posição 0 e 1)
                                    const next = new Set<number>();
                                    gridRows.forEach((row) => {
                                      const cells = row.cells[ci];
                                      // Pega os números das duas primeiras pedras da célula (pedra esquerda e pedra direita)
                                      if (cells[0]) next.add(cells[0].n);
                                      if (cells[1]) next.add(cells[1].n);
                                    });
                                    setHighlightN(next);
                                  }}
                                >
                                  {ci}
                                </button>
                              ))}
                            </div>

                            {gridRows.map((row) => (
                              <div key={row.key} className="flex flex-col gap-0 border-none py-1">
                                <div className="grid grid-cols-10 gap-x-0 gap-y-0 relative w-full border-none">
                                  {row.cells.map((cell: any, ci: number) => {
                                    const [hh, mmPrefix] = row.label.split(":");
                                    const hm = `${hh}:${mmPrefix[0]}${ci}`;
                                    const cellSignals = signalsByHM.get(hm) ?? [];
                                    const green = robotOn
                                      ? cellSignals.find((s) => s.outcome === "green")
                                      : undefined;
                                    const pending = robotOn
                                      ? cellSignals.find((s) => s.outcome === "pending")
                                      : undefined;
                                    const red = robotOn
                                      ? cellSignals.find((s) => s.outcome === "red")
                                      : undefined;
                                    let badge: null | {
                                      label: string;
                                      tone: "exato" | "margem" | "pending" | "loss";
                                    } = null;
                                    if (green) {
                                      const diff = green.matchedIso
                                        ? Math.abs(
                                            new Date(green.matchedIso).getTime() -
                                              new Date(green.targetIso).getTime(),
                                          )
                                        : 0;
                                      badge =
                                        diff <= 15_000
                                          ? { label: "EXATO", tone: "exato" }
                                          : { label: "MARGEM", tone: "margem" };
                                    } else if (pending) {
                                      badge = { label: "SINAL", tone: "pending" };
                                    } else if (red) {
                                      badge = { label: "LOSS", tone: "loss" };
                                    }
                                    const badgeCls =
                                      badge?.tone === "exato" || badge?.tone === "pending"
                                        ? "bg-emerald-500 text-black border border-emerald-300 shadow-[0_2px_8px_rgba(16,185,129,0.35)]"
                                        : badge?.tone === "margem"
                                          ? "bg-amber-400 text-black border border-amber-200 shadow-[0_2px_8px_rgba(245,158,11,0.35)]"
                                          : "bg-red-500 text-white border border-red-300 shadow-[0_2px_8px_rgba(239,68,68,0.35)]";
                                    return (
                                      <div
                                        key={ci}
                                        className="flex flex-col items-center justify-center p-0 bg-transparent border-0 shadow-none outline-none"
                                        style={{ width: "100%", height: "88px", direction: "ltr" }}
                                      >
                                        <div className="relative flex flex-col items-center pt-2 transition-all duration-300 bg-transparent border-0 shadow-none outline-none">
                                          {badge && (
                                            <span
                                              className={`absolute top-0 z-10 inline-flex h-3 items-center rounded-full px-1 text-[7px] font-black tracking-wider sm:h-3.5 sm:px-1.5 sm:text-[8px] ${badgeCls}`}
                                            >
                                              {badge.label}
                                            </span>
                                          )}
                                          <div className="relative flex h-[60px] items-start gap-0">
                                            {(cell.length >= 2
                                              ? [cell[0], cell[1]]
                                              : cell.length === 1
                                                ? [cell[0], undefined]
                                                : [undefined, undefined]
                                            ).map((spin: any, i: number) => {
                                              const slotKey = `${hm}-${i}`;
                                              const isLocked =
                                                !isVip && !spin && !(pending && i === 0);

                                              if (spin) {
                                                return (
                                                  <div
                                                    key={(spin as Spin).id}
                                                    className="flex flex-col items-center"
                                                  >
                                                    <BlazeResultCard
                                                      n={(spin as Spin).n}
                                                      color={(spin as Spin).color}
                                                      time={
                                                        exibirSegundos
                                                          ? spTimeWithSeconds(spin as Spin)
                                                          : (spin as Spin).time
                                                      }
                                                      numbered={numerado}
                                                      timeHighlight={destaqueHorario}
                                                      signal={
                                                        robotOn
                                                          ? signalsByHM.get(`${hm}-${i}`)?.[0]
                                                          : undefined
                                                      }
                                                      dimmed={
                                                        (highlightKey !== null &&
                                                          highlightKey !== `col-${ci}`) ||
                                                        (highlightN.size > 0 &&
                                                          !highlightN.has((spin as Spin).n))
                                                      }
                                                      selected={highlightN.has((spin as Spin).n)}
                                                      onClick={() => {
                                                        const n = (spin as Spin).n;
                                                        // Se clicar em uma pedra e já houver uma coluna selecionada,
                                                        // limpa a coluna e foca apenas na pedra.
                                                        if (highlightKey) {
                                                          setHighlightKey(null);
                                                          setHighlightN(new Set([n]));
                                                          return;
                                                        }
                                                        setHighlightN((h) => {
                                                          const next = new Set(h);
                                                          if (next.has(n)) next.delete(n);
                                                          else next.add(n);
                                                          return next;
                                                        });
                                                      }}
                                                    />
                                                  </div>
                                                );
                                              }

                                              if (pending && i === 0) {
                                                const isSlotActive = highlightKey
                                                  ? highlightKey === `col-${ci}`
                                                  : highlightN.size === 0;
                                                return (
                                                  <div
                                                    key={`p-${ci}-${i}`}
                                                    className="flex flex-col items-center"
                                                    style={{ opacity: isSlotActive ? 1 : 0.25 }}
                                                  >
                                                    <div className="relative flex h-[60px] w-[62px] items-center justify-center overflow-hidden rounded-[4px] border border-slate-700/50 bg-[#181e2a] shadow-none">
                                                      <img
                                                        src={BRANCO_IMG}
                                                        alt="Sinal"
                                                        className="h-full w-full object-cover opacity-20"
                                                        draggable={false}
                                                      />
                                                    </div>
                                                    <span
                                                      className="mt-[8px] flex items-center justify-center font-bold leading-none tabular-nums text-foreground dark:text-white rounded-md bg-surface-2 dark:bg-[#3f4a56] border-none"
                                                      style={{
                                                        height: "16px",
                                                        width: "100%",
                                                        fontSize: "9px",
                                                        padding: "0 2px",
                                                      }}
                                                    >
                                                      {hm}
                                                    </span>
                                                  </div>
                                                );
                                              }

                                              const p = slotPredictions[slotKey];
                                              const isSlotActive = highlightKey
                                                ? highlightKey === `col-${ci}`
                                                : highlightN.size === 0;
                                              return (
                                                <div
                                                  key={`e-${ci}-${i}`}
                                                  className="flex flex-col items-center"
                                                  style={{ opacity: isSlotActive ? 1 : 0.25 }}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      if (isLocked) {
                                                        toast.error("Recurso VIP", {
                                                          description:
                                                            "A criação de alertas manuais é exclusiva para membros VIP.",
                                                        });
                                                        return;
                                                      }
                                                      cycleSlotPrediction(slotKey);
                                                    }}
                                                    className={`relative flex h-[60px] w-[62px] items-center justify-center rounded-[4px] border border-slate-700/50 bg-[#181e2a] transition-colors shadow-none ${
                                                      isLocked
                                                        ? "opacity-50 cursor-not-allowed"
                                                        : "cursor-pointer"
                                                    }`}
                                                  >
                                                    {isLocked ? (
                                                      <Lock className="h-4 w-4 text-muted-foreground/40" />
                                                    ) : (
                                                      <div
                                                        className={`h-[30px] w-[30px] rounded-full border-2 transition-all ${
                                                          p === "white"
                                                            ? "bg-white border-white/20"
                                                            : p === "red"
                                                              ? "bg-red-500 border-red-400/20"
                                                              : p === "black"
                                                                ? "bg-slate-800 border-slate-700/20"
                                                                : "bg-transparent border-white/20"
                                                        }`}
                                                      />
                                                    )}
                                                  </button>
                                                  <span
                                                    className="mt-[8px] flex items-center justify-center font-bold leading-none tabular-nums text-foreground dark:text-white rounded-md bg-surface-2 dark:bg-[#3f4a56] border-none"
                                                    style={{
                                                      height: "16px",
                                                      width: "100%",
                                                      fontSize: "9px",
                                                      padding: "0 2px",
                                                    }}
                                                  >
                                                    {hm}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        (() => {
                          return (
                            <div
                              className="history-scroll grid p-1 sm:p-3 lg:p-4"
                              style={{
                                gridTemplateColumns: `repeat(auto-fill, minmax(52px, 1fr))`,
                                columnGap: "8px",
                                rowGap: "12px",
                                direction: inverse ? "rtl" : "ltr",
                              }}
                            >
                              {visibleSpins.map((spin, i) => {
                                const hasSel = highlightN.size > 0;
                                const hit = highlightN.has(spin.n);
                                return (
                                  <div key={spin.id} style={{ direction: "ltr" }}>
                                    <BlazeResultCard
                                      n={spin.n}
                                      color={spin.color}
                                      time={exibirSegundos ? spTimeWithSeconds(spin) : spin.time}
                                      numbered={numerado}
                                      timeHighlight={destaqueHorario}
                                      selected={hit}
                                      dimmed={hasSel && !hit}
                                      delay={i < 20 ? i * 0.015 : 0}
                                      onClick={() =>
                                        setHighlightN((h) => {
                                          const next = new Set(h);
                                          if (next.has(spin.n)) next.delete(spin.n);
                                          else next.add(spin.n);
                                          return next;
                                        })
                                      }
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()
                      )}

                      {!loading && visibleSpins.length > 0 && (
                        <div className="mt-5 flex justify-center pb-4">
                          {hasMore ? (
                            <button
                              type="button"
                              onClick={loadMore}
                              disabled={loadingMore}
                              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60 shadow-sm"
                            >
                              {loadingMore ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                                </>
                              ) : (
                                <>+ Carregar mais {PAGE_SIZE} resultados</>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              Fim do histórico do período.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </section>
            </main>
          )}
        </div>
      </div>

      <WhiteCelebration spin={whiteFlash} onClose={() => setWhiteFlash(null)} />
      <WhiteAlertToggleFx state={alertFx} onDone={() => setAlertFx(null)} />

      <LeftStatsDrawer open={statsOpen} onClose={() => setStatsOpen(false)} spins={visibleSpins} />
    </div>
  );
}

const TipMinerCard = memo(function TipMinerCard({
  spin,
  delay = 0,
  showTime = true,
  numbered = false,
  showSeconds = false,
  timeHighlight = false,
  highlightN,
  isActive: isActiveProp,
  signal,
  onClick,
}: {
  spin: Spin;
  delay?: number;
  showTime?: boolean;
  numbered?: boolean;
  showSeconds?: boolean;
  timeHighlight?: boolean;
  highlightN?: Set<number> | null;
  isActive?: boolean;
  signal?: StoredSignal;
  onClick?: () => void;
}) {
  const isWhite = spin.color === "white";
  const bg = spin.color === "red" ? "#DE2143" : spin.color === "black" ? "#16171d" : "#ffffff";
  const border =
    spin.color === "red"
      ? "rgba(255, 255, 255, 0.1)"
      : spin.color === "black"
        ? "rgba(255, 255, 255, 0.05)"
        : "#ffffff";
  const ring = isWhite ? "#DE2143" : "#ffffff";
  const fg = isWhite ? "#DE2143" : "#ffffff";

  const isHit = !!highlightN && highlightN.has(spin.n);
  const isActive = isActiveProp !== undefined ? isActiveProp : true;
  const delayStyle = delay > 0 ? { animationDelay: `${delay}s` } : undefined;

  return (
    <div className="relative flex flex-col items-center">
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
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center justify-center overflow-hidden rounded-[4px] shadow-sm transition-[transform,opacity] duration-200 hover:-translate-y-0.5 animate-in fade-in zoom-in-95 ${
          isHit && isActive ? "border-2 border-primary" : ""
        }`}
        style={{
          width: "52px",
          height: "50px",
          background: bg,
          borderColor: isHit && isActive ? undefined : border,
          opacity: isActive ? 1 : 0.25,
          ...(delayStyle ?? {}),
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
          <div
            className="flex items-center justify-center font-bold leading-none tabular-nums"
            style={{
              height: "30px",
              width: "30px",
              borderRadius: "50%",
              border: `2px solid ${isWhite ? ring : "transparent"}`,
              color: fg,
              fontSize: "14px",
            }}
          >
            {spin.n}
          </div>
        )}
      </button>

      {showTime && (
        <span
          className={`mt-[4px] flex items-center justify-center font-bold leading-none tabular-nums ${
            timeHighlight ? "text-primary" : "text-muted-foreground/90"
          }`}
          style={{
            height: "14px",
            width: "auto",
            minWidth: "34px",
            padding: "0 4px",
            borderRadius: "4px",
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            fontSize: "9px",
          }}
        >
          {showSeconds ? spTimeWithSeconds(spin) : spin.time}
        </span>
      )}
    </div>
  );
});

const EmptySlot = memo(function EmptySlot({
  prediction,
  onClick,
}: {
  prediction?: "white" | "red" | "black";
  onClick?: () => void;
}) {
  const isWhite = prediction === "white";
  const bg = prediction === "red" ? "#DE2143" : prediction === "black" ? "#16171d" : "#ffffff";
  const ring = isWhite ? "#16171d" : "#ffffff";
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        aria-label="Marcar previsão"
        className={`flex items-center justify-center overflow-hidden rounded-md transition-colors ${
          prediction
            ? "shadow-sm hover:-translate-y-0.5"
            : "border border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
        }`}
        style={{
          width: "var(--stone, 48px)",
          height: "var(--stone-h, 48px)",
          background: prediction ? (isWhite ? "#ffffff" : bg) : undefined,
        }}
      >
        {prediction ? (
          isWhite ? (
            <img
              src={BRANCO_IMG}
              alt="Branco"
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="h-[32px] w-[32px] rounded-full border-2"
              style={{ border: `2px solid #ffffff` }}
            />
          )
        ) : null}
      </button>
      <span
        className="mt-1 select-none leading-none text-transparent"
        style={{ fontSize: "var(--stone-time, 12px)" }}
      >
        --:--
      </span>
    </div>
  );
});

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("theme") : null;
    const isDark = saved ? saved === "dark" : true;
    setDark(isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("light", !next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* noop */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors duration-200 hover:bg-surface-2 hover:text-foreground shadow-sm"
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

const FieldInput = memo(function FieldInput({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: "date" | "time";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface-2 px-3 text-[12px] text-foreground outline-none transition-colors focus:border-primary/50"
      />
    </label>
  );
});

function countConsecutive(spins: Spin[], color: Spin["color"]): number {
  let n = 0;
  for (const s of spins) {
    if (s.color === color) n += 1;
    else break;
  }
  return n;
}

const StatusPill = memo(function StatusPill({
  status,
  message,
}: {
  status: "loading" | "live" | "error";
  message: string;
}) {
  const cls =
    status === "live"
      ? "border-positive/25 bg-positive/10 text-positive"
      : status === "error"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-white/10 bg-white/5 text-muted-foreground";
  const label =
    status === "live"
      ? "Análise em Tempo Real"
      : status === "error"
        ? "Sem conexão"
        : "Carregando…";
  return (
    <span
      title={message}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium ${cls}`}
    >
      {status === "error" ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
});
