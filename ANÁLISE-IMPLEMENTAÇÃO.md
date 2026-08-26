faça uma análise completa da implementação atual da aba Análise.

Os gatilhos (A1, A2, etc.) já estão funcionando corretamente e não devem ser alterados.

Quero que você identifique:

1. Onde está sendo calculado atualmente o campo "Minutos até o 0".

2. Se esse cálculo está sendo feito com dados em memória ou utilizando diretamente o Histórico do Supabase.

3. Por que a lógica atual não está registrando corretamente os 14 tempos de cada gatilho.

4. Como corrigir essa lógica para que:

Cada gatilho crie um ciclo independente;

Cada ciclo registre exatamente os próximos 14 zeros encontrados no Histórico;

O tempo seja calculado entre o horário do gatilho e o horário de cada ocorrência do número 0;

Um mesmo 0 possa atualizar vários ciclos ativos, quando aplicável.

5. Como implementar o limite de 10 ciclos por análise (A1, A2, etc.), funcionando como uma fila rotativa (FIFO), onde ao surgir o 11º gatilho o mais antigo é removido e o novo passa a fazer parte dos 10 mais recentes.

6. Quais arquivos, componentes, hooks, serviços e consultas ao Supabase precisarão ser alterados.

7. Quais tabelas do banco serão utilizadas ou modificadas.
