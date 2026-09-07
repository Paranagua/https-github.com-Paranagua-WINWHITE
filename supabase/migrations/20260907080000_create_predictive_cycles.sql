-- Migration: Criação da tabela predictive_cycles para persistência dos ciclos e gatilhos preditivos
CREATE TABLE IF NOT EXISTS public.predictive_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_key TEXT UNIQUE NOT NULL,
    analysis INT NOT NULL,
    analysis_code TEXT,
    analysis_name TEXT,
    value INT NOT NULL,
    trigger_at TIMESTAMPTZ NOT NULL,
    gaps INT[] NOT NULL DEFAULT '{}'::INT[],
    total_whites INT NOT NULL DEFAULT 0,
    first_white_gap INT,
    status TEXT NOT NULL DEFAULT 'aberto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para busca rápida e ordenação
CREATE UNIQUE INDEX IF NOT EXISTS idx_predictive_cycles_key ON public.predictive_cycles(cycle_key);
CREATE INDEX IF NOT EXISTS idx_predictive_cycles_lookup ON public.predictive_cycles(analysis, value, trigger_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_cycles_status ON public.predictive_cycles(status, trigger_at DESC);

-- Habilitar RLS
ALTER TABLE public.predictive_cycles ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
DROP POLICY IF EXISTS "predictive_cycles_select" ON public.predictive_cycles;
CREATE POLICY "predictive_cycles_select" ON public.predictive_cycles
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "predictive_cycles_insert" ON public.predictive_cycles;
CREATE POLICY "predictive_cycles_insert" ON public.predictive_cycles
    FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "predictive_cycles_update" ON public.predictive_cycles;
CREATE POLICY "predictive_cycles_update" ON public.predictive_cycles
    FOR UPDATE TO public USING (true);

-- Permissões de papéis
GRANT SELECT, INSERT, UPDATE ON public.predictive_cycles TO anon, authenticated, service_role;
GRANT ALL ON public.predictive_cycles TO service_role;
