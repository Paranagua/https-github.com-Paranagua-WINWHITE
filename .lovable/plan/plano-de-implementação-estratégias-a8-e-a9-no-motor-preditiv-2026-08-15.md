# Plano de Implementação: Estratégias A8 e A9 no Motor Preditivo

Este plano descreve a implementação das novas estratégias preditivas **A8 (Branco Duplo)** e **A9 (Pão de Branco)**, integrando-as ao motor de análise existente e ao sistema de auditoria automática.

## 1. Implementação das Lógicas Analíticas (`src/lib/predictive.ts`)

### Estratégia A8 - BRANCO DUPLO (⚪⚪)

- **Gatilho:** Duas pedras Brancas (0) consecutivas.
- **Extração de Gatilhos (G1-G6):**
  - G1/G2: Hora e Minuto do 1º Branco.
  - G3: Minuto do 2º Branco.
  - G4: Pedra anterior ao 1º Branco.
  - G5: Pedra posterior ao 2º Branco.
  - G6: Soma (G1 + G2 + G3).
- **Cálculo:** `deltaMinutes = G6 + G4 + G5`.
- **Projeção:** `Horário Alvo = Timestamp(B2) + deltaMinutes`.

### Estratégia A9 - PÃO DE BRANCO (⚪🔴⚪ ou ⚪⚫⚪)

- **Gatilho:** Branco seguido de cor normal (1-14) e outro Branco.
- **Extração de Gatilhos (G1-G6):**
  - G1: Peso Fixo 30.
  - G2: Valor da pedra central ("Carne").
  - G3: Pedra anterior ao 1º Branco.
  - G4: Pedra posterior ao 2º Branco.
  - G5: Timestamp da pedra central.
  - G6: Soma (G1 + G2 + G3 + G4).
- **Cálculo:** `deltaMinutes = 30 + G2 + G3 + G4`.
- **Projeção:** `Horário Alvo = Timestamp(Carne) + deltaMinutes`.

## 2. Integração com a UI (`src/components/double/PredictiveSignals.tsx`)

- Atualizar o `useMemo` do `engine` para incluir `buildA8` e `buildA9`.
- Garantir que estas estratégias participem da lógica de unificação e badges (Selo Azul, Sinal RARO).

## 3. Auditoria Automática (`src/components/sections/SinaisSection.tsx`)

- A lógica de auditoria existente no frontend (em `SinaisSection.tsx`) já monitora a janela de ±1 minuto e salva resultados em `historico_sinais_audit`.
- As novas predições de A8 e A9 fluirão naturalmente para este fluxo assim que integradas ao `predictiveList`.

## Detalhes Técnicos

- **Hierarquia:** As novas estratégias serão tratadas como fontes de confluência, podendo elevar o nível do sinal para Supremo/Diamante se coincidirem com outras.
- **Precisão:** Os cálculos de tempo serão normalizados para segundos zero para consistência com o histórico da Blaze.
