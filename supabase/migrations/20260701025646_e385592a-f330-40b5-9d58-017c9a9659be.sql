GRANT INSERT ON public.historico_blaze TO anon;
GRANT INSERT ON public.historico_blaze TO authenticated;

DROP POLICY IF EXISTS "validated collector can insert historico" ON public.historico_blaze;
CREATE POLICY "validated collector can insert historico"
ON public.historico_blaze
FOR INSERT
TO anon, authenticated
WITH CHECK (
  blaze_id ~ '^[A-Za-z0-9_-]{4,80}$'
  AND numero BETWEEN 0 AND 14
  AND cor IN ('red', 'black', 'white')
  AND ((numero = 0 AND cor = 'white') OR (numero BETWEEN 1 AND 7 AND cor = 'red') OR (numero BETWEEN 8 AND 14 AND cor = 'black'))
);