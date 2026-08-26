GRANT SELECT ON public.historico_blaze TO anon;
GRANT SELECT ON public.historico_blaze TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_blaze TO service_role;

DROP POLICY IF EXISTS "backend can insert historico" ON public.historico_blaze;
CREATE POLICY "backend can insert historico"
ON public.historico_blaze
FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "backend can update historico" ON public.historico_blaze;
CREATE POLICY "backend can update historico"
ON public.historico_blaze
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);