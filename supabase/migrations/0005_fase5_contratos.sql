-- =====================================================================
-- FASE 5 — Contratos e recibos (config da loja + documentos gerados)
-- Rode depois das migrations 0000–0004.
-- =====================================================================

create table if not exists loja_config (
  loja_id uuid primary key references lojas(id) on delete cascade,
  assinatura_nome text,             -- nome que assina os documentos
  assinatura_cnpj text,
  logo_url text
);

create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  tipo text not null,               -- compra_venda | recibo_sinal | consignacao | test_drive | procuracao | nota_entrada
  veiculo_id uuid references veiculos(id),
  cliente_nome text,
  cliente_cpf text,
  dados jsonb,                      -- campos específicos do modelo
  pdf_url text,
  criado_em timestamptz default now()
);

create index if not exists idx_documentos_loja on documentos(loja_id);

alter table loja_config enable row level security;
alter table documentos enable row level security;

drop policy if exists "config da minha loja" on loja_config;
create policy "config da minha loja" on loja_config
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());

drop policy if exists "documentos da minha loja" on documentos;
create policy "documentos da minha loja" on documentos
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());
