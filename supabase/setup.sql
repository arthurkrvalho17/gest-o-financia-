-- =====================================================================
-- FINANCIA+ GESTÃO — setup completo do banco (Fases 0 a 5 + ajustes)
-- Cole este arquivo inteiro no Supabase → SQL Editor → Run.
-- Gerado a partir de supabase/migrations/ (na ordem).
-- =====================================================================


-- >>>>> 0000_fase0_fundacao.sql >>>>>

-- =====================================================================
-- FASE 0 — Fundação (multi-loja + login + RLS)
-- Cole este arquivo inteiro no Supabase → SQL Editor → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela de lojas (tenants)
-- ---------------------------------------------------------------------
create table if not exists lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  criado_em timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Usuários vinculados a uma loja (id = id do auth.users)
-- ---------------------------------------------------------------------
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text,
  email text,
  papel text default 'dono'  -- dono | vendedor
);

-- ---------------------------------------------------------------------
-- Função auxiliar: qual loja o usuário logado pertence.
-- security definer => roda com privilégios do dono, ignorando RLS,
-- para poder ler a linha do próprio usuário sem recursão de policy.
-- ---------------------------------------------------------------------
create or replace function loja_do_usuario()
returns uuid language sql stable security definer
set search_path = public as $$
  select loja_id from usuarios where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Cadastro: ao criar um auth.users, cria a loja e vincula o usuário.
-- O nome da loja e do dono vêm do metadata enviado no signUp.
-- security definer => roda como dono, contornando RLS na criação.
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  nova_loja_id uuid;
begin
  insert into lojas (nome, cnpj)
  values (
    coalesce(nullif(new.raw_user_meta_data->>'nome_loja', ''), 'Minha loja'),
    nullif(new.raw_user_meta_data->>'cnpj', '')
  )
  returning id into nova_loja_id;

  insert into usuarios (id, loja_id, nome, email, papel)
  values (
    new.id,
    nova_loja_id,
    nullif(new.raw_user_meta_data->>'nome', ''),
    new.email,
    'dono'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- Liga RLS
-- ---------------------------------------------------------------------
alter table lojas enable row level security;
alter table usuarios enable row level security;

-- ---------------------------------------------------------------------
-- Políticas: cada um só vê / edita a própria loja.
-- (drop antes de criar para o script poder ser rodado de novo)
-- ---------------------------------------------------------------------
drop policy if exists "ver minha loja" on lojas;
create policy "ver minha loja" on lojas
  for select using (id = loja_do_usuario());

drop policy if exists "editar minha loja" on lojas;
create policy "editar minha loja" on lojas
  for update using (id = loja_do_usuario())
  with check (id = loja_do_usuario());

drop policy if exists "ver usuarios da minha loja" on usuarios;
create policy "ver usuarios da minha loja" on usuarios
  for select using (loja_id = loja_do_usuario());

drop policy if exists "editar usuarios da minha loja" on usuarios;
create policy "editar usuarios da minha loja" on usuarios
  for update using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());


-- >>>>> 0001_fase1_estoque.sql >>>>>

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


-- >>>>> 0002_fase2_preparacao.sql >>>>>

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


-- >>>>> 0003_fase3_financeiro.sql >>>>>

-- =====================================================================
-- FASE 3 — Financeiro (despesas fixas e outras)
-- A preparação NÃO entra aqui: vem de preparacao_gastos (Fase 2). O
-- Financeiro só consolida. Rode depois das migrations 0000–0002.
-- =====================================================================

create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  categoria text not null,          -- fixa | outra
  mes_ref date not null,            -- 1o dia do mês de referência (ex: 2026-06-01)
  descricao text,
  vencimento text,
  valor numeric default 0,
  status text default 'pendente',   -- pago | pendente
  data_pgto text,
  observacoes text,
  lembrete_ativo boolean default false,
  lembrete_dia int,
  lembrete_hora text,
  criado_em timestamptz default now()
);

create index if not exists idx_despesas_loja on despesas(loja_id);
create index if not exists idx_despesas_mes on despesas(mes_ref);

alter table despesas enable row level security;

drop policy if exists "despesas da minha loja" on despesas;
create policy "despesas da minha loja" on despesas
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());


-- >>>>> 0004_fase4_crm.sql >>>>>

-- =====================================================================
-- FASE 4 — CRM (leads / funil de negociações)
-- Rode depois das migrations 0000–0003.
-- =====================================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  nome text,
  telefone text,
  origem text,                      -- whatsapp | portal | indicacao | balcao
  etapa text default 'novo',        -- novo | contato | proposta | fechado | perdido
  veiculo_id uuid references veiculos(id),
  criado_em timestamptz default now()
);

create index if not exists idx_leads_loja on leads(loja_id);

alter table leads enable row level security;

drop policy if exists "leads da minha loja" on leads;
create policy "leads da minha loja" on leads
  for all
  using (loja_id = loja_do_usuario())
  with check (loja_id = loja_do_usuario());


-- >>>>> 0005_fase5_contratos.sql >>>>>

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


-- >>>>> 0006_ajustes.sql >>>>>

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

