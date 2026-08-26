
-- Stop the scheduled job; collection now happens via the site's server function
DO $$
DECLARE jid int;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('blaze-collect-db','blaze-collect','blaze_collect_tick') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END$$;

-- Neutralize the function so any leftover call is a no-op (no simulation)
CREATE OR REPLACE FUNCTION public.collect_blaze_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- intentionally empty: ingestion is handled by the site backend
  RETURN;
END;
$function$;

DELETE FROM public.historico_blaze WHERE blaze_id LIKE 'sim-%';
