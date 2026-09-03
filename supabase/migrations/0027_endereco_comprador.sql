-- =====================================================================
-- ENDEREÇO DO COMPRADOR — exigido pela Spedy para emitir NF-e
--
-- Achado (31/08/2026, primeira emissão de teste em homologação): a Spedy
-- rejeitou com "Endereço do cliente é obrigatório". O payload de
-- POST /v1/product-invoices exige receiver.address completo
-- (street/number/district/postalCode/city{code,name,state}) — o sistema
-- não coletava isso, só nome e CPF/CNPJ (já registrado como Achado 3 em
-- cérebro/Gestão/2026-08-27_spedy-config-fiscal-homologacao.md).
--
-- Mesmo padrão de endereço já usado em `lojas` (migration 0013/0018:
-- logradouro/numero/bairro/cep/cidade/cidade_ibge/uf).
-- =====================================================================

alter table vendas
  add column if not exists comprador_cep         text,
  add column if not exists comprador_logradouro   text,
  add column if not exists comprador_numero       text,
  add column if not exists comprador_bairro       text,
  add column if not exists comprador_cidade       text,
  add column if not exists comprador_cidade_ibge  text,
  add column if not exists comprador_uf           text;

notify pgrst, 'reload schema';
