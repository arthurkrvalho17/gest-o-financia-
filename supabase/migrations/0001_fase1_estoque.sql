-- =====================================================================
-- FASE 1 — Estoque (veiculos + vendas)
-- Rode no Supabase → SQL Editor depois da migration 0000.
-- =====================================================================

create table if not exists veiculos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  codigo text,
  modelo text not null,
  fab_mod text,
  cor text,
  placa text,
  tipo text default 'proprio',      -- proprio | consignado
  entrada date default now(),
  saida date,
  situacao text default 'estoque',  -- estoque | reservado | vendido | repasse
  compra numeric default 0,
  pedido numeric default 0,         -- valor anunciado
  minimo numeric default 0,
  marcador_texto text,
  marcador_cor text,
  criado_em timestamptz default now()
);

create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid not null references veiculos(id),
  valor_venda numeric not null,
  data_venda date not null,
  comprador_nome text,
  comprador_cpf text,
  forma_pagamento text,             -- avista | financiamento | consorcio
  vendedor_id uuid references usuarios(id),
  criado_em timestamptz default now()
);

create index if not exists idx_veiculos_loja on veiculos(loja_id);
create index if not exists idx_vendas_loja on vendas(loja_id);
create index if not exists idx_vendas_veiculo on vendas(veiculo_id);

-- ---------------------------------------------------------------------
-- RLS: cada loja só enxerga/edita os próprios registros.
-- Uma policy "for all" cobre SELECT, INSERT, UPDATE e DELETE.
-- ---------------------------------------------------------------------
alter table veiculos enable row level security;
alter table vendas enable row level security;

drop policy if exists "veiculos da minha loja" on veiculos;
create policy "veiculos da minha loja" on veiculos
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());

drop policy if exists "vendas da minha loja" on vendas;
create policy "vendas da minha loja" on vendas
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());
