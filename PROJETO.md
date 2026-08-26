# FREITAS DA BLAZE — Relatório Técnico Completo do Projeto

Documento de replicação. Seguindo este arquivo é possível recriar o projeto **idêntico** em outra conta Lovable e ele funcionar exatamente como este.

- Preview: `https://id-preview--39ea3609-e5bc-46a6-93f4-36044ce8cbad.lovable.app`
- Publicado: `https://historicofreitasdablaze.lovable.app`
- Idioma da UI: pt-BR · Fuso de referência: `America/Sao_Paulo` (UTC-3, sem DST)

---

## 1. Stack

| Camada         | Tecnologia                                             |
| -------------- | ------------------------------------------------------ |
| Framework      | TanStack Start v1 (React 19 + SSR)                     |
| Build          | Vite 8 via `@lovable.dev/vite-tanstack-config`         |
| Roteamento     | TanStack Router (file-based em `src/routes`)           |
| Dados/cache    | TanStack Query v5                                      |
| Estilo         | Tailwind CSS v4 (`src/styles.css`, tokens em `@theme`) |
| UI             | shadcn/ui (new-york, baseColor slate) + lucide-react   |
| Animação       | framer-motion + canvas puro (fogos de artifício)       |
| Backend        | Lovable Cloud (Postgres + Realtime + RLS)              |
| Deploy runtime | Worker edge (nitro/cloudflare)                         |

Dependências relevantes: `@supabase/supabase-js`, `framer-motion`, `recharts`, `sonner`, `zod`, `date-fns`, `@fontsource-variable/inter`, `tw-animate-css`.

Não usar: react-router-dom, react-helmet-async, `src/pages`, `src/App.tsx`, edge functions (a lógica de servidor é `createServerFn` / rotas `src/routes/api`).

---

## 2. Arquitetura de dados (ponto crítico da replicação)

O projeto lê de **duas** bases:

### 2.1 Base EXTERNA de resultados da Blaze (somente leitura)

Arquivo: `src/integrations/supabase/blaze-client.ts`

```ts
const BLAZE_SUPABASE_URL = "https://fprjzaawmhadvwdlyfun.supabase.co";
const BLAZE_SUPABASE_ANON_KEY = "sb_publishable_6_SYqk2nwh4IyEgwLGtiuQ_JI_Zf9Ov";
```

- Cliente separado, `persistSession: false`, com `fetch` custom que remove `Authorization: Bearer <key>` e envia apenas `apikey` (chaves `sb_publishable_` são opacas, não JWT).
- Tabela lida: **`blaze_results`** com colunas `id`, `roll` (0–14), `color` (0=branco, 1=vermelho, 2=preto), `created_at` (timestamptz UTC).
- Quem grava nela é um bot externo (Discloud). Ao replicar em outra conta, **mantenha esse cliente igual** — é o que garante o mesmo histórico.

### 2.2 Base PRÓPRIA (Lovable Cloud do projeto)

Arquivo gerado: `src/integrations/supabase/client.ts` (não editar). Env em `.env`:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (gerados automaticamente ao ativar o Cloud na nova conta).

Guarda: gatilhos da Análise (`gatilhos_analise`) e espelho opcional do histórico (`historico_blaze`).

---

## 3. Schema SQL consolidado (rodar na nova conta)

```sql
-- ============ 3.1 GATILHOS DA ANÁLISE ============
create table public.gatilhos_analise (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  analise text not null default 'analise1',
  pedra integer not null,
  minuto integer not null,
  fuso_horario text not null default 'America/Sao_Paulo',
  trigger_at timestamptz not null default now(),
  detalhe text,
  gaps integer[] not null default '{}'::integer[]
);

grant select, insert on public.gatilhos_analise to authenticated;
grant select, insert on public.gatilhos_analise to anon;   -- app é público, sem login
grant all on public.gatilhos_analise to service_role;

alter table public.gatilhos_analise enable row level security;

create policy "gatilhos leitura publica"
on public.gatilhos_analise for select to public using (true);

-- INSERT validado (nada de policy "true"): valida faixa, fuso, tamanho e janela temporal
create policy "gatilhos insercao validada"
on public.gatilhos_analise for insert to anon, authenticated
with check (
  analise = any (array['analise1','analise2','analise3'])
  and pedra between 0 and 14
  and minuto between 0 and 59
  and fuso_horario = 'America/Sao_Paulo'
  and (detalhe is null or length(detalhe) <= 120)
  and array_length(gaps,1) is distinct from 0
  and coalesce(array_length(gaps,1),0) <= 60
  and trigger_at > (now() - interval '30 days')
  and trigger_at < (now() + interval '1 day')
);
-- UPDATE e DELETE ficam SEM policy => negados para anon/authenticated.

create index if not exists gatilhos_analise_lookup_idx
  on public.gatilhos_analise (analise, pedra, trigger_at desc);

-- Janela deslizante FIFO de 10 por (análise, pedra)
create or replace function public.gatilhos_analise_fifo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.gatilhos_analise g
  where g.analise = new.analise
    and g.pedra = new.pedra
    and g.id not in (
      select k.id from public.gatilhos_analise k
      where k.analise = new.analise and k.pedra = new.pedra
      order by k.trigger_at desc
      limit 10
    );
  return null;
end;
$$;

create trigger gatilhos_analise_fifo_trg
after insert on public.gatilhos_analise
for each row execute function public.gatilhos_analise_fifo();

-- Realtime
alter publication supabase_realtime add table public.gatilhos_analise;

-- ============ 3.2 ESPELHO DO HISTÓRICO (coletor) ============
create table public.historico_blaze (
  id bigserial primary key,
  blaze_id text not null unique,
  numero integer not null,
  cor text not null,
  data date not null,
  hora time not null,
  timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

grant select on public.historico_blaze to anon, authenticated;
grant all on public.historico_blaze to service_role;

alter table public.historico_blaze enable row level security;

create policy "historico publico para leitura"
on public.historico_blaze for select to public using (true);
-- sem policies de insert/update/delete: só service_role escreve (via coletor)
```

### Postura de segurança adotada

- Nenhuma policy de escrita para `anon` além do INSERT validado dos gatilhos.
- `historico_blaze` é escrito **apenas** pelo endpoint coletor com `service_role`.
- Nenhum dado pessoal no banco; app público sem autenticação (por isso não há `user_roles`).
- Endpoint público protegido por segredo compartilhado com comparação timing-safe.

---

## 4. Endpoints de servidor

### `src/routes/api/public/collect.ts` (GET/POST)

1. Exige `process.env.COLLECTOR_SECRET`; sem ele responde `503 collector disabled`.
2. Lê o segredo de `x-collector-secret` ou `Authorization: Bearer …` e compara com `timingSafeEqual` manual → `401` se divergir.
3. Busca as rodadas nas fontes (fallback em cascata, timeout 5s, corpo limitado a 512 KB):
   - `https://blaze.bet.br/api/singleplayer-originals/originals/roulette_games/recent/1`
   - `https://api-v2.blaze1.space/…/recent/1`
   - `https://api-v2.blaze1.space/…/recent/history/1`
     com headers de navegador (`User-Agent`, `Referer`/`Origin` = `https://blaze.bet.br/`).
4. Converte `created_at` UTC → `data`/`hora` em UTC-3 e faz `upsert` em `historico_blaze` com `onConflict: "blaze_id", ignoreDuplicates: true`, usando `supabaseAdmin` importado **dentro** do handler (`await import("@/integrations/supabase/client.server")`).

**Segredo a criar na nova conta:** `COLLECTOR_SECRET` (valor aleatório forte). Agendar chamadas (pg_cron/scheduler externo) para:
`https://project--<PROJECT_ID>.lovable.app/api/public/collect` com header `x-collector-secret`.

### `src/routes/api/public/recent.ts` (GET)

Proxy público de leitura das mesmas fontes da Blaze (sem escrita, sem segredo) para o front quando o realtime falha.

---

## 5. Rotas e telas

| Rota           | Arquivo                      | Conteúdo                                                                                                                                                                             |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`            | `src/routes/index.tsx`       | Landing "FREITAS DA BLAZE": imagem `freitas-king`, partículas animadas (18, posições/delays memoizados), transição de saída de 620 ms antes de `navigate()`, meta `noindex,nofollow` |
| `/app`         | `src/routes/app.tsx`         | **Histórico** (antigo Dashboard): grade de pedras, filtros, painel de 10 switches, estatísticas, celebração de branco                                                                |
| `/sinais`      | `src/routes/sinais.tsx`      | Roleta girando + últimos 20 resultados + `PredictiveSignals` ("PRÓXIMO BRANCO")                                                                                                      |
| `/estrategias` | `src/routes/estrategias.tsx` | Estratégias/validador de padrões                                                                                                                                                     |
| `__root.tsx`   | —                            | `HeadContent`, `Scripts`, QueryClientProvider, `<Toaster />` (sonner), 404 e ErrorComponent com `reportLovableError`                                                                 |

Abas removidas por decisão do dono: **Apostas** e **Feed**. Menu inferior da homepage foi retirado.

Cada rota tem `head()` próprio com `title`, `description`, `og:title`, `og:description`, `og:type`, `twitter:card`.

---

## 6. Componentes

`src/components/double/`

- `BlazeResultCard.tsx` — card 52×50 px, círculo 30 px com borda 3 px, grid de 20 por linha no desktop.
- `ResultCircle.tsx` — pedra individual; branco usa a imagem `branco-tile` (chama com dado) preservando o desenho original.
- `BlazeRoulette.tsx` — roleta girando estilo Blaze.
- `HistoryFilters.tsx` — filtros do histórico; clique numa pedra seleciona **todas** as correspondentes e o segundo clique remove.
- `LeftStatsDrawer.tsx` — hook `useFullStatsSpins`: busca paginada de até 20.000 rodadas desde 00:00 de Brasília + buffer de 1.500 registros; cores por hora, frequência, sequências e médias com `hoursElapsed` fracionário; refresh a cada 30 s.
- `PredictiveSignals.tsx` — gerador preditivo (seção 8).
- `WhiteCelebration.tsx` — fogos de artifício em canvas + ícone do branco grande com glow/float.
- `WhiteAlert.tsx`, `PatternNotifier.tsx`, `PatternValidator.tsx`, `SignalGenerator.tsx`, `StrategyTabs.tsx`, `ProgressBar.tsx`, `Card.tsx`, `Switch.tsx`, `types.ts`.

`src/components/sections/` — `AnaliseSection.tsx`, `SinaisSection.tsx`, `EstrategiasSection.tsx`.
`src/components/` — `AppSidebar.tsx`, `TopNav.tsx`.

`src/lib/` — `predictive.ts` (motor de análises), `useGatilhos.ts` (persistência + realtime), `utils.ts` (`cn`, `parseUtcDate`), `sectionStore.ts`, `signalsStore.ts`, `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`.

---

## 7. Regras de negócio — aba ANÁLISE

Motor em `src/lib/predictive.ts`. Constantes: `MAX_ZEROS = 14`, `MAX_CYCLES = 14`.

**Gatilhos (3 análises coexistindo na mesma tela, mesma identidade visual):**

1. **Análise 1 — minuto × pedra:** pedra `0..9` sorteada em minuto cuja unidade (`minuto % 10`) é igual à pedra.
2. **Análise 2 — pedras consecutivas iguais:** duas pedras iguais em sequência (`0..14`); o gatilho é a segunda.
3. **Análise 3 — repetição sequencial cruzada:** repetição consecutiva de `0..9` **e** unidade do minuto casando com a pedra.

**Minutos até o 0 (histórico de cada gatilho):**

- Busca cronológica **individualizada**: a partir do `trigger_at` daquele gatilho para frente, nunca reutilizando os zeros globais recentes.
- Para cada `0` encontrado: `gap = round((t_zero − t_gatilho)/60000)`, mínimo 0.
- Acumula até **14 ocorrências**; ao completar, gatilho vira `COMPLETO/ENCERRADO` e para de escutar. Se ainda não completou, continua escutando em tempo real.
- Backfill (`computeGapsFromHistory` em `useGatilhos.ts`) usa busca binária no histórico e marca `covered` — quando coberto, o cálculo local é a única fonte da verdade; lacunas não cobertas aparecem como `—`.
- Filtro unificado de pedras 0–14. Não há mais limite de 14 minutos: o limite é de **14 contagens**.

**Ranking Top 5 / assertividade:** janelas `M-1`, `M`, `M+1`; o score conta **presença única** por ciclo (um ciclo não pontua duas vezes na mesma janela). Percentual = ciclos com presença ÷ ciclos analisados.

**Detalhes dos Ciclos:** mapeamento completo dos 14 tempos sem interrupção, fila **FIFO 10** (banco + `localStorage`), sobrescrita quando o mesmo horário reaparece.

**Fuso horário:** todo timestamp passa por `parseUtcDate` (`src/lib/utils.ts`), que força sufixo `Z` quando o valor vem sem fuso — sem isso os gatilhos apareciam 3 h deslocados.

```ts
export function parseUtcDate(value: string | null | undefined): Date {
  const raw = (value ?? "").trim();
  if (!raw) return new Date(NaN);
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  return new Date(hasTz ? raw : `${raw.replace(" ", "T")}Z`);
}
```

**Persistência (`useGatilhos.ts`):** `MAX_GATILHOS = 10`, `BRAZIL_TZ = "America/Sao_Paulo"`; lê os 10 mais recentes por `(analise, pedra)` ordenados por `trigger_at desc`, insere pendentes com `ignoreDuplicates: true` e assina canal Realtime para refletir em todos os dispositivos.

---

## 8. Regras de negócio — aba SINAIS (`PredictiveSignals.tsx`)

- Lê 5.000 rodadas de `blaze_results` (mais recentes, invertidas para ordem cronológica).
- Ciclos "em aberto" = `gaps.length < 14` no ciclo mais recente de cada (análise, pedra).
- Botão **PRÓXIMO BRANCO** habilitado só quando há ciclo em aberto (pulsa em verde); senão "Aguardando novo gatilho…".
- **Modo 1 — Top 1:** posição central `M` do Top de cada análise ativa, `trigger_at + m` minutos; horários passados são descartados; horários iguais são **unificados** num único cartão ("Análise 3 + 7"), mantendo o maior percentual.
- **Modo 2 — Coincidência (alta assertividade):** `CANDIDATE_DEPTH = 10` candidatos por análise/pedra, `TOP5_DEPTH = 5` validador.
  Só publica o minuto se **(a)** houver ≥ 2 análises distintas projetando o mesmo minuto **e** **(b)** o minuto estiver no Top 5 de pelo menos uma delas, com média ≥ `MIN_ASSERTIVIDADE = 30`%.
- **Desduplicação absoluta:** horários já usados no Modo 1 (`usedTimes`) nunca reaparecem no Modo 2, e cada minuto aparece uma única vez.
- Badges mostram a confluência (`A1·7`, `A2·7`…) destacando quem é Top 5.

---

## 9. Aba HISTÓRICO (`/app`)

- Largura ampliada até **1720 px** (aproveita as laterais).
- Painel superior com **10 switches**: Tempo real, Numerado, Destaque horário, Colunas fixas, Contar colunas, Exibir segundos, Criação, Contar linhas, Sentido inverso, Surf.
- **Contar colunas** exibe barra tri-colorida + percentual de vermelho/preto/branco por coluna (`colStats` em `useMemo`).
- Painel de status consolidado: timer, distribuição de cores com barras e frequência de brancos.
- **Alerta de branco inicia DESLIGADO**; ao alternar mostra toast animado; ao sair branco com alerta ligado roda `WhiteCelebration` por ~8 s.
- Bloco "gerar sinal" removido do histórico; os controles restantes ficam minimizados por padrão.
- **Responsivo estilo `double.valeudemais.com.br`:** nunca vira card no celular — mantém tabela com rolagem horizontal suave (`.history-scroll`), colunas preservadas; em telas < 1024 px inicia em modo **lista**, sentido normal (não colunas fixas).

---

## 10. Design system

`src/styles.css` — Tailwind v4, tema escuro premium (não preto puro), tokens em oklch:

```css
--radius: 1rem;
--background: oklch(0.165 0.012 260);
--foreground: oklch(0.985 0.003 260);
--surface: oklch(0.205 0.014 260);
--surface-2: oklch(0.235 0.016 260);
--surface-3: oklch(0.275 0.018 260);
--card: oklch(0.21 0.014 260);
--primary: oklch(0.74 0.16 245);
--destructive: oklch(0.62 0.23 25);
--border: oklch(1 0 0 / 0.06);
--red: oklch(0.63 0.235 25);          /* pedra vermelha */
--black-tile / --white-tile / --positive
```

Fonte: **Inter Variable** via `@fontsource-variable/inter` (importada em `styles.css`, nunca por URL remota). Tokens extras expostos no `@theme inline` como `--color-red`, `--color-black-tile`, `--color-white-tile`, `--color-surface*`.
Regra: **nunca** hardcodar `text-white`/`bg-black`/`bg-[#...]` — usar tokens.

---

## 11. Assets (recriar na nova conta)

| Arquivo                       | Uso                                        |
| ----------------------------- | ------------------------------------------ |
| `src/assets/branco-tile.png`  | ícone do branco em todo o site e histórico |
| `src/assets/branco-vip.png`   | branco em destaque/celebração              |
| `src/assets/freitas-king.png` | herói da landing                           |
| `src/assets/freitas-logo.jpg` | logo/ícone redondo                         |

Neste projeto eles são referenciados via `*.asset.json` (assets externalizados da Lovable). Ao replicar, faça upload das mesmas 4 imagens e importe normalmente (`import img from "@/assets/branco-tile.png"`).

---

## 12. Checklist de replicação (ordem exata)

1. Criar projeto Lovable novo com stack TanStack Start.
2. **Ativar Lovable Cloud** (gera `.env` e `src/integrations/supabase/*`).
3. Rodar a migração da seção 3 (tabelas, GRANTs, RLS, trigger FIFO, realtime).
4. Criar o segredo **`COLLECTOR_SECRET`**.
5. Criar `src/integrations/supabase/blaze-client.ts` exatamente como na seção 2.1 (URL + chave publicável da base externa).
6. Subir os 4 assets da seção 11.
7. Copiar `src/styles.css` (tokens da seção 10) e `components.json`.
8. Criar as rotas: `__root.tsx`, `index.tsx`, `app.tsx`, `sinais.tsx`, `estrategias.tsx`, `api/public/collect.ts`, `api/public/recent.ts`.
9. Copiar `src/lib/*` (com `predictive.ts`, `useGatilhos.ts`, `parseUtcDate`) e `src/components/{double,sections}/*`.
10. Instalar dependências da seção 1 (`framer-motion`, `recharts`, `sonner`, `date-fns`, `@fontsource-variable/inter`, `tw-animate-css`, `@supabase/supabase-js`).
11. Publicar e agendar o coletor apontando para `/api/public/collect` com o header do segredo.
12. Validar: histórico carregando, gatilhos com horário de Brasília correto, botão PRÓXIMO BRANCO ativando com ciclo aberto, celebração de branco, responsivo em celular/tablet.

## 13. Armadilhas conhecidas (não repetir)

- Chaves `sb_publishable_` não são JWT: remover `Authorization: Bearer` e enviar só `apikey`, senão dá `Expected 3 parts in JWT; got 1`.
- Timestamps sem fuso ⇒ sempre `parseUtcDate`, nunca `new Date(raw)` direto (erro de 3 h).
- Gatilhos antigos **não** podem herdar os zeros globais recentes.
- Policies `using (true)` para escrita são proibidas; INSERT sempre com `with check` validado.
- `supabaseAdmin` só dentro do handler, após validar o segredo.
- Estatísticas do dia devem cortar em 00:00 de Brasília, não em UTC.
- Não recriar `src/App.tsx`, `src/pages/`, nem instalar `react-router-dom`.
