DROP POLICY IF EXISTS "Allow public update" ON public.gatilhos_analise;
DROP POLICY IF EXISTS "Allow public delete" ON public.gatilhos_analise;
DROP POLICY IF EXISTS "Allow public insert" ON public.gatilhos_analise;
DROP POLICY IF EXISTS "Allow public read" ON public.gatilhos_analise;

REVOKE UPDATE, DELETE ON public.gatilhos_analise FROM anon, authenticated;
GRANT SELECT ON public.gatilhos_analise TO anon, authenticated;
GRANT INSERT ON public.gatilhos_analise TO anon, authenticated;
GRANT ALL ON public.gatilhos_analise TO service_role;