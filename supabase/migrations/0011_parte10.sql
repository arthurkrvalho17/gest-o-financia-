-- =====================================================================
-- PARTE 10 — CRM: origem da venda, distribuição de leads por canal
-- Rode depois de 0000–0010.
-- =====================================================================

-- Origem do lead na venda (de onde veio): tráfego pago, ML, OLX, Webmotors, etc.
alter table vendas add column if not exists origem_lead text;

-- Lead: canal de origem + vendedor responsável (etapa = coluna do funil)
alter table leads add column if not exists canal_origem text;
alter table leads add column if not exists vendedor_id uuid references usuarios(id);
-- (a coluna "origem" da 0004 continua válida; canal_origem é o nome canônico)

-- Regra de distribuição automática de leads por canal → vendedor(es)
create table if not exists regra_distribuicao (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  canal text not null,               -- traf_pago | mercado_livre | olx | webmotors | instagram | whatsapp
  tipo text not null default 'fixo', -- fixo | rodizio
  vendedores jsonb,                  -- [usuario_id, ...]
  unique (loja_id, canal)
);

alter table regra_distribuicao enable row level security;
drop policy if exists "regras da minha loja" on regra_distribuicao;
create policy "regras da minha loja" on regra_distribuicao
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());
