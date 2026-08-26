-- 1. Certificar que a tabela tem a coluna status com default 'PENDENTE'
ALTER TABLE public.historico_sinais_audit ALTER COLUMN status SET DEFAULT 'PENDENTE';

-- 2. Garantir que a coluna 'minuto_alvo' exista e seja timestamp
-- (Já deve existir, mas reforçamos o tipo se necessário)

-- 3. Criar função de limpeza FIFO atualizada
CREATE OR REPLACE FUNCTION public.cleanup_audit_fifo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.historico_sinais_audit
  WHERE id IN (
    SELECT id FROM public.historico_sinais_audit
    ORDER BY created_at DESC
    OFFSET 500
  );
  RETURN NEW;
END;
$$;

-- 4. Função para buscar estatísticas de assertividade real
CREATE OR REPLACE FUNCTION public.get_strategy_stats(lookback_hours int DEFAULT 24)
RETURNS TABLE (
  analise text,
  wins bigint,
  losses bigint,
  total bigint,
  assertividade numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    analise,
    count(*) FILTER (WHERE status LIKE 'WIN%') as wins,
    count(*) FILTER (WHERE status = 'LOSS') as losses,
    count(*) as total,
    CASE 
      WHEN count(*) FILTER (WHERE status IN ('WIN', 'LOSS') OR status LIKE 'WIN%') > 0 
      THEN (count(*) FILTER (WHERE status LIKE 'WIN%')::numeric / count(*) FILTER (WHERE status IN ('WIN', 'LOSS') OR status LIKE 'WIN%')::numeric) * 100
      ELSE 0
    END as assertividade
  FROM public.historico_sinais_audit
  WHERE created_at > now() - (lookback_hours || ' hours')::interval
    AND status != 'PENDENTE'
  GROUP BY analise;
$$;

GRANT EXECUTE ON FUNCTION public.get_strategy_stats(int) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_sinais_audit TO authenticated;
GRANT ALL ON public.historico_sinais_audit TO service_role;
