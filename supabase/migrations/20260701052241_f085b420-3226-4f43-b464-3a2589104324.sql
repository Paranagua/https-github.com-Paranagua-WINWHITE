
CREATE TABLE IF NOT EXISTS public.blaze_results (
  id bigint PRIMARY KEY,
  roll text NOT NULL,
  color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blaze_results TO anon, authenticated;
GRANT ALL ON public.blaze_results TO service_role;

ALTER TABLE public.blaze_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read blaze_results"
  ON public.blaze_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS blaze_results_created_at_desc
  ON public.blaze_results (created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.blaze_results;
