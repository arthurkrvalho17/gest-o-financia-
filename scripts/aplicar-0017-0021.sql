-- Consolidado 0017..0021 — gerado em 2026-08-26
-- Cole TUDO numa aba LIMPA do SQL Editor e rode uma vez.
-- Todas as migrations sao idempotentes: rodar de novo nao quebra.

-- ============ 0017_renave.sql ============
insert into canal (chave, nome, tipo) values
  ('renave', 'RENAVE (Renave Fácil)', 'estoque_legal')
on conflict (chave) do nothing;
create table if not exists renave_registro (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  evento text not null check (evento in ('entrada', 'saida', 'consignacao')),
  status text not null default 'pendente'
    check (status in ('pendente', 'registrado', 'erro', 'cancelado')),
  protocolo text,                    -- protocolo/id devolvido pela integradora
  atpv_e_url text,                   -- ATPV-e emitida no fluxo (revisão do ADR-11)
  dados jsonb,                       -- resposta bruta da integradora (auditoria)
  mensagem_erro text,
  registrado_em timestamptz,         -- quando o RENAVE confirmou o registro
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique (veiculo_id, evento)
);
create table if not exists renave_job (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid references veiculos(id) on delete cascade,
  acao text not null check (acao in
    ('registrar_entrada', 'registrar_saida', 'registrar_consignacao',
     'consultar_status', 'cancelar')),
  payload jsonb,
  status text not null default 'na_fila'
    check (status in ('na_fila', 'processando', 'concluido', 'erro')),
  tentativas int default 0,
  proximo_retry timestamptz,
  criado_em timestamptz default now()
);
create index if not exists idx_renave_reg_veiculo on renave_registro(veiculo_id);
create index if not exists idx_renave_reg_loja on renave_registro(loja_id);
create index if not exists idx_renave_job_fila on renave_job(status) where status = 'na_fila';
create index if not exists idx_renave_job_loja on renave_job(loja_id);
do $$
declare t text;
begin
  foreach t in array array['renave_registro', 'renave_job'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || ' da minha loja', t);
    execute format(
      'create policy %I on %I for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());',
      t || ' da minha loja', t
    );
  end loop;
end $$;

-- ============ 0018_spedy_nfe.sql ============
alter table lojas
  add column if not exists numero            text,  -- número do endereço
  add column if not exists cidade_ibge        text,  -- código IBGE do município
  add column if not exists inscricao_estadual text,
  add column if not exists regime_tributario  text,  -- simplesNacional | simplesNacionalMEI | simplesNacionalExcessoSublimite | regimeNormal
  add column if not exists cnae_principal     text;  -- ex.: 4511-1/02
insert into canal (chave, nome, tipo) values
  ('spedy', 'Spedy (emissão de NF-e)', 'fiscal')
on conflict (chave) do nothing;
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

-- ============ 0019_spedy_config_fiscal.sql ============
alter table loja_config
  add column if not exists config_fiscal jsonb;

-- ============ 0020_olx_publicacao_processando.sql ============
alter table anuncio_publicacao
  add column if not exists token_importacao text;
comment on column anuncio_publicacao.token_importacao is
  'Token devolvido pelo import da OLX (expira em 7 dias) — usado por consultarStatus para confirmar a moderação assíncrona.';
comment on column anuncio_publicacao.status is
  'pendente | processando (enviado, moderação assíncrona em curso) | publicado | erro | despublicado';

-- ============ 0021_oauth_state.sql ============
create table if not exists oauth_state (
  nonce text primary key,
  loja_id uuid not null references lojas(id) on delete cascade,
  canal text not null references canal(chave),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);
alter table oauth_state enable row level security;
drop policy if exists "oauth_state da minha loja" on oauth_state;
create policy "oauth_state da minha loja" on oauth_state
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());

notify pgrst, 'reload schema';
