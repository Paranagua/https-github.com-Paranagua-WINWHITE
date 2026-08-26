-- Enable RLS
ALTER TABLE public.historico_sinais_audit ENABLE ROW LEVEL SECURITY;

-- Drop existing broad policies
DROP POLICY IF EXISTS "Public can select audit" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Public can insert audit" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Allow public read audit" ON public.historico_sinais_audit;
DROP POLICY IF EXISTS "Allow public insert audit" ON public.historico_sinais_audit;

-- 1. Policy for Reading: Allow authenticated users to read audit data
CREATE POLICY "Authenticated users can read audit data"
ON public.historico_sinais_audit
FOR SELECT
TO authenticated
USING (true);

-- 2. Policy for Inserting: Allow authenticated users to insert audit records
CREATE POLICY "Authenticated users can insert audit records"
ON public.historico_sinais_audit
FOR INSERT
TO authenticated
WITH CHECK (
    length(analise) < 255 AND
    length(tipo_sinal) < 255 AND
    length(nivel) < 255 AND
    length(predicao_horario) < 20 AND
    length(status) < 20
);

-- Manage Grants
REVOKE ALL ON public.historico_sinais_audit FROM anon;
GRANT SELECT ON public.historico_sinais_audit TO authenticated;
GRANT INSERT ON public.historico_sinais_audit TO authenticated;
GRANT ALL ON public.historico_sinais_audit TO service_role;
