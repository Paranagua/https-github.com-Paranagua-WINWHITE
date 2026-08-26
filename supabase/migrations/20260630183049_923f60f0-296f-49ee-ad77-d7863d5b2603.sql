
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function that processes the latest Blaze HTTP response and triggers the next one.
CREATE OR REPLACE FUNCTION public.collect_blaze_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  resp record;
  payload jsonb;
  item jsonb;
  v_id text;
  v_color int;
  v_roll int;
  v_ts timestamptz;
BEGIN
  -- Read any successful responses we have not consumed yet.
  FOR resp IN
    SELECT id, content
    FROM net._http_response
    WHERE status_code = 200
      AND created > now() - interval '2 minutes'
    ORDER BY created DESC
    LIMIT 3
  LOOP
    BEGIN
      payload := resp.content::jsonb;
    EXCEPTION WHEN OTHERS THEN
      payload := NULL;
    END;

    IF payload IS NOT NULL AND jsonb_typeof(payload) = 'array' THEN
      FOR item IN SELECT * FROM jsonb_array_elements(payload) LOOP
        v_id := item->>'id';
        IF v_id IS NULL THEN CONTINUE; END IF;
        BEGIN
          v_color := (item->>'color')::int;
          v_roll := (item->>'roll')::int;
          v_ts := (item->>'created_at')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
          CONTINUE;
        END;

        INSERT INTO public.historico_blaze (blaze_id, numero, cor, data, hora, timestamp)
        VALUES (
          v_id,
          v_roll,
          CASE v_color WHEN 0 THEN 'white' WHEN 1 THEN 'red' ELSE 'black' END,
          (v_ts AT TIME ZONE 'America/Sao_Paulo')::date,
          (v_ts AT TIME ZONE 'America/Sao_Paulo')::time,
          v_ts
        )
        ON CONFLICT (blaze_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  -- Cleanup old responses to keep the net buffer small.
  DELETE FROM net._http_response WHERE created < now() - interval '5 minutes';

  -- Queue the next request (async; result will be picked up by the next tick).
  PERFORM net.http_get(
    url := 'https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1',
    headers := jsonb_build_object(
      'User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept', 'application/json',
      'Referer', 'https://blaze.bet.br/'
    ),
    timeout_milliseconds := 6000
  );
END;
$$;

-- Replace the old worker-based cron with the new DB-native one.
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'blaze-collect-tick';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'blaze-collect-db';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule('blaze-collect-db', '10 seconds', $cron$ SELECT public.collect_blaze_tick(); $cron$);

-- Kick it off immediately so the first response is queued.
SELECT public.collect_blaze_tick();
