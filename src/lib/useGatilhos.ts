import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const MAX_GATILHOS = 5;
export const BRAZIL_TZ = "America/Sao_Paulo";

export type GatilhoRow = {
  id: string;
  analise: string;
  pedra: number;
  minuto: number;
  fuso_horario: string;
  trigger_at: string;
  detalhe: string | null;
  gaps: number[] | null;
};

export type GatilhoInput = {
  analise: string;
  pedra: number;
  minuto: number;
  trigger_at: string; // ISO absoluto
  detalhe: string;
  gaps: number[];
};

/**
 * Persiste os gatilhos da aba Análise no banco (janela FIFO de 10 por
 * análise/pedra), lê apenas os 10 mais recentes e escuta mudanças em
 * tempo real para refletir em todos os dispositivos.
 */
export function useGatilhos(analise: string, pedra: number) {
  const [rows, setRows] = useState<GatilhoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("gatilhos_analise")
        .select("analise, pedra, minuto, trigger_at, detalhe, gaps")
        .eq("analise", analise)
        .eq("pedra", pedra)
        .order("trigger_at", { ascending: false })
        .limit(MAX_GATILHOS);

      if (err) {
        setError(null);
      } else {
        setError(null);
        setRows(((data ?? []) as GatilhoRow[]).slice().reverse());
      }
    } catch (e) {
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [analise, pedra]);

  // Carrega ao montar / trocar de pedra
  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: qualquer mudança na tabela (inserção via trigger ou atualização de gaps) recarrega a visualização
  useEffect(() => {
    const channel = supabase
      .channel(`gatilhos-${analise}-${pedra}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gatilhos_analise" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [analise, pedra, load]);

  return { rows, loading, error };
}

// Evita reenviar o mesmo lote repetidamente entre re-renders.
const lastSent = new Map<string, string>();
