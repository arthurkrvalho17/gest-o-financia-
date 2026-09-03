-- =====================================================================
-- EVENTOS DE INTEGRAÇÃO — notificações de webhook (ML e futuros canais)
-- Guarda o evento bruto ANTES de processar: se o processamento falhar,
-- nada se perde e dá pra reprocessar. Rode depois de 0000–0014.
-- =====================================================================

create table if not exists integracao_evento (
  id uuid primary key default gen_random_uuid(),
  canal text not null references canal(chave),
  topico text,                       -- items | vis_leads | messages | ...
  resource text,                     -- ex: /items/MLB123 ou /vis/leads/abc
  usuario_externo text,              -- user_id do canal (ex: ml_user_id)
  loja_id uuid references lojas(id) on delete set null, -- resolvida no processamento
  payload jsonb,                     -- notificação bruta
  processado boolean default false,
  erro_processamento text,
  criado_em timestamptz default now()
);

create index if not exists idx_intev_processado on integracao_evento(processado) where not processado;
create index if not exists idx_intev_loja on integracao_evento(loja_id);

-- Só o service role (Edge Functions) escreve/lê; o dono da loja pode ver os seus.
alter table integracao_evento enable row level security;
drop policy if exists "eventos da minha loja" on integracao_evento;
create policy "eventos da minha loja" on integracao_evento
  for select using (loja_id = loja_do_usuario());
