-- =====================================================================
-- FASE 2 — Preparação (gastos por carro)
-- Rode no Supabase → SQL Editor depois das migrations 0000 e 0001.
-- =====================================================================

create table if not exists preparacao_gastos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  descricao text,
  data date,
  forma_pgto text,                  -- pix | dinheiro | cartao | boleto | transferencia
  valor numeric default 0,
  status text default 'pendente',   -- pago | pendente
  observacoes text,
  criado_em timestamptz default now()
);

create index if not exists idx_prep_loja on preparacao_gastos(loja_id);
create index if not exists idx_prep_veiculo on preparacao_gastos(veiculo_id);

alter table preparacao_gastos enable row level security;

drop policy if exists "preparacao da minha loja" on preparacao_gastos;
create policy "preparacao da minha loja" on preparacao_gastos
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());
