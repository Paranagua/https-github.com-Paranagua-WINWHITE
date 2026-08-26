# Plano: Reformulação Visual do Histórico (Estilo Dark Compacto)

Reformular o componente de histórico para corresponder à referência visual "Blaze Premium Dark", focando em um design compacto, fundo escuro e tipografia refinada, mantendo 100% das funcionalidades de filtros, atualização em tempo real e interações.

## Alterações Visuais

### 1. Componente `BlazeResultCard`

- **Dimensões:** Reduzir largura total para ~52px.
- **Pedras (Células):**
  - Altura da pedra fixada em ~50px.
  - Cantos arredondados (border-radius: 6px-8px).
  - **Vermelho:** Fundo `#DE2143` sólido, número branco centralizado.
  - **Preto:** Fundo `#16171d` (grafite escuro), número branco centralizado com borda discreta.
  - **Branco:** Fundo `#FFFFFF`, número/ícone central em vermelho (removendo a imagem de fundo anterior se interferir na clareza).
- **Tipografia:** Números perfeitamente centralizados, horário pequeno (`text-[10px]`) e acinzentado logo abaixo da pedra.
- **Interação:** Efeito de hover com leve brilho ou borda destacada.

### 2. Layout e Grid (`src/routes/app.tsx`)

- Ajustar o container do histórico para ser mais compacto.
- Aumentar a densidade de pedras por linha no Desktop.
- Manter a responsividade no Mobile (sentido inverso/lista se configurado).

### 3. Tematização Global

- Garantir que o fundo do histórico utilize o token `--surface` ou preto absoluto conforme a referência.

## Detalhes Técnicos

- Atualizar `src/components/double/BlazeResultCard.tsx` com o novo CSS inline/Tailwind para os tamanhos exatos.
- Ajustar `ResultCircle.tsx` para garantir que o estilo quadrado e as cores internas sigam o novo padrão.
- Manter todas as props atuais (`n`, `color`, `time`, `signal`, `dimmed`, `selected`, `onClick`) para não quebrar a lógica de auditoria e robô.
