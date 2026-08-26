-- 1. Ajustar permissões e RLS
GRANT SELECT ON public.historico_sinais_audit TO anon;

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Restricted INSERT for authenticated users" ON public.historico_sinais_audit;

CREATE POLICY "Restricted INSERT for authenticated users"
ON public.historico_sinais_audit FOR INSERT
TO authenticated
WITH CHECK (
    analise IS NOT NULL AND
    status IN ('PENDENTE', 'WIN_DIRETO', 'WIN_VIZINHO', 'LOSS') AND
    char_length(analise) <= 100 AND
    minuto_alvo > (now() - interval '1 day') AND
    minuto_alvo < (now() + interval '1 day')
);

-- 2. Implementar FIFO (First-In, First-Out)
CREATE OR REPLACE FUNCTION public.maintain_audit_limit()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.historico_sinais_audit
    WHERE id NOT IN (
        SELECT id FROM public.historico_sinais_audit
        ORDER BY created_at DESC
        LIMIT 500
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_fifo ON public.historico_sinais_audit;
CREATE TRIGGER trigger_audit_fifo
AFTER INSERT ON public.historico_sinais_audit
FOR EACH STATEMENT
EXECUTE FUNCTION public.maintain_audit_limit();