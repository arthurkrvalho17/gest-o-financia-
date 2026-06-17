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
