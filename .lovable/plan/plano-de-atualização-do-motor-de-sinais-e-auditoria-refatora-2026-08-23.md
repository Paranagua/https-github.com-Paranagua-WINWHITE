# Plano de Atualização do Motor de Sinais e Auditoria (Refatoração 2.0)

Este plano descreve a implementação da Análise Secundária (#1 a #9), Selo Azul, Unificação de Cards Consecutivos e Reestruturação da Auditoria (Visão Geral vs. Rodadas Atuais).

## Ajustes Técnicos

### 1. Análise Secundária e Selo Azul

- **Implementação**: No componente `PredictiveSignals.tsx`, a lógica de `buildSecondary` já existe. Vamos agora integrá-la para que, em vez de gerar cards, ela valide os cards existentes.
- **Lógica**: Se um sinal principal (A1-A7) tiver o mesmo `at` (horário alvo) que qualquer uma das 9 análises secundárias, definiremos `isVerified: true`.
- **UI**: Exibição do badge `☑️ Verificado` com ícone de check.

### 2. Unificação e Elevação de Nível

- **Detecção**: Agrupar sinais com diferença de 1 minuto (consecutivos).
- **Regra de 2**: Manter o de maior assertividade e elevar 1 nível na medalha (ex: Top 1 Isolado -> Bronze).
- **Regra de 3**: Usar o horário central e elevar para o ranking superior (Prata/Ouro/Diamante/Supremo).

### 3. Reestruturação da Auditoria (`SinaisSection.tsx`)

- **Abas**: Implementar toggle entre [Visão Geral] e [Rodadas Atuais].
- **Visão Geral**: Ranking das Top 5-10 estratégias (buscadas via RPC `get_strategy_stats`).
- **Rodadas Atuais**: Estatísticas em tempo real dos sinais ativos no feed.
- **Cálculo**: Limitar a 1 WIN por sinal (janela ±1 min).

### 4. Hierarquia de Medalhas

- Garantir a escala: Top 1 Isolado, Top 1 + Confluência, Bronze, Prata, Ouro, Diamante e Supremo.

## User Review Required

> [!IMPORTANT]
> A unificação de horários consecutivos pode reduzir o número total de cards exibidos, focando na qualidade e na elevação do nível do sinal. Isso está de acordo com sua preferência por um feed mais "limpo" e assertivo?

---

**Arquivos que serão modificados:**

- `src/components/double/PredictiveSignals.tsx` (Lógica de unificação e selo azul)
- `src/components/sections/SinaisSection.tsx` (Interface de auditoria e filtros)
- `src/lib/predictive.ts` (Eventuais ajustes nos tipos ou helpers)
