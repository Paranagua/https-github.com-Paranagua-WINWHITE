DROP POLICY IF EXISTS "gatilhos update publico" ON public.gatilhos_analise;
DROP POLICY IF EXISTS "gatilhos delete publico" ON public.gatilhos_analise;
REVOKE UPDATE, DELETE ON public.gatilhos_analise FROM anon, authenticated;

DROP POLICY IF EXISTS "gatilhos escrita publica" ON public.gatilhos_analise;
CREATE POLICY "gatilhos insercao validada"
ON public.gatilhos_analise
FOR INSERT
TO anon, authenticated
WITH CHECK (
  analise IN ('analise1','analise2','analise3')
  AND pedra BETWEEN 0 AND 14
  AND minuto BETWEEN 0 AND 59
  AND fuso_horario = 'America/Sao_Paulo'
  AND (detalhe IS NULL OR length(detalhe) <= 120)
  AND array_length(gaps, 1) IS DISTINCT FROM 0
  AND coalesce(array_length(gaps, 1), 0) <= 60
  AND trigger_at > now() - interval '30 days'
  AND trigger_at < now() + interval '1 day'
);

GRANT SELECT, INSERT ON public.gatilhos_analise TO anon, authenticated;
GRANT ALL ON public.gatilhos_analise TO service_role;