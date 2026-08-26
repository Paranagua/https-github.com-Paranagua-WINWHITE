CREATE OR REPLACE FUNCTION public.normalize_blaze_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  clean_roll text;
  clean_color text;
BEGIN
  clean_roll := lower(btrim(COALESCE(NEW.roll, '')));
  clean_color := lower(btrim(COALESCE(NEW.color, '')));

  IF clean_roll IN ('vermelho', 'red') THEN
    NEW.roll := clean_roll;
    NEW.color := 'red';
  ELSIF clean_roll IN ('preto', 'black') THEN
    NEW.roll := clean_roll;
    NEW.color := 'black';
  ELSIF clean_roll IN ('branco', 'white') THEN
    NEW.roll := clean_roll;
    NEW.color := 'white';
  ELSIF clean_roll = '0' THEN
    NEW.roll := clean_roll;
    NEW.color := 'white';
  ELSIF clean_roll ~ '^[1-7]$' THEN
    NEW.roll := clean_roll;
    NEW.color := 'red';
  ELSIF clean_roll ~ '^(8|9|1[0-4])$' THEN
    NEW.roll := clean_roll;
    NEW.color := 'black';
  ELSE
    NEW.roll := clean_roll;
    NEW.color := clean_color;
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
  color IN ('white', 'red', 'black')
  AND (
    roll ~ '^(0|[1-9]|1[0-4])$'
    OR roll IN ('vermelho', 'red', 'preto', 'black', 'branco', 'white')
  )
);