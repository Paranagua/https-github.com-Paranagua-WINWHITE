create table if not exists public.historico_sinais_audit (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone default now(),
    analise text not null,
    tipo_sinal text not null, -- 'Top 1 Isolado' ou 'Confluência'
    nivel text not null, -- Top 1, Bronze, Prata, Ouro, Diamante, Platina, Supremo
    alta_tendencia boolean default false,
    predicao_horario text not null,
    status text not null default 'PENDENTE', -- 'PENDENTE', 'WIN_DIRETO', 'WIN_VIZINHO', 'LOSS'
    minuto_alvo timestamp with time zone not null
);

grant select, insert, update on public.historico_sinais_audit to authenticated;
grant all on public.historico_sinais_audit to service_role;

alter table public.historico_sinais_audit enable row level security;

create policy "Authenticated users can see all audit logs"
on public.historico_sinais_audit for select
to authenticated
using (true);

create policy "Authenticated users can insert audit logs"
on public.historico_sinais_audit for insert
to authenticated
with check (true);
