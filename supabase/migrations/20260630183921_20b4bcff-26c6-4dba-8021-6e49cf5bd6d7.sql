
CREATE OR REPLACE FUNCTION public.collect_blaze_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'pg_catalog'
AS $function$
DECLARE
  resp record;
  payload jsonb;
  item jsonb;
  v_id text;
  v_color int;
  v_roll int;
  v_ts timestamptz;
BEGIN
  FOR resp IN
    SELECT id, content
    FROM net._http_response
    WHERE status_code = 200
      AND created > now() - interval '2 minutes'
    ORDER BY created DESC
    LIMIT 5
  LOOP
    BEGIN
      payload := resp.content::jsonb;
    EXCEPTION WHEN OTHERS THEN payload := NULL;
    END;

    IF payload IS NOT NULL AND jsonb_typeof(payload) = 'array' THEN
      FOR item IN SELECT * FROM jsonb_array_elements(payload) LOOP
        v_id := item->>'id';
        IF v_id IS NULL THEN CONTINUE; END IF;
        BEGIN
          v_color := (item->>'color')::int;
          v_roll := (item->>'roll')::int;
          v_ts := (item->>'created_at')::timestamptz;
        EXCEPTION WHEN OTHERS THEN CONTINUE;
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

  DELETE FROM net._http_response WHERE created < now() - interval '5 minutes';

  PERFORM net.http_get(
    url := 'https://project--737d9ce4-bc3f-45f9-a474-1d1e493fe771-dev.lovable.app/api/public/recent',
    headers := jsonb_build_object('Accept', 'application/json'),
    timeout_milliseconds := 8000
  );
END;
$function$;
