-- Criação da tabela gatilhos_analise se não existir
CREATE TABLE IF NOT EXISTS public.gatilhos_analise (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analise TEXT NOT NULL,
    pedra INT NOT NULL,
    minuto INT NOT NULL,
    trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
    fuso_horario TEXT DEFAULT 'America/Sao_Paulo',
    detalhe TEXT,
    gaps INT[] DEFAULT ARRAY[]::INT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.gatilhos_analise ENABLE ROW LEVEL SECURITY;

-- Grant permissões para authenticated e anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gatilhos_analise TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gatilhos_analise TO anon;
GRANT ALL ON public.gatilhos_analise TO service_role;

-- Políticas de RLS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gatilhos_analise' AND policyname = 'Allow public read') THEN
        CREATE POLICY "Allow public read" ON public.gatilhos_analise FOR SELECT TO public USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gatilhos_analise' AND policyname = 'Allow public insert') THEN
        CREATE POLICY "Allow public insert" ON public.gatilhos_analise FOR INSERT TO public WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gatilhos_analise' AND policyname = 'Allow public update') THEN
        CREATE POLICY "Allow public update" ON public.gatilhos_analise FOR UPDATE TO public USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gatilhos_analise' AND policyname = 'Allow public delete') THEN
        CREATE POLICY "Allow public delete" ON public.gatilhos_analise FOR DELETE TO public USING (true);
    END IF;
END $$;

-- Recriação das funções de processamento
CREATE OR REPLACE FUNCTION public.process_gatilhos_analise()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger_at TIMESTAMP WITH TIME ZONE;
    v_minuto INT;
    v_pedra INT;
    v_existing_id UUID;
BEGIN
    v_trigger_at := NEW.timestamp;
    v_pedra := NEW.numero;
    v_minuto := EXTRACT(MINUTE FROM v_trigger_at AT TIME ZONE 'America/Sao_Paulo');

    IF v_pedra = 0 THEN
        UPDATE public.gatilhos_analise
        SET gaps = array_append(gaps, EXTRACT(EPOCH FROM (v_trigger_at - trigger_at))::INT / 60)
        WHERE array_length(gaps, 1) < 14 OR gaps IS NULL;
    END IF;

    IF (v_minuto % 10) = v_pedra AND v_pedra BETWEEN 0 AND 9 THEN
        SELECT id INTO v_existing_id 
        FROM public.gatilhos_analise 
        WHERE analise = 'analise1' AND pedra = v_pedra AND trigger_at = v_trigger_at;

        IF v_existing_id IS NULL THEN
            INSERT INTO public.gatilhos_analise (analise, pedra, minuto, trigger_at, detalhe, gaps)
            VALUES ('analise1', v_pedra, v_minuto, v_trigger_at, 'min ' || LPAD(v_minuto::text, 2, '0'), ARRAY[]::INT[]);
            
            DELETE FROM public.gatilhos_analise
            WHERE id IN (
                SELECT id FROM public.gatilhos_analise
                WHERE analise = 'analise1' AND pedra = v_pedra
                ORDER BY trigger_at DESC
                OFFSET 10
            );
        END IF;
    END IF;

    DECLARE
        v_prev_numero INT;
    BEGIN
        SELECT numero INTO v_prev_numero 
        FROM public.historico_blaze 
        WHERE timestamp < v_trigger_at 
        ORDER BY timestamp DESC 
        LIMIT 1;

        IF v_prev_numero = v_pedra THEN
            INSERT INTO public.gatilhos_analise (analise, pedra, minuto, trigger_at, detalhe, gaps)
            VALUES ('analise2', v_pedra, v_minuto, v_trigger_at, 'repetição do ' || v_pedra, ARRAY[]::INT[]);
            
            DELETE FROM public.gatilhos_analise
            WHERE id IN (
                SELECT id FROM public.gatilhos_analise
                WHERE analise = 'analise2' AND pedra = v_pedra
                ORDER BY trigger_at DESC
                OFFSET 10
            );
        END IF;
    END;

    DECLARE
        v_prev_numero INT;
        v_prev_ts TIMESTAMP WITH TIME ZONE;
        v_prev_minuto INT;
    BEGIN
        SELECT numero, timestamp INTO v_prev_numero, v_prev_ts 
        FROM public.historico_blaze 
        WHERE timestamp < v_trigger_at 
        ORDER BY timestamp DESC 
        LIMIT 1;

        IF v_prev_numero = v_pedra AND v_pedra BETWEEN 0 AND 9 THEN
            v_prev_minuto := EXTRACT(MINUTE FROM v_prev_ts AT TIME ZONE 'America/Sao_Paulo');
            IF (v_prev_minuto % 10 = v_pedra) OR (v_minuto % 10 = v_pedra) THEN
                INSERT INTO public.gatilhos_analise (analise, pedra, minuto, trigger_at, detalhe, gaps)
                VALUES ('analise3', v_pedra, v_minuto, v_trigger_at, 'repetição do ' || v_pedra || ' · minuto casa', ARRAY[]::INT[]);
                
                DELETE FROM public.gatilhos_analise
                WHERE id IN (
                    SELECT id FROM public.gatilhos_analise
                    WHERE analise = 'analise3' AND pedra = v_pedra
                    ORDER BY trigger_at DESC
                    OFFSET 10
                );
            END IF;
        END IF;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_process_gatilhos ON public.historico_blaze;
CREATE TRIGGER trigger_process_gatilhos
AFTER INSERT ON public.historico_blaze
FOR EACH ROW EXECUTE FUNCTION public.process_gatilhos_analise();
