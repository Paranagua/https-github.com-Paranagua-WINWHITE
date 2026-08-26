# Plano de Ajuste Fino do Motor de Sinais e Ciclo de Vida dos Cards

O objetivo é implementar as novas regras de gatilho, calibragem de tempo, alertas de segurança ("possível rec"), selo verde e o novo ciclo de vida de auditoria (±1 minuto) com remoção automática de cards após 3 minutos.

## Etapas

### 1. Módulo de Projeção & Algoritmos (Backend/Lib)

- Atualizar `src/lib/predictive.ts`:
  - Implementar Gatilho **8-11** (Minuto 8 + Soma pedras anteriores).
  - Implementar Gatilho **11-11** (Minuto 1º 11 + Soma adjacentes + 10 min).
  - Atualizar Gatilho **4-11** (+5 min).
  - Implementar Gatilho **4-14 / 14-4** (+1 min).
  - Aplicar **Offset de +1 min** para estratégias 17, 18 e 19.

### 2. Alertas de Segurança & Selo Verde

- Modificar `src/lib/predictive.ts` e `src/components/double/PredictiveSignals.tsx`:
  - Implementar lógica de timers para "possível rec" (Gatilhos 7-14, 4-7, 5-14).
  - Refinar o "Selo Verde" para os gatilhos 7-11 / 11-7 (+5 min).

### 3. Ciclo de Vida & Auditoria

- Atualizar `src/components/sections/SinaisSection.tsx`:
  - Mudar estado inicial para `PENDENTE`.
  - Implementar delay de auditoria (Horário Alvo + 2 minutos).
  - Aplicar janela de ±1 minuto para conferência de Branco (0).
  - Configurar remoção automática dos cards 3 minutos após o carimbo (WIN/RED).

## Detalhes Técnicos

- As fórmulas matemáticas serão integradas diretamente nas funções `buildA*` e na lógica de geração de sinais.
- O feed reativo usará o `signalHistoryStore` para gerenciar a persistência e remoção temporal.
- A auditoria consultará `blaze_results` para validar a janela temporal especificada.
