CREATE TABLE IF NOT EXISTS public.historico_blaze (
  id bigserial PRIMARY KEY,
  blaze_id text NOT NULL UNIQUE,
  numero integer NOT NULL,
  cor text NOT NULL,
  data date NOT NULL,
  hora time NOT NULL,
  "timestamp" timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS historico_blaze_ts_idx ON public.historico_blaze ("timestamp" DESC);
GRANT SELECT ON public.historico_blaze TO anon;
GRANT SELECT ON public.historico_blaze TO authenticated;
GRANT ALL ON public.historico_blaze TO service_role;
ALTER TABLE public.historico_blaze ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico publico para leitura" ON public.historico_blaze;
CREATE POLICY "historico publico para leitura" ON public.historico_blaze FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.gatilhos_analise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  analise text NOT NULL DEFAULT 'analise1',
  pedra integer NOT NULL,
  minuto integer NOT NULL,
  fuso_horario text NOT NULL DEFAULT 'America/Sao_Paulo',
  trigger_at timestamptz NOT NULL DEFAULT now(),
  detalhe text,
  gaps integer[] NOT NULL DEFAULT '{}'::integer[]
);
CREATE UNIQUE INDEX IF NOT EXISTS gatilhos_analise_unq ON public.gatilhos_analise (analise, pedra, trigger_at);
CREATE INDEX IF NOT EXISTS gatilhos_analise_recentes_idx ON public.gatilhos_analise (analise, pedra, trigger_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gatilhos_analise TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gatilhos_analise TO authenticated;
GRANT ALL ON public.gatilhos_analise TO service_role;
ALTER TABLE public.gatilhos_analise ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gatilhos leitura publica" ON public.gatilhos_analise;
CREATE POLICY "gatilhos leitura publica" ON public.gatilhos_analise FOR SELECT USING (true);
DROP POLICY IF EXISTS "gatilhos escrita publica" ON public.gatilhos_analise;
CREATE POLICY "gatilhos escrita publica" ON public.gatilhos_analise FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "gatilhos update publico" ON public.gatilhos_analise;
CREATE POLICY "gatilhos update publico" ON public.gatilhos_analise FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "gatilhos delete publico" ON public.gatilhos_analise;
CREATE POLICY "gatilhos delete publico" ON public.gatilhos_analise FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.gatilhos_analise_fifo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.gatilhos_analise g
  WHERE g.analise = NEW.analise
    AND g.pedra = NEW.pedra
    AND g.id NOT IN (
      SELECT k.id FROM public.gatilhos_analise k
      WHERE k.analise = NEW.analise AND k.pedra = NEW.pedra
      ORDER BY k.trigger_at DESC
      LIMIT 10
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS gatilhos_analise_fifo_trg ON public.gatilhos_analise;
CREATE TRIGGER gatilhos_analise_fifo_trg
AFTER INSERT ON public.gatilhos_analise
FOR EACH ROW EXECUTE FUNCTION public.gatilhos_analise_fifo();

ALTER TABLE public.gatilhos_analise REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'gatilhos_analise'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.gatilhos_analise';
  END IF;
END $$;