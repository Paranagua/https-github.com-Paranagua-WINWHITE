ALTER TABLE public.historico_sinais_audit ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_sinais_audit TO authenticated;
GRANT SELECT ON public.historico_sinais_audit TO anon;
GRANT ALL ON public.historico_sinais_audit TO service_role;
