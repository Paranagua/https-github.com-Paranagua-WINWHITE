GRANT ALL ON public.historico_sinais_audit TO service_role;
GRANT SELECT, INSERT, DELETE ON public.historico_sinais_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_audit_24h()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.historico_sinais_audit
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;
