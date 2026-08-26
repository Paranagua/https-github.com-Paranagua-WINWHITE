CREATE OR REPLACE FUNCTION public.normalize_blaze_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  clean_roll text;
BEGIN
  clean_roll := btrim(NEW.roll);
  NEW.roll := clean_roll;

  IF clean_roll = '0' THEN
    NEW.color := 'white';
  ELSIF clean_roll ~ '^[1-7]$' THEN
    NEW.color := 'red';
  ELSIF clean_roll ~ '^(8|9|1[0-4])$' THEN
    NEW.color := 'black';
  ELSE
    NEW.color := lower(btrim(COALESCE(NEW.color, '')));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_blaze_result_before_insert ON public.blaze_results;
CREATE TRIGGER normalize_blaze_result_before_insert
BEFORE INSERT ON public.blaze_results
FOR EACH ROW
EXECUTE FUNCTION public.normalize_blaze_result();

DROP POLICY IF EXISTS "public insert valid blaze_results" ON public.blaze_results;

CREATE POLICY "public insert valid blaze_results"
ON public.blaze_results
FOR INSERT
TO anon, authenticated
WITH CHECK (
  id > 0
  AND btrim(roll) ~ '^(0|[1-9]|1[0-4])$'
  AND lower(btrim(color)) = ANY (ARRAY['white', 'red', 'black'])
);