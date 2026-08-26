-- Least privilege: only the internal collector (service_role) may write history
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.historico_blaze FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.historico_blaze FROM authenticated;
GRANT SELECT ON public.historico_blaze TO anon, authenticated;
GRANT ALL ON public.historico_blaze TO service_role;

-- Gatilhos: read + insert only (RLS policies already validate every column)
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES ON public.gatilhos_analise FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES ON public.gatilhos_analise FROM authenticated;
GRANT SELECT, INSERT ON public.gatilhos_analise TO anon, authenticated;
GRANT ALL ON public.gatilhos_analise TO service_role;

-- Ensure the FIFO (10 per analise/pedra) cleanup trigger is attached
DROP TRIGGER IF EXISTS gatilhos_analise_fifo_trg ON public.gatilhos_analise;
CREATE TRIGGER gatilhos_analise_fifo_trg
AFTER INSERT ON public.gatilhos_analise
FOR EACH ROW EXECUTE FUNCTION public.gatilhos_analise_fifo();