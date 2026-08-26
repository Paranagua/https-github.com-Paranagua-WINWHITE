DROP POLICY IF EXISTS "Strict audit insert" ON public.historico_sinais_audit;

CREATE POLICY "Strict audit insert"
ON public.historico_sinais_audit
FOR INSERT
TO anon, authenticated
WITH CHECK (
  analise IS NOT NULL
  AND length(analise) BETWEEN 1 AND 50
  AND status = ANY (ARRAY['PENDENTE','WIN_DIRETO','WIN_VIZINHO','LOSS'])
  AND tipo_sinal IS NOT NULL AND length(tipo_sinal) BETWEEN 1 AND 40
  AND nivel IS NOT NULL AND length(nivel) BETWEEN 1 AND 20
  AND predicao_horario IS NOT NULL AND length(predicao_horario) BETWEEN 1 AND 30
  AND minuto_alvo > (now() - interval '2 days')
  AND minuto_alvo < (now() + interval '2 days')
);