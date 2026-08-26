# Plano: Reformulação Visual Histórico TipMiner

Este plano detalha a reformulação visual completa do histórico de resultados para reproduzir fielmente a identidade visual do **TipMiner Blaze Double**, mantendo 100% das funcionalidades existentes.

## Alterações Visuais

### 1. Fundação e Fundo

- Atualizar a cor de fundo global e dos containers para `#090B0D` (tom exato do TipMiner).
- Remover bordas excessivas e sombras que desviam do visual "flat/compacto" da referência.

### 2. Pedras (ResultCircle e BlazeResultCard)

- **Dimensões:** Fixar em 52x50px.
- **Arredondamento:** Reduzir para `rounded-sm` (4px).
- **Cores:**
  - Vermelho: `#DE2143` com borda sutil.
  - Preto: `#16171d` (cinza muito escuro, não preto puro).
  - Branco: Fundo branco puro com ícone centralizado.
- **Tipografia:** Números centralizados com fonte densa e clara.

### 3. Horários

- Posicionar abaixo da pedra com `mt-1` (aprox. 4px).
- Reduzir tamanho da fonte para 9px.
- Usar cor discreta (`text-muted-foreground/60`).

### 4. Grid e Espaçamento

- **Gaps:** Ajustar para `gap-x-[6px]` e `gap-y-[8px]`.
- **Densidade:** Otimizar o grid para exibir o máximo de pedras por linha, similar à densidade do TipMiner.

## Detalhes Técnicos

- **Arquivos afetados:**
  - `src/styles.css`: Atualização de variáveis de cores (`--background`, `--surface`).
  - `src/components/double/BlazeResultCard.tsx`: Ajuste de dimensões, arredondamento e alinhamento do horário.
  - `src/components/double/ResultCircle.tsx`: Sincronização de cores e estilos para uso em outras partes do app.
  - `src/routes/app.tsx`: Ajuste das classes de grid (`gap`, `padding`) nos modos Lista e Colunas.

- **Preservação de Lógica:** Nenhuma alteração em `signalsStore.ts`, `predictive.ts` ou eventos de clique. O foco é puramente CSS e propriedades de estilo.

---

_O objetivo final é que, ao abrir o site, o usuário sinta que está visualizando o histórico original do TipMiner._
