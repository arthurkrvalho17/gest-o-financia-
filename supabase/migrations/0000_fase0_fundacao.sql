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
