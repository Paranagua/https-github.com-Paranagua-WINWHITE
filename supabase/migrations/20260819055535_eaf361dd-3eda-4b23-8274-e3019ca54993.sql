-- Fix search_path and execution rights for ALL detected functions

-- 1. gatilhos_analise_fifo
alter function public.gatilhos_analise_fifo() set search_path = public;
revoke execute on function public.gatilhos_analise_fifo() from public;
grant execute on function public.gatilhos_analise_fifo() to service_role;

-- 2. cleanup_audit_24h
alter function public.cleanup_audit_24h() set search_path = public;
revoke execute on function public.cleanup_audit_24h() from public;
grant execute on function public.cleanup_audit_24h() to service_role;

-- 3. get_strategy_stats
alter function public.get_strategy_stats(integer) set search_path = public;
revoke execute on function public.get_strategy_stats(integer) from public;
grant execute on function public.get_strategy_stats(integer) to anon, authenticated, service_role;

-- 4. process_gatilhos_analise
alter function public.process_gatilhos_analise() set search_path = public;
revoke execute on function public.process_gatilhos_analise() from public;
grant execute on function public.process_gatilhos_analise() to service_role;

-- 5. handle_new_blaze_result (often used for triggers)
do $$ 
begin
  if exists (select 1 from pg_proc where proname = 'handle_new_blaze_result') then
    alter function public.handle_new_blaze_result() set search_path = public;
    revoke execute on function public.handle_new_blaze_result() from public;
    grant execute on function public.handle_new_blaze_result() to service_role;
  end if;
end $$;

-- 6. update_audit_status (if exists)
do $$ 
begin
  if exists (select 1 from pg_proc where proname = 'update_audit_status') then
    alter function public.update_audit_status() set search_path = public;
    revoke execute on function public.update_audit_status() from public;
    grant execute on function public.update_audit_status() to service_role;
  end if;
end $$;

-- Fix any other security definer functions found
do $$
declare
    func_record record;
begin
    for func_record in 
        select proname, oidvectortypes(proargtypes) as args
        from pg_proc p
        join pg_namespace n on p.pronamespace = n.oid
        where n.nspname = 'public' 
          and p.prosecdef = true
    loop
        execute format('alter function public.%I(%s) set search_path = public', func_record.proname, func_record.args);
    end loop;
end $$;
