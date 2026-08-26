-- Fix Function Search Path Mutable for cleanup_audit_24h
alter function public.cleanup_audit_24h() set search_path = public;

-- Fix Function Search Path Mutable for get_strategy_stats
alter function public.get_strategy_stats(lookback_hours integer) set search_path = public;

-- Revoke public execution of security definer functions to address linter warnings
-- These should be called by the system/backend via service_role, or we can grant specific roles if needed.
-- But since they are internally used by the app, we might need to grant authenticated/anon if the frontend calls them.
-- get_strategy_stats is used in SinaisSection.tsx via supabase.rpc('get_strategy_stats')
-- So authenticated/anon DO need execute permission if the site is public.

revoke execute on function public.cleanup_audit_24h() from public;
revoke execute on function public.cleanup_audit_24h() from anon;
revoke execute on function public.cleanup_audit_24h() from authenticated;
grant execute on function public.cleanup_audit_24h() to service_role;

-- get_strategy_stats is needed by the public frontend
grant execute on function public.get_strategy_stats(integer) to anon, authenticated, service_role;
