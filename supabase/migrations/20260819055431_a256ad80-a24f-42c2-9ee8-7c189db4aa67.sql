grant select on public.historico_blaze to anon;
grant select on public.gatilhos_analise to anon;
grant select on public.historico_sinais_audit to anon;

alter table public.historico_blaze enable row level security;
alter table public.gatilhos_analise enable row level security;
alter table public.historico_sinais_audit enable row level security;

-- historico_blaze
drop policy if exists "historico publico para leitura" on public.historico_blaze;
create policy "Public read historical blaze"
on public.historico_blaze
for select
to public
using (true);

-- gatilhos_analise
drop policy if exists "gatilhos leitura publica" on public.gatilhos_analise;
drop policy if exists "gatilhos insercao validada" on public.gatilhos_analise;
create policy "Public read gatilhos analise"
on public.gatilhos_analise
for select
to public
using (true);

-- historico_sinais_audit
drop policy if exists "Public audit select" on public.historico_sinais_audit;
drop policy if exists "Strict audit insert" on public.historico_sinais_audit;
create policy "Public read audit history"
on public.historico_sinais_audit
for select
to public
using (true);
