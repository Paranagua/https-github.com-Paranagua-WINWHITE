DROP POLICY IF EXISTS "public insert valid blaze_results" ON public.blaze_results;

CREATE POLICY "public insert valid blaze_results"
ON public.blaze_results
FOR INSERT
TO anon, authenticated
WITH CHECK (
  roll ~ '^(0|[1-9]|1[0-4])$'
  AND (
    (roll = '0' AND color = 'white')
    OR (roll ~ '^[1-7]$' AND color = 'red')
    OR (roll ~ '^(8|9|1[0-4])$' AND color = 'black')
  )
);