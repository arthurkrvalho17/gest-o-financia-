-- =====================================================================
-- RENAVE — estoque legal (ADR-16, Resolução CONTRAN nº 1.026/2026)
-- Registro eletrônico de entrada, saída e consignação via integradora
-- (Renave Fácil sobre o Renave-WS/SERPRO). Mesmo padrão da publicação
-- multicanal: estado por veículo×evento + fila de jobs, tudo sob RLS.
-- A credencial da integradora (e-CNPJ é DA LOJA) vive em canal_credencial.
-- Rode depois das migrations 0000–0016.
-- =====================================================================

-- RENAVE entra no catálogo de canais (credencial por loja em canal_credencial)
insert into canal (chave, nome, tipo) values
  ('renave', 'RENAVE (Renave Fácil)', 'estoque_legal')
on conflict (chave) do nothing;

-- Estado do registro legal de um veículo no RENAVE (1 por veículo × evento)
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

-- Fila de jobs RENAVE (cada tentativa; processada por Edge Function)
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

-- RLS — isolamento por loja (mesmo bloco-padrão da 0007)
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
