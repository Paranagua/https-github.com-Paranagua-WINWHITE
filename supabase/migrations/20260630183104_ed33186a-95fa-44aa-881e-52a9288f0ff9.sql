
REVOKE EXECUTE ON FUNCTION public.collect_blaze_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collect_blaze_tick() TO postgres, service_role;
