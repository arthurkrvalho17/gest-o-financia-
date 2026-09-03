-- =====================================================================
-- SPEDY — emissão de NF-e por venda (ADR-17)
-- Financia+ é a empresa OWNER na Spedy; cada loja é uma sub-empresa
-- provisionada por POST /v1/companies (nenhuma loja cria conta própria).
-- Emissão é via POST /v1/product-invoices (modo completo — CFOP/CST variam
-- por operação de veículo usado, não dá para fixar tributação única).
-- Rode depois das migrations 0000–0017.
-- =====================================================================

-- Campos fiscais que POST /v1/companies exige e a tabela lojas ainda não
-- tinha (endereço básico já existia desde a 0013).
alter table lojas
  add column if not exists numero            text,  -- número do endereço
  add column if not exists cidade_ibge        text,  -- código IBGE do município
  add column if not exists inscricao_estadual text,
  add column if not exists regime_tributario  text,  -- simplesNacional | simplesNacionalMEI | simplesNacionalExcessoSublimite | regimeNormal
  add column if not exists cnae_principal     text;  -- ex.: 4511-1/02

-- Spedy entra no catálogo de canais (credencial por loja em canal_credencial:
-- { company_id, api_key } da sub-empresa criada pela Spedy).
insert into canal (chave, nome, tipo) values
  ('spedy', 'Spedy (emissão de NF-e)', 'fiscal')
on conflict (chave) do nothing;

-- NF-e emitida por venda — 1:1 com vendas; Spedy é a fonte da verdade do status.
create table if not exists nota_fiscal (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  venda_id uuid not null references vendas(id) on delete cascade,
  veiculo_id uuid references veiculos(id) on delete set null,
  spedy_invoice_id uuid,             -- id da nota em POST /v1/product-invoices
  integration_id text not null,      -- = venda_id::text (idempotência do lado da Spedy)
  status text not null default 'created'
    check (status in (
      'created', 'enqueued', 'received', 'authorized', 'inContingent',
      'rejected', 'canceled', 'denied', 'disabled', 'removed'
    )),
  number text,
  access_key text,
  protocolo text,
  processing_status text,            -- processing | success | failed
  processing_message text,
  processing_code text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique (venda_id)
);

create index if not exists idx_nf_loja on nota_fiscal(loja_id);
create index if not exists idx_nf_venda on nota_fiscal(venda_id);

alter table nota_fiscal enable row level security;
drop policy if exists "notas fiscais da minha loja" on nota_fiscal;
create policy "notas fiscais da minha loja" on nota_fiscal
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());
