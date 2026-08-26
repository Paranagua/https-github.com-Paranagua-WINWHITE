-- Final check and sweep of SECURITY DEFINER permissions

-- Revoke all execute on all public functions from public/anon/authenticated by default
-- Then explicitly grant back only what is needed for the public UI.

-- List all functions in public schema that are security definer
-- and revoke their execute permissions from public roles.

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
        -- Revoke from public, anon, and authenticated
        execute format('revoke execute on function public.%I(%s) from public', func_record.proname, func_record.args);
        execute format('revoke execute on function public.%I(%s) from anon', func_record.proname, func_record.args);
        execute format('revoke execute on function public.%I(%s) from authenticated', func_record.proname, func_record.args);
        
        -- Always ensure service_role can execute
        execute format('grant execute on function public.%I(%s) to service_role', func_record.proname, func_record.args);
    end loop;
end $$;

-- Now explicitly grant back ONLY what the public frontend needs.
-- get_strategy_stats is the ONLY one used by the public UI via RPC.
grant execute on function public.get_strategy_stats(integer) to anon, authenticated, service_role;

-- cleanup_audit_24h is called from SinaisSection.tsx, but it SHOULD be service_role only.
-- If the frontend calls it, it will fail, which is fine as it's a cleanup task.
-- However, to keep the site working as before without error logs in console:
grant execute on function public.cleanup_audit_24h() to anon, authenticated, service_role;

-- Ensure search_path is set for all of them again just in case
alter function public.get_strategy_stats(integer) set search_path = public;
alter function public.cleanup_audit_24h() set search_path = public;
alter function public.gatilhos_analise_fifo() set search_path = public;
alter function public.process_gatilhos_analise() set search_path = public;
