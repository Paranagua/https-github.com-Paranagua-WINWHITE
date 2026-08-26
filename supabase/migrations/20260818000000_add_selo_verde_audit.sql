-- Adiciona coluna tag e Pedra_Anterior se não existirem
ALTER TABLE public.historico_sinais_audit ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.historico_sinais_audit ADD COLUMN IF NOT EXISTS pedra_anterior integer;

-- Função para limpar registros antigos mantendo apenas 6 por tag
CREATE OR REPLACE FUNCTION public.clean_audit_fifo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tag IS NOT NULL THEN
        DELETE FROM public.historico_sinais_audit
        WHERE id IN (
            SELECT id FROM public.historico_sinais_audit
            WHERE tag = NEW.tag
            ORDER BY created_at DESC
            OFFSET 6
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Gatilho para limpeza FIFO
DROP TRIGGER IF EXISTS tr_clean_audit_fifo ON public.historico_sinais_audit;
CREATE TRIGGER tr_clean_audit_fifo
AFTER INSERT ON public.historico_sinais_audit
FOR EACH ROW EXECUTE FUNCTION public.clean_audit_fifo();

-- Grants
GRANT SELECT, INSERT ON public.historico_sinais_audit TO authenticated;
GRANT ALL ON public.historico_sinais_audit TO service_role;
