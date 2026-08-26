
CREATE TABLE public.historico_blaze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blaze_id text NOT NULL UNIQUE,
  numero smallint NOT NULL,
  cor text NOT NULL CHECK (cor IN ('red','black','white')),
  data date NOT NULL,
  hora time NOT NULL,
  "timestamp" timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_blaze_data_ts ON public.historico_blaze (data, "timestamp" DESC);
CREATE INDEX idx_historico_blaze_ts ON public.historico_blaze ("timestamp" DESC);

GRANT SELECT ON public.historico_blaze TO anon, authenticated;
GRANT ALL ON public.historico_blaze TO service_role;

ALTER TABLE public.historico_blaze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read historico"
  ON public.historico_blaze FOR SELECT
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.historico_blaze;
ALTER TABLE public.historico_blaze REPLICA IDENTITY FULL;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
