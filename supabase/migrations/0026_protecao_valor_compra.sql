-- =====================================================================
-- PROTEÇÃO DE COLUNA NO BANCO — valor de compra só para o dono (regra 6.5)
--
-- README §6 (regra 6.5): funcionário vê Mínimo e Venda; NÃO vê Compra nem
-- Lucro (lucro nunca é coluna — sempre calculado). Até aqui essa regra só
-- existia no React (`{ehDono && ...}`): todo `select('*')` em `veiculos`
-- trazia `compra` pro browser do funcionário também — só não aparecia na
-- tela. Regra de negócio nº5 do README é explícita: "esconder no React
-- não basta — a proteção também precisa existir no banco".
--
-- Por que não é um REVOKE de coluna: RLS é avaliado por LINHA/SESSÃO;
-- GRANT/REVOKE do Postgres é fixo por ROLE. No Supabase, dono e
-- funcionário são o MESMO role do Postgres (`authenticated`) — um REVOKE
-- SELECT (compra) bloquearia os dois igual, não só o funcionário. Não tem
-- como diferenciar por papel usando só GRANT/REVOKE aqui.
--
-- A forma que realmente funciona: tirar `compra` de `veiculos` e colocar
-- numa tabela própria, protegida por RLS que exige loja E papel = 'dono'
-- — RLS sim é condicional por sessão, então dono e funcionário da MESMA
-- loja recebem resultados diferentes na mesma query.
-- =====================================================================

create table if not exists veiculo_valor_compra (
  veiculo_id uuid primary key references veiculos(id) on delete cascade,
  loja_id uuid not null,
  compra numeric not null default 0,
  atualizado_em timestamptz default now(),
  -- FK composta (mesmo padrão da 0022): garante que loja_id aqui bate com
  -- o loja_id do veículo — impossível pendurar um valor de compra na loja
  -- errada.
  foreign key (veiculo_id, loja_id) references veiculos(id, loja_id)
);

-- Migra o dado existente antes de derrubar a coluna — sem isso, o valor
-- de compra de todo veículo já cadastrado seria perdido.
insert into veiculo_valor_compra (veiculo_id, loja_id, compra)
select id, loja_id, coalesce(compra, 0) from veiculos
on conflict (veiculo_id) do nothing;

alter table veiculos drop column if exists compra;

alter table veiculo_valor_compra enable row level security;

-- Helper reutilizável, mesmo padrão de loja_do_usuario() (security definer
-- + search_path fixo — evita o risco clássico de SECURITY DEFINER).
create or replace function usuario_e_dono()
returns boolean language sql stable security definer
set search_path = public as $$
  select papel = 'dono' from usuarios where id = auth.uid()
$$;

drop policy if exists "compra só do dono da loja" on veiculo_valor_compra;
create policy "compra só do dono da loja" on veiculo_valor_compra
  for all
  using (loja_id = loja_do_usuario() and usuario_e_dono())
  with check (loja_id = loja_do_usuario() and usuario_e_dono());

-- Índice para o join loja_id -> veiculo_id no front (anexarCompra faz um
-- select sem filtro de veiculo_id; RLS já restringe à loja e ao dono).
create index if not exists idx_valor_compra_loja on veiculo_valor_compra(loja_id);

notify pgrst, 'reload schema';
