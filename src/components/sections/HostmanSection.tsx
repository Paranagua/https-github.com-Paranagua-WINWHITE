"use client";

import { memo, useMemo, useState, useEffect, useRef } from "react";
import { Card } from "@/components/double/Card";
import { BlazeResultCard } from "@/components/double/BlazeResultCard";
import { useVipStatus } from "@/lib/auth/vipStore";
import {
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowUpDown,
  History,
} from "lucide-react";
import { blazeSupabase as supabase } from "@/integrations/supabase/blaze-client";
import { fmtTime, colorOf, type Spin } from "@/components/double/types";

type Row = {
  id: number;
  roll: string;
  color: string;
  created_at: string;
};

function normalizeColor(v: string): Spin["color"] | null {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (["red", "vermelho", "vermelha", "r"].includes(s)) return "red";
  if (["black", "preto", "preta", "b"].includes(s)) return "black";
  if (["white", "branco", "branca", "w", "0"].includes(s)) return "white";
  return null;
}

function rowToSpin(r: Row): Spin {
  const rollNumber = Number(r.roll);
  const colorNumber = Number(r.color);
  const hasRollNumber = Number.isFinite(rollNumber);
  const hasColorNumber = Number.isFinite(colorNumber);
  const n = hasRollNumber ? rollNumber : hasColorNumber ? colorNumber : 0;
  const color = normalizeColor(r.color) ?? normalizeColor(r.roll) ?? colorOf(n);
  const raw = (r.created_at ?? "").trim();
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  const createdAt = hasTz ? raw : `${raw.replace(" ", "T")}Z`;

  return {
    id: String(r.id),
    n,
    color,
    time: fmtTime(createdAt),
    createdAt,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!item.id || item.id === "undefined") continue;
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

const PAGE_SIZE = 36; // 3 rows of 12

export default function HostmanSection() {
  const isVip = useVipStatus();
  const [spins, setSpins] = useState<Spin[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isInverse, setIsInverse] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Atualiza relógio interno para expiração de sinais
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Fuso horário SP para as datas
  const today = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const isFirstLoad = useRef(true);

  // Real-time poller para garantir que a página 1 esteja sempre atualizada com o "horário atual"
  useEffect(() => {
    let alive = true;
    async function loadData() {
      if (isFirstLoad.current) setLoading(true);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("blaze_results")
        .select("id, roll, color, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (alive && !error && data) {
        setSpins(dedupeById(data.map(rowToSpin)));
        if (count !== null) setTotalCount(count);
      }
      if (alive) {
        setLoading(false);
        isFirstLoad.current = false;
      }
    }

    loadData();

    let interval: any = null;
    let subscription: any = null;

    if (page === 1) {
      interval = setInterval(loadData, 5000);
      subscription = supabase
        .channel("hostman-realtime-sync")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "blaze_results" },
          () => {
            if (alive) loadData();
          },
        )
        .subscribe();
    }

    return () => {
      alive = false;
      if (interval) clearInterval(interval);
      if (subscription) supabase.removeChannel(subscription);
    };
  }, [page]);

  // Cálculo de sinais de possíveis brancos (Branco + 22 minutos)
  const whiteSignals = useMemo(() => {
    const futureSignals = [];
    const whites = spins.filter((s) => s.color === "white");

    for (const w of whites) {
      const whiteTime = new Date(w.createdAt);
      const targetTime = new Date(whiteTime.getTime() + 22 * 60000);

      // Apenas sinais futuros ou que acabaram de acontecer (tolerância de 30s)
      if (targetTime.getTime() > currentTime.getTime() - 30000) {
        futureSignals.push({
          id: w.id,
          targetTime,
          displayTime: new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
          }).format(targetTime),
        });
      }
    }

    // Remove duplicatas de horário e ordena
    const unique = Array.from(new Map(futureSignals.map((s) => [s.displayTime, s])).values());
    return unique.sort((a, b) => a.targetTime.getTime() - b.targetTime.getTime());
  }, [spins, currentTime]);

  const rows = useMemo(() => {
    const res = [];
    for (let i = 0; i < spins.length; i += 12) {
      let chunk = spins.slice(i, i + 12);
      // Inversão visual da ordem das pedras na linha (direita para esquerda)
      if (isInverse) {
        chunk = [...chunk].reverse();
      }
      res.push(chunk);
    }
    return res;
  }, [spins, isInverse]);

  const normalizeISO = (iso: string | undefined) => {
    if (!iso) return "";
    const raw = iso.trim();
    // Se não tiver indicador de fuso (Z ou +-00:00), força Z (UTC)
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
    return hasTz ? raw : `${raw.replace(" ", "T")}Z`;
  };

  const formatDate = (iso: string | undefined) => {
    const normalized = normalizeISO(iso);
    if (!normalized) return "";
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  };

  const formatFullTime = (iso: string | undefined) => {
    const normalized = normalizeISO(iso);
    if (!normalized) return "";
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  };

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <Card className="flex flex-col border-none bg-[#11141a] p-0 shadow-2xl overflow-hidden">
        {/* Signals Bar */}
        <div className="flex items-center justify-between border-b border-white/5 bg-[#050608] px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 mr-2">
              <History className="h-3.5 w-3.5 text-white/40" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                Possíveis Brancos
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {whiteSignals.length > 0 ? (
                whiteSignals.map((s) => (
                  <div
                    key={s.id}
                    className="group relative flex items-center gap-2 rounded-md bg-[#ffffff08] hover:bg-[#ffffff0d] px-3 py-1.5 border border-white/5 transition-all duration-300"
                  >
                    <div className="h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] animate-pulse" />
                    <span className="text-[12px] font-black text-white tracking-tight">
                      {s.displayTime}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-[11px] font-medium text-white/20 italic">
                  Aguardando novos sinais...
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => setIsInverse(!isInverse)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-tighter transition-all duration-300 border ${
              isInverse
                ? "bg-red-500/10 border-red-500/50 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                : "bg-[#1c222d] border-white/5 text-muted-foreground hover:text-white hover:border-white/20"
            }`}
          >
            <ArrowUpDown
              className={`h-3.5 w-3.5 transition-transform duration-500 ${isInverse ? "rotate-180" : ""}`}
            />
            <span>Sentido Inverso</span>
          </button>
        </div>

        {/* Header Tabs */}
        <div className="flex items-center justify-between border-b border-white/5 bg-[#090b0d] px-6 py-4">
          <div className="flex gap-6">
            <button className="relative px-1 pb-1 text-[12px] font-black uppercase tracking-widest text-white after:absolute after:bottom-[-16px] after:left-0 after:h-[2px] after:w-full after:bg-red-500">
              Histórico
            </button>
            <button className="px-1 text-[12px] font-black uppercase tracking-widest text-muted-foreground/60 transition hover:text-white">
              Padrões
            </button>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground/80">
            <div className="flex items-center gap-2">
              <span>De</span>
              <div className="flex items-center gap-2 rounded bg-[#1c222d] px-3 py-1.5 text-white border border-white/5">
                {today}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span>Até</span>
              <div className="flex items-center gap-2 rounded bg-[#1c222d] px-3 py-1.5 text-white border border-white/5">
                {today}
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="min-h-[500px] bg-[#11141a] p-6">
          {loading ? (
            <div className="flex h-[400px] items-center justify-center text-muted-foreground">
              Carregando histórico...
            </div>
          ) : (
            <div className="flex flex-col gap-10">
              {rows.map((rowSpins, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-6 md:grid-cols-12 gap-x-2 gap-y-8">
                  {rowSpins.map((spin) => (
                    <div key={spin.id} className="flex flex-col items-center">
                      <div
                        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-lg shadow-lg overflow-hidden border border-white/5 transition-transform duration-300 hover:scale-110"
                        style={{
                          backgroundColor:
                            spin.color === "red"
                              ? "#f12c4c"
                              : spin.color === "black"
                                ? "#1e2330"
                                : "#ffffff",
                        }}
                      >
                        {spin.color === "white" ? (
                          <div className="flex h-full w-full items-center justify-center p-3">
                            <img
                              src="/images/branco.svg"
                              alt="Branco"
                              className="h-full w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[3px] border-white text-xl font-black text-white">
                            {spin.n}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground/60">
                          {formatDate(spin.createdAt)}
                        </span>
                        <span className="text-[10px] font-black text-white">
                          {formatFullTime(spin.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Pagination */}
        <div className="flex items-center justify-between border-t border-white/5 bg-[#11141a] px-6 py-4">
          <div className="text-[12px] font-medium text-muted-foreground/80">
            Página <span className="text-white font-bold">{page}</span> de{" "}
            {Math.ceil(totalCount / PAGE_SIZE)}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="grid h-8 w-8 place-items-center rounded bg-[#1c222d] text-muted-foreground transition hover:bg-[#252c3a] hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
              className="grid h-8 w-8 place-items-center rounded bg-[#1c222d] text-muted-foreground transition hover:bg-[#252c3a] hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </main>
  );
}
