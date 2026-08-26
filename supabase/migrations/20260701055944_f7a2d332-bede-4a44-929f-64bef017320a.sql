DROP POLICY IF EXISTS "public insert blaze_results" ON public.blaze_results;

CREATE POLICY "public insert valid blaze_results"
ON public.blaze_results
FOR INSERT
TO anon, authenticated
WITH CHECK (
  id > 0
  AND roll ~ '^(0|[1-9]|1[0-4])$'
  AND (
    (roll = '0' AND lower(color) IN ('0', 'white', 'branco', 'branca', 'w'))
    OR (roll ~ '^[1-7]$' AND lower(color) IN ('1', 'red', 'vermelho', 'vermelha', 'r'))
    OR (roll ~ '^(8|9|1[0-4])$' AND lower(color) IN ('2', 'black', 'preto', 'preta', 'b'))
  )
);