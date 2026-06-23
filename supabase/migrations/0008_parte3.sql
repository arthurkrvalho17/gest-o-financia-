-- =====================================================================
-- PARTE 3 — dados complementares do veículo, ficha de documentos,
-- assinatura eletrônica e config de plano. Rode depois de 0000–0007.
-- =====================================================================

-- Veículo: dados que antes eram digitados no contrato passam a vir do cadastro
alter table veiculos add column if not exists chassi text;
alter table veiculos add column if not exists km integer;
alter table veiculos add column if not exists combustivel text;

-- Ficha de documentos por carro (arquivos no Supabase Storage; aqui os metadados)
create table if not exists veiculo_documento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  tipo text not null,                -- atpv_e | crlv_e | crv | compra_venda | recibo_sinal | procuracao | cnh_comprador | comprovante_pgto | outro
  nome_arquivo text,
  arquivo_url text,
  status text default 'anexado',     -- anexado | assinado | pendente
  data date default now(),
  criado_em timestamptz default now()
);
create index if not exists idx_vdoc_veiculo on veiculo_documento(veiculo_id);

alter table veiculo_documento enable row level security;
drop policy if exists "documentos do carro da minha loja" on veiculo_documento;
create policy "documentos do carro da minha loja" on veiculo_documento
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());

-- Assinatura eletrônica de documentos (plataforma externa: ZapSign/ClickSign/etc.)
-- Guardamos sempre o PDF lacrado E a trilha de auditoria — é a auditoria que segura
-- numa disputa. Assinatura AVANÇADA (Lei 14.063/2020); ATPV-e é fluxo separado do gov.
alter table documentos add column if not exists assinatura_status text;     -- nao_enviado | aguardando | assinado
alter table documentos add column if not exists assinatura_id_externo text;
alter table documentos add column if not exists url_pdf_assinado text;
alter table documentos add column if not exists url_auditoria text;
alter table documentos add column if not exists signatarios jsonb;
alter table documentos add column if not exists nivel_assinatura text default 'avancada'; -- avancada | qualificada

-- Plano / assinatura SaaS da loja (integra com provedor de cobrança, ex.: Asaas)
create table if not exists loja_plano (
  loja_id uuid primary key references lojas(id) on delete cascade,
  plano text default 'gestao',
  valor_mensal numeric default 0,
  proxima_cobranca date,
  forma_pagamento text,
  complemento_ia boolean default false,        -- IA de pré-venda (WhatsApp)
  complemento_multicanal boolean default false,-- Publicação multicanal
  complemento_nf boolean default false,        -- Nota Fiscal
  atualizado_em timestamptz default now()
);

alter table loja_plano enable row level security;
drop policy if exists "plano da minha loja" on loja_plano;
create policy "plano da minha loja" on loja_plano
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());
