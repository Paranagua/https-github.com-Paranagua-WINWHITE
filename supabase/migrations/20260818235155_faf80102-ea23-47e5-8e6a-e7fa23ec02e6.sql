-- Secure the cleanup function
ALTER FUNCTION public.cleanup_audit_24h() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.cleanup_audit_24h() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_audit_24h() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_audit_24h() FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_24h() TO service_role;
