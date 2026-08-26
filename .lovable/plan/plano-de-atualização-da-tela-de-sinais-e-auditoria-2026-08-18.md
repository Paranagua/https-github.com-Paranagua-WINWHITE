# Plano de Atualização da Tela de Sinais e Auditoria

Este plano detalha as alterações na lógica de auditoria, limpeza de interface e a nova seção de histórico operacional.

## Alterações Propostas

### 1. Motor de Auditoria (Janela ±1 min)

- **Local:** `src/components/sections/SinaisSection.tsx`
- **Mudança:** Alterar a validação de resultados para considerar uma janela de 3 minutos:
  - Minuto Anterior (-1 min)
  - Minuto Exato (0 min)
  - Minuto Posterior (+1 min)
- **Status:** Marcar como "WIN" se o branco ocorrer em qualquer um desses minutos. Marcar como "RED" apenas se a janela expirar sem o resultado.

### 2. Limpeza da Interface

- **Local:** `src/components/sections/SinaisSection.tsx` e `src/components/double/PredictiveSignals.tsx`
- **Remoções:**
  - Bloco de rodapé com legendas ("LIVE FEED", "Martingale", etc.).
  - Textos de informação secundária dentro dos cards ("janela (tempo)", "limite 120m/148").

### 3. Nova Seção: Resultados Anteriores

- **Componente:** Criar `src/components/sections/PreviousResults.tsx` ou adicionar diretamente em `SinaisSection.tsx`.
- **Funcionalidades:**
  - Título "RESULTADOS ANTERIORES".
  - Lista de sinais finalizados nas últimas 4 horas.
  - Indicadores visuais de "WIN" e "RED".
  - Cálculo de assertividade (%) em tempo real exibido no topo da tela.

### 4. Persistência e Estado

- **Store:** Utilizar `src/lib/signalHistoryStore.ts` para gerenciar o histórico de 4 horas de forma reativa.

## Detalhes Técnicos

- Atualizar a função de validação no `useEffect` do `SinaisSection`.
- Filtrar o histórico no frontend para manter apenas os últimos 240 minutos (4h).
- Ajustar os cards do `PredictiveSignals` para remover os labels secundários.
