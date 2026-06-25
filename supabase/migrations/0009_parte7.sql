-- =====================================================================
-- PARTE 7 — Contratos: modelos editáveis da loja
-- O modelo PADRÃO é do sistema (não por loja). Aqui ficam só as versões da
-- loja (editado/enviado). O histórico de documentos usa a tabela "documentos"
-- (já tem assinatura_status na 0008). Rode depois de 0000–0008.
-- =====================================================================

create table if not exists contrato_modelo (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  tipo text not null,                -- compra_venda | recibo_sinal | consignacao | test_drive | procuracao
  origem text default 'padrao',      -- padrao | editado | enviado
  conteudo text,                     -- texto do modelo editado (com {{placeholders}})
  arquivo_url text,                  -- modelo enviado (Word/PDF no Storage)
  atualizado_em timestamptz default now(),
  unique (loja_id, tipo)
);

alter table contrato_modelo enable row level security;
drop policy if exists "modelos da minha loja" on contrato_modelo;
create policy "modelos da minha loja" on contrato_modelo
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());
