-- Função para processar gatilhos automaticamente no banco
CREATE OR REPLACE FUNCTION public.process_gatilhos_analise()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger_at TIMESTAMP WITH TIME ZONE;
    v_minuto INT;
    v_pedra INT;
    v_existing_id UUID;
    v_gap INT;
BEGIN
    -- Só processamos se o timestamp for válido
    v_trigger_at := NEW.timestamp;
    v_pedra := NEW.numero;
    v_minuto := EXTRACT(MINUTE FROM v_trigger_at AT TIME ZONE 'America/Sao_Paulo');

    -- 1. Se o novo resultado for "0", atualizamos TODOS os gatilhos ativos
    IF v_pedra = 0 THEN
        UPDATE public.gatilhos_analise
        SET gaps = array_append(gaps, EXTRACT(EPOCH FROM (v_trigger_at - trigger_at))::INT / 60)
        WHERE array_length(gaps, 1) < 14 OR gaps IS NULL;
    END IF;

    -- 2. Verificamos novos gatilhos (Análise 1: Unidade do Minuto)
    IF (v_minuto % 10) = v_pedra AND v_pedra BETWEEN 0 AND 9 THEN
        -- Tenta encontrar se já existe esse gatilho exato para evitar duplicados
        SELECT id INTO v_existing_id 
        FROM public.gatilhos_analise 
        WHERE analise = 'analise1' AND pedra = v_pedra AND trigger_at = v_trigger_at;

        IF v_existing_id IS NULL THEN
            INSERT INTO public.gatilhos_analise (analise, pedra, minuto, trigger_at, detalhe, gaps)
            VALUES ('analise1', v_pedra, v_minuto, v_trigger_at, 'min ' || LPAD(v_minuto::text, 2, '0'), ARRAY[]::INT[]);
            
            -- Rotação FIFO: deleta o mais antigo se passar de 10
            DELETE FROM public.gatilhos_analise
            WHERE id IN (
                SELECT id FROM public.gatilhos_analise
                WHERE analise = 'analise1' AND pedra = v_pedra
                ORDER BY trigger_at DESC
                OFFSET 10
            );
        END IF;
    END IF;

    -- 3. Verificamos novos gatilhos (Análise 2: Pedras Consecutivas)
    -- Para isso precisamos do registro anterior
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

    -- 4. Verificamos novos gatilhos (Análise 3: Repetição Sequencial Cruzada)
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

-- Trigger para executar após cada inserção no histórico
DROP TRIGGER IF EXISTS trigger_process_gatilhos ON public.historico_blaze;
CREATE TRIGGER trigger_process_gatilhos
AFTER INSERT ON public.historico_blaze
FOR EACH ROW EXECUTE FUNCTION public.process_gatilhos_analise();
