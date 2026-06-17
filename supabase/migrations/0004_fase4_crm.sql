-- =====================================================================
-- FASE 4 — CRM (leads / funil de negociações)
-- Rode depois das migrations 0000–0003.
-- =====================================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text,
  telefone text,
  origem text,                      -- whatsapp | portal | indicacao | balcao
  etapa text default 'novo',        -- novo | contato | proposta | fechado | perdido
  veiculo_id uuid references veiculos(id),
  criado_em timestamptz default now()
);

create index if not exists idx_leads_loja on leads(loja_id);

alter table leads enable row level security;

drop policy if exists "leads da minha loja" on leads;
create policy "leads da minha loja" on leads
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());
