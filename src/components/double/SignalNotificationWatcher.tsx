import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSection, setSection } from "@/lib/sectionStore";
import {
  getPredictiveSignals,
  subscribePredictive,
  getRobotEnabled,
  subscribeRobot,
  type PredictiveSignal,
} from "@/lib/signalsStore";
import { getSignalRank, SignalRank } from "@/lib/signalHierarchy";
import { PredictiveSignals } from "@/components/double/PredictiveSignals";
import { Zap, Sparkles } from "lucide-react";

function getGroupDisplayName(sig: Partial<PredictiveSignal>): string {
  const rank = getSignalRank(sig);
  if (rank === SignalRank.ALAVANCAGEM || sig.isAlavancagem) return "🚀 Alavancagem";
  if (rank === SignalRank.SUPREME || sig.isSupreme) return "👑 Supremo";
  if (rank === SignalRank.RARE || sig.isRare) return "💎 Raro";
  return "⚡ Top 1 & Top 3";
}

interface SignalSnapshot {
  key: string;
  rank: SignalRank;
  groupName: string;
  time: string;
  outcome?: string;
  category?: string;
}

export function SignalNotificationWatcher() {
  const [mounted, setMounted] = useState(false);
  const [robotEnabled, setRobotEnabledState] = useState(getRobotEnabled());
  const section = useSection();
  const prevSignalsRef = useRef<Map<string, SignalSnapshot>>(new Map());
  const isInitialRef = useRef(true);

  useEffect(() => {
    setMounted(true);
    setRobotEnabledState(getRobotEnabled());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const unsub = subscribeRobot(() => {
      setRobotEnabledState(getRobotEnabled());
    });
    return unsub;
  }, [mounted]);

  // Solicita permissão nativa de notificação do navegador de forma não-intrusiva
  useEffect(() => {
    if (!mounted) return;
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {
        // ignore
      }
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    function handleSignalsChange() {
      const currentList = getPredictiveSignals();
      if (!Array.isArray(currentList)) return;

      const nextMap = new Map<string, SignalSnapshot>();
      for (const sig of currentList) {
        if (!sig || !sig.key) continue;
        const rank = getSignalRank(sig);
        const groupName = getGroupDisplayName(sig);
        nextMap.set(sig.key, {
          key: sig.key,
          rank,
          groupName,
          time: sig.time,
          outcome: sig.outcome || "pending",
          category: sig.category,
        });
      }

      // No carregamento inicial, apenas preenche o mapa sem disparar toasts
      if (isInitialRef.current) {
        isInitialRef.current = false;
        prevSignalsRef.current = nextMap;
        return;
      }

      // Se o usuário já está na aba de sinais ou os sinais estão desativados, não dispara notificações flutuantes
      if (section === "sinais" || !getRobotEnabled()) {
        prevSignalsRef.current = nextMap;
        return;
      }

      const prevMap = prevSignalsRef.current;

      // Itera sobre os sinais atuais para detectar novos sinais ou alterações
      for (const [key, current] of nextMap.entries()) {
        if (current.outcome !== "pending") continue;

        const prev = prevMap.get(key);

        if (!prev) {
          // 1. NOVO SINAL DETECTADO
          const groupTimeStr = `${current.groupName} / ${current.time}`;

          // Toast Push In-App
          toast.custom(
            (t) => (
              <div
                className="flex items-center gap-3 bg-zinc-950 border border-emerald-500/50 text-white px-4 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md cursor-pointer hover:border-emerald-400 hover:bg-zinc-900/90 transition-all group max-w-sm"
                onClick={() => {
                  setSection("sinais");
                  toast.dismiss(t);
                }}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                  <Zap className="h-5 w-5 fill-emerald-400 text-emerald-400 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                      Novo Sinal de Branco
                    </span>
                  </div>
                  <div className="text-sm font-black text-white tracking-tight truncate font-outfit">
                    {groupTimeStr}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-black text-black shadow-md hover:bg-emerald-400 transition-colors"
                >
                  Ver
                </button>
              </div>
            ),
            { duration: 7000 },
          );

          // Push Notification nativo do navegador
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification("🚨 Novo Sinal de Branco", {
                body: groupTimeStr,
                icon: "/favicon.ico",
              });
            } catch {
              // ignore
            }
          }
        } else {
          // 2. SINAL EXISTENTE: VERIFICA ALTERAÇÃO / PROMOÇÃO DE GRUPO OU HORÁRIO
          const hasRankPromoted = current.rank > prev.rank;
          const hasTimeChanged = prev.time !== current.time;
          const hasGroupChanged = prev.groupName !== current.groupName;

          if (hasRankPromoted || hasTimeChanged || hasGroupChanged) {
            const groupTimeStr = `${current.groupName} / ${current.time}`;

            // Toast Push In-App
            toast.custom(
              (t) => (
                <div
                  className="flex items-center gap-3 bg-zinc-950 border border-purple-500/50 text-white px-4 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md cursor-pointer hover:border-purple-400 hover:bg-zinc-900/90 transition-all group max-w-sm"
                  onClick={() => {
                    setSection("sinais");
                    toast.dismiss(t);
                  }}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 group-hover:scale-105 transition-transform">
                    <Sparkles className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">
                        Sinal Atualizado
                      </span>
                    </div>
                    <div className="text-sm font-black text-white tracking-tight truncate font-outfit">
                      {groupTimeStr}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-black text-white shadow-md hover:bg-purple-400 transition-colors"
                  >
                    Ver
                  </button>
                </div>
              ),
              { duration: 7000 },
            );

            // Push Notification nativo do navegador
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                new Notification("⚡ Sinal Atualizado", {
                  body: groupTimeStr,
                  icon: "/favicon.ico",
                });
              } catch {
                // ignore
              }
            }
          }
        }
      }

      prevSignalsRef.current = nextMap;
    }

    const unsub = subscribePredictive(handleSignalsChange);
    return () => {
      unsub();
    };
  }, [section, mounted]);

  if (!mounted) return null;

  // Se o usuário não estiver na aba de sinais e os sinais estiverem ativados, mantém o PredictiveSignals rodando em segundo plano
  return (
    <>
      {section !== "sinais" && robotEnabled && (
        <div className="hidden pointer-events-none" aria-hidden="true" tabIndex={-1}>
          <PredictiveSignals />
        </div>
      )}
    </>
  );
}
