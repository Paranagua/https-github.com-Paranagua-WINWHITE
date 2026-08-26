GRANT INSERT ON public.blaze_results TO anon, authenticated;

CREATE POLICY "public insert blaze_results"
ON public.blaze_results
FOR INSERT
TO anon, authenticated
WITH CHECK (true);