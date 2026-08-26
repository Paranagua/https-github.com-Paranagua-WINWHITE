-- 1. Remover políticas antigas
DROP POLICY IF EXISTS "Allow public insert" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Allow public read" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Authenticated users can read audit data" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Authenticated users can insert audit records" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Restricted INSERT for authenticated users" ON public.historico_sinais_audit;

-- 2. Garantir que RLS está habilitado
ALTER TABLE public.historico_sinais_audit ENABLE ROW LEVEL SECURITY;

-- 3. Criar nova política de INSERT com validação estrita
CREATE POLICY "Strict audit insert" ON public.historico_sinais_audit
FOR INSERT TO anon, authenticated
WITH CHECK (
  analise IS NOT NULL AND
  status IN ('PENDENTE', 'WIN_DIRETO', 'WIN_VIZINHO', 'LOSS') AND
  length(analise) <= 50
);

-- 4. Criar política de leitura pública
CREATE POLICY "Public audit select" ON public.historico_sinais_audit
FOR SELECT TO anon, authenticated
USING (true);

-- 5. Criar função FIFO atualizada
CREATE OR REPLACE FUNCTION public.clean_historico_audit_fifo()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.historico_sinais_audit
    WHERE id NOT IN (
        SELECT id FROM public.historico_sinais_audit
        ORDER BY created_at DESC
        LIMIT 500
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Criar trigger FIFO
DROP TRIGGER IF EXISTS tr_clean_historico_audit_fifo ON public.historico_sinais_audit;
CREATE TRIGGER tr_clean_historico_audit_fifo
AFTER INSERT ON public.historico_sinais_audit
FOR EACH STATEMENT
EXECUTE FUNCTION public.clean_historico_audit_fifo();

-- 7. Garantir permissões básicas
GRANT SELECT, INSERT ON public.historico_sinais_audit TO anon, authenticated;
GRANT ALL ON public.historico_sinais_audit TO service_role;
