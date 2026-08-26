DROP POLICY IF EXISTS "public insert valid blaze_results" ON public.blaze_results;

CREATE POLICY "public insert valid blaze_results"
ON public.blaze_results
FOR INSERT
TO anon, authenticated
WITH CHECK (
  id > 0
  AND btrim(roll) ~ '^(0|[1-9]|1[0-4])$'
  AND (
    (
      btrim(roll) = '0'
      AND lower(btrim(color)) = ANY (ARRAY['0', 'white', 'branco', 'branca', 'w'])
    )
    OR (
      btrim(roll) ~ '^[1-7]$'
      AND lower(btrim(color)) = ANY (ARRAY['1', 'red', 'vermelho', 'vermelha', 'r'])
    )
    OR (
      btrim(roll) ~ '^(8|9|1[0-4])$'
      AND lower(btrim(color)) = ANY (ARRAY['2', 'black', 'preto', 'preta', 'b'])
    )
  )
);