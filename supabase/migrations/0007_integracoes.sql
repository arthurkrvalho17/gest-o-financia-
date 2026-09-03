-- =====================================================================
-- INTEGRAÇÕES — publicação multicanal (Parte A) + mensageria/WhatsApp (Parte B)
-- Princípio: credenciais são DA LOJA; o FINANCIA+ orquestra. Tudo por loja_id,
-- sob RLS, com tokens/segredos criptografados (use Vault/pgcrypto na produção).
-- Rode depois das migrations 0000–0006.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE A — Publicação multicanal
-- ---------------------------------------------------------------------

-- Catálogo de canais disponíveis (global, não por loja)
create table if not exists canal (
  chave text primary key,            -- mercado_livre | olx | webmotors | instagram | agregador
  nome text not null,
  tipo text not null default 'anuncio',  -- anuncio | mensageria
  ativo boolean default true
);

insert into canal (chave, nome, tipo) values
  ('mercado_livre', 'Mercado Livre', 'anuncio'),
  ('olx',           'OLX',            'anuncio'),
  ('webmotors',     'Webmotors',      'anuncio'),
  ('instagram',     'Instagram',      'anuncio'),
  ('agregador',     'Agregador (multi-portais)', 'anuncio'),
  ('whatsapp',      'WhatsApp',       'mensageria')
on conflict (chave) do nothing;

-- Credenciais de cada canal de ANÚNCIO, POR LOJA (tokens criptografados)
create table if not exists canal_credencial (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  canal text not null references canal(chave),
  credenciais jsonb,                 -- guardar criptografado (Vault) em produção
  status text default 'desconectado', -- conectado | desconectado | erro | homologacao
  conectado_em timestamptz,
  unique (loja_id, canal)
);

-- Status da publicação de um veículo em um canal (1 por veículo × canal)
create table if not exists anuncio_publicacao (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid not null references veiculos(id) on delete cascade,
  canal text not null references canal(chave),
  status text default 'pendente',    -- pendente | publicado | erro | despublicado
  id_externo text,
  link_externo text,
  mensagem_erro text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique (veiculo_id, canal)
);

-- Fila de jobs de publicação (cada tentativa)
create table if not exists publicacao_job (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  veiculo_id uuid references veiculos(id) on delete cascade,
  canal text not null references canal(chave),
  acao text not null,                -- publicar | atualizar | despublicar
  payload jsonb,
  status text default 'na_fila',     -- na_fila | processando | concluido | erro
  tentativas int default 0,
  proximo_retry timestamptz,
  criado_em timestamptz default now()
);

-- ---------------------------------------------------------------------
-- PARTE B — Mensageria / CRM (WhatsApp, desenhado omnichannel)
-- ---------------------------------------------------------------------

-- Credenciais de mensageria por loja (WABA da própria loja)
create table if not exists canal_mensageria_credencial (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  canal text not null default 'whatsapp', -- whatsapp | instagram_direct | ...
  waba_id text,
  phone_number_id text,
  credenciais jsonb,                 -- token criptografado
  status text default 'desconectado',
  unique (loja_id, canal)
);

-- Contato (cliente) — pode ser 1:1 com o lead do funil
create table if not exists contato (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  nome text,
  telefone text,
  criado_em timestamptz default now()
);

-- Conversa (uma thread por contato × canal)
create table if not exists conversa (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  contato_id uuid references contato(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  canal text not null default 'whatsapp',
  status text default 'aberta',      -- aberta | fechada
  janela_24h_expira_em timestamptz,  -- janela de mensagem livre do WhatsApp
  ultima_mensagem_em timestamptz,
  criado_em timestamptz default now()
);

-- Mensagens da conversa
create table if not exists mensagem (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas(id) on delete cascade,
  conversa_id uuid not null references conversa(id) on delete cascade,
  direcao text not null,             -- entrada | saida
  tipo text default 'texto',         -- texto | midia | template
  conteudo text,
  id_externo text,
  status text default 'enviada',     -- enviada | entregue | lida | recebida
  criado_em timestamptz default now()
);

create index if not exists idx_pub_veiculo on anuncio_publicacao(veiculo_id);
create index if not exists idx_pub_loja on anuncio_publicacao(loja_id);
create index if not exists idx_conversa_loja on conversa(loja_id);
create index if not exists idx_mensagem_conversa on mensagem(conversa_id);

-- ---------------------------------------------------------------------
-- RLS — tudo isolado por loja (canal é catálogo global, leitura livre)
-- ---------------------------------------------------------------------
alter table canal enable row level security;
drop policy if exists "ler canais" on canal;
create policy "ler canais" on canal for select using (true);

do $$
declare t text;
begin
  foreach t in array array[
    'canal_credencial','anuncio_publicacao','publicacao_job',
    'canal_mensageria_credencial','contato','conversa','mensagem'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || ' da minha loja', t);
    execute format(
      'create policy %I on %I for all using (loja_id = loja_do_usuario()) with check (loja_id = loja_do_usuario());',
      t || ' da minha loja', t
    );
  end loop;
end $$;
