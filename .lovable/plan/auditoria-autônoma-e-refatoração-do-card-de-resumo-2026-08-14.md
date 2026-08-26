# Auditoria Autônoma e Refatoração do Card de Resumo

Reestruturar o fluxo de auditoria para ser 100% autônomo (baseado no histórico persistido) e refinar o card de resumo na aba Sinais com as visões "Geral" e "Rodadas Atuais".

## Alterações Técnicas

### 1. Motor de Auditoria Autônomo

- **SinaisSection.tsx**:
  - Mover a lógica de validação de sinais para um hook ou efeito que observa as mudanças no histórico de resultados e as projeções geradas.
  - Implementar a gravação automática na tabela `historico_sinais_audit` quando um padrão (A1-A7) for disparado (não apenas quando clicado no botão).
  - Garantir que a validação de WIN (janela ±1 min) ocorra de forma binária (WIN ou LOSS) e atualize o banco de dados.

### 2. Card de Resumo e Filtros

- **SinaisSection.tsx**:
  - **Aba Visão Geral**: Consultar a tabela `historico_sinais_audit` para identificar as Top 5 ou Top 10 estratégias mais assertivas do dia e exibi-las por padrão.
  - **Aba Rodadas Atuais**: Filtrar as estatísticas para mostrar apenas o desempenho dos sinais que estão ativos na tela no momento (Projeção Top 1 e Confluências).
  - Adicionar um estado ou disparador que alterna automaticamente para "Rodadas Atuais" quando o usuário clica em "Próximo Branco".

### 3. Melhorias de UX e UI

- **SinaisSection.tsx**:
  - Ajustar o layout do card de auditoria para uma visualização premium.
  - Garantir que as estatísticas reflitam a assertividade em tempo real sem necessidade de interação manual.

### 4. Database (Supabase)

- Garantir que a tabela `historico_sinais_audit` possua os campos necessários: `analise` (string), `tipo_sinal` (string), `nivel` (string), `predicao_horario` (string), `status` (string: WIN, LOSS, PENDENTE), `minuto_alvo` (timestamptz).
- A política de RLS já foi configurada para permitir INSERT e SELECT conforme necessário.
