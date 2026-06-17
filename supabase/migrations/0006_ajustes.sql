-- =====================================================================
-- AJUSTES — fotos, descrição, observação de venda, modelos de documento
-- Rode depois das migrations 0000–0005.
-- =====================================================================

-- Veículos: descrição do anúncio + RENAVAM
alter table veiculos add column if not exists descricao text;
alter table veiculos add column if not exists renavam text;

-- Vendas: observação livre (vendedor_id já existe na 0001)
alter table vendas add column if not exists observacao text;

-- Fotos do veículo (Supabase Storage guarda o arquivo; aqui ficam os metadados)
create table if not exists veiculo_fotos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  url text,
  ordem int default 0,
  criado_em timestamptz default now()
);
create index if not exists idx_fotos_veiculo on veiculo_fotos(veiculo_id);

alter table veiculo_fotos enable row level security;
drop policy if exists "fotos da minha loja" on veiculo_fotos;
create policy "fotos da minha loja" on veiculo_fotos
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());

-- Modelos de documento do lojista (um por tipo)
create table if not exists modelos_documento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  tipo text not null,
  arquivo_url text,
  mapeamento_campos jsonb,
  criado_em timestamptz default now(),
  unique (loja_id, tipo)
);

alter table modelos_documento enable row level security;
drop policy if exists "modelos da minha loja" on modelos_documento;
create policy "modelos da minha loja" on modelos_documento
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());

-- ---------------------------------------------------------------------
-- Permissões dono × funcionário no nível do banco (defesa em profundidade).
-- O funcionário não pode ver compra/minimo nem lucro. Como RLS é por linha,
-- a proteção de COLUNA é feita por uma VIEW que expõe só o permitido.
-- O front deve consultar "veiculos_funcionario" quando papel = 'funcionario'.
-- (Implementação completa de roles no banco fica para quando o Supabase
--  estiver conectado; esta view já deixa o caminho pronto.)
-- ---------------------------------------------------------------------
create or replace view veiculos_funcionario
with (security_invoker = true) as
  select id, loja_id, codigo, modelo, fab_mod, cor, placa, tipo,
         entrada, saida, situacao, pedido, descricao, renavam,
         marcador_texto, marcador_cor, criado_em
  from veiculos;
