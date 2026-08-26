
-- Remove permissive INSERT policies that allowed anon/authenticated to write
DROP POLICY IF EXISTS "public insert valid blaze_results" ON public.blaze_results;
DROP POLICY IF EXISTS "validated collector can insert historico" ON public.historico_blaze;

-- Revoke INSERT/UPDATE/DELETE from anon/authenticated (SELECT is kept via policies)
REVOKE INSERT, UPDATE, DELETE ON public.blaze_results FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.historico_blaze FROM anon, authenticated;

-- Ensure service_role retains full access (backend ingestion via supabaseAdmin)
GRANT ALL ON public.blaze_results TO service_role;
GRANT ALL ON public.historico_blaze TO service_role;
