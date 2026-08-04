-- =====================================================================
-- OAuth state com nonce persistido (OLX e futuros canais com redirect)
--
-- Antes o `state` era base64(JSON({loja_id})) SEM assinatura: qualquer um
-- podia forjar um state com o loja_id de outro tenant e, completando o
-- fluxo OAuth com a própria conta OLX, vincular a conta dele à loja da
-- vítima. Agora o front gera um nonce aleatório, grava aqui (RLS garante
-- que só grava para a PRÓPRIA loja) e envia o nonce como state; o
-- callback (service role) resolve nonce -> loja_id, exige expira_em no
-- futuro e apaga o registro (uso único). Expiração: 10 min — a mesma
-- janela do authorization code da OLX.
-- =====================================================================

create table if not exists oauth_state (
  nonce text primary key,
  loja_id uuid not null references lojas(id) on delete cascade,
  canal text not null references canal(chave),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

alter table oauth_state enable row level security;

-- O usuário logado cria/enxerga apenas states da própria loja; o callback
-- usa service role (bypassa RLS) para resolver e apagar o nonce.
drop policy if exists "oauth_state da minha loja" on oauth_state;
create policy "oauth_state da minha loja" on oauth_state
  for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());
