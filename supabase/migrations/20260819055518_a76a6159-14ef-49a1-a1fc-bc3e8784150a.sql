-- Fix linter warnings for ALL public security definer functions

-- 1. has_role (if exists)
do $$ 
begin
  if exists (select 1 from pg_proc where proname = 'has_role') then
    alter function public.has_role(uuid, public.app_role) set search_path = public;
    revoke execute on function public.has_role(uuid, public.app_role) from public;
    grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
  end if;
end $$;

-- 2. cleanup_audit_24h
alter function public.cleanup_audit_24h() set search_path = public;
revoke execute on function public.cleanup_audit_24h() from public;
grant execute on function public.cleanup_audit_24h() to service_role;

-- 3. get_strategy_stats
alter function public.get_strategy_stats(integer) set search_path = public;
revoke execute on function public.get_strategy_stats(integer) from public;
grant execute on function public.get_strategy_stats(integer) to anon, authenticated, service_role;

-- Ensure RLS is active and strict for writes
alter table public.historico_blaze enable row level security;
alter table public.gatilhos_analise enable row level security;
alter table public.historico_sinais_audit enable row level security;

-- Only SELECT is granted to public roles
revoke insert, update, delete on public.historico_blaze from anon, authenticated;
revoke insert, update, delete on public.gatilhos_analise from anon, authenticated;
revoke insert, update, delete on public.historico_sinais_audit from anon, authenticated;

grant select on public.historico_blaze to anon, authenticated;
grant select on public.gatilhos_analise to anon, authenticated;
grant select on public.historico_sinais_audit to anon, authenticated;

grant all on public.historico_blaze to service_role;
grant all on public.gatilhos_analise to service_role;
grant all on public.historico_sinais_audit to service_role;
