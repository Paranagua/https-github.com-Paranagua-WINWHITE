REVOKE ALL ON FUNCTION public.gatilhos_analise_fifo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gatilhos_analise_fifo() TO service_role;