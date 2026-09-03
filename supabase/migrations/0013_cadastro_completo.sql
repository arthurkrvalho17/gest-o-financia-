-- =====================================================================
-- FASE 13 — Cadastro completo: endereço e telefone na loja
-- Adiciona campos de contato/endereço à tabela lojas e atualiza o
-- trigger handle_new_user para populá-los a partir do signup metadata.
-- =====================================================================

alter table lojas
  add column if not exists telefone  text,
  add column if not exists cep       text,
  add column if not exists logradouro text,
  add column if not exists bairro    text,
  add column if not exists cidade    text,
  add column if not exists uf        text;

-- Atualiza o trigger para ler os novos campos do metadata do signup.
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  nova_loja_id uuid;
begin
  insert into lojas (nome, cnpj, telefone, cep, logradouro, bairro, cidade, uf)
  values (
    coalesce(nullif(new.raw_user_meta_data->>'nome_loja', ''), 'Minha loja'),
    nullif(new.raw_user_meta_data->>'cnpj', ''),
    nullif(new.raw_user_meta_data->>'celular', ''),
    nullif(new.raw_user_meta_data->>'cep', ''),
    nullif(new.raw_user_meta_data->>'logradouro', ''),
    nullif(new.raw_user_meta_data->>'bairro', ''),
    nullif(new.raw_user_meta_data->>'cidade', ''),
    nullif(new.raw_user_meta_data->>'uf', '')
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
