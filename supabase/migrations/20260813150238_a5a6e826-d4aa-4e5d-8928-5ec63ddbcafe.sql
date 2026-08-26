CREATE TABLE IF NOT EXISTS public.historico_sinais_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    analise TEXT NOT NULL,
    tipo_sinal TEXT NOT NULL,
    nivel TEXT NOT NULL,
    predicao_horario TEXT NOT NULL,
    status TEXT NOT NULL,
    minuto_alvo TIMESTAMPTZ NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_sinais_audit TO authenticated;
GRANT ALL ON public.historico_sinais_audit TO service_role;
GRANT SELECT ON public.historico_sinais_audit TO anon;

ALTER TABLE public.historico_sinais_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.historico_sinais_audit FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert" ON public.historico_sinais_audit FOR INSERT TO public WITH CHECK (true);
