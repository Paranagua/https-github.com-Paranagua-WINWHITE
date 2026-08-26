
-- 1. Remover o trigger e função antigos para evitar duplicidade
DROP TRIGGER IF EXISTS trigger_process_gatilhos ON public.historico_blaze;

-- 2. Recriar a função de processamento com a lógica corrigida
CREATE OR REPLACE FUNCTION public.process_gatilhos_analise()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger_at TIMESTAMP WITH TIME ZONE;
    v_minuto INT;
    v_pedra INT;
    v_prev_numero INT;
    v_prev_ts TIMESTAMP WITH TIME ZONE;
    v_prev_minuto INT;
BEGIN
    v_trigger_at := NEW.timestamp;
    v_pedra := NEW.numero;
    v_minuto := EXTRACT(MINUTE FROM v_trigger_at AT TIME ZONE 'America/Sao_Paulo');

    -- Lógica de Preenchimento de Gaps (Calculado entre gatilho e ocorrência do 0)
    -- Só atualiza gatilhos que aconteceram ANTES deste zero e que ainda não completaram 14 contagens.
    IF v_pedra = 0 THEN
        UPDATE public.gatilhos_analise
        SET gaps = array_append(COALESCE(gaps, ARRAY[]::INT[]), (EXTRACT(EPOCH FROM (v_trigger_at - trigger_at))::INT / 60))
        WHERE (array_length(gaps, 1) < 14 OR gaps IS NULL)
          AND trigger_at < v_trigger_at;
    END IF;

    -- ANÁLISE 1: Gatilho por Unidade do Minuto (Pedra = Unidade do Minuto)
    IF (v_minuto % 10) = v_pedra AND v_pedra BETWEEN 0 AND 9 THEN
        -- Verifica se já não inserimos este gatilho exato
        IF NOT EXISTS (
            SELECT 1 FROM public.gatilhos_analise 
            WHERE analise = 'analise1' AND pedra = v_pedra AND trigger_at = v_trigger_at
        ) THEN
            INSERT INTO public.gatilhos_analise (analise, pedra, minuto, trigger_at, detalhe, gaps)
            VALUES ('analise1', v_pedra, v_minuto, v_trigger_at, 'min ' || LPAD(v_minuto::text, 2, '0'), ARRAY[]::INT[]);
            
            -- Limpeza FIFO: Mantém apenas os 10 mais recentes para esta análise/pedra
            DELETE FROM public.gatilhos_analise
            WHERE id IN (
                SELECT id FROM public.gatilhos_analise
                WHERE analise = 'analise1' AND pedra = v_pedra
                ORDER BY trigger_at DESC
                OFFSET 10
            );
        END IF;
    END IF;

    -- Busca o anterior para Análise 2 e 3
    SELECT numero, timestamp INTO v_prev_numero, v_prev_ts 
    FROM public.historico_blaze 
    WHERE timestamp < v_trigger_at 
    ORDER BY timestamp DESC 
    LIMIT 1;

    -- ANÁLISE 2: Repetição (Pedras Consecutivas Iguais)
    IF v_prev_numero = v_pedra THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.gatilhos_analise 
            WHERE analise = 'analise2' AND pedra = v_pedra AND trigger_at = v_trigger_at
        ) THEN
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
    END IF;

    -- ANÁLISE 3: Repetição Cruzada com Unidade do Minuto
    IF v_prev_numero = v_pedra AND v_pedra BETWEEN 0 AND 9 THEN
        v_prev_minuto := EXTRACT(MINUTE FROM v_prev_ts AT TIME ZONE 'America/Sao_Paulo');
        IF (v_prev_minuto % 10 = v_pedra) OR (v_minuto % 10 = v_pedra) THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.gatilhos_analise 
                WHERE analise = 'analise3' AND pedra = v_pedra AND trigger_at = v_trigger_at
            ) THEN
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
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. Re-anexar o trigger
CREATE TRIGGER trigger_process_gatilhos
AFTER INSERT ON public.historico_blaze
FOR EACH ROW EXECUTE FUNCTION public.process_gatilhos_analise();
