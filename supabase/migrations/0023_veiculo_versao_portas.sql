-- =====================================================================
-- VERSÃO E PORTAS DO VEÍCULO — obrigatórios para publicar no Mercado Livre
--
-- Conferido em 30/08/2026 via GET /categories/MLB1744/attributes: a
-- categoria de veículos (Carros e Caminhonetes) exige TRIM (versão) e
-- DOORS (portas) para aceitar o anúncio. mapearCamposML.js já valida os
-- dois antes de publicar (validarAnuncioML), mas até aqui não havia
-- nenhuma coluna no cadastro para guardá-los — toda publicação no ML
-- falhava, sempre, por falta desses dois campos. Ver INTEGRACOES.md §3.
-- =====================================================================

alter table veiculos
  add column if not exists versao text,
  add column if not exists portas smallint;

notify pgrst, 'reload schema';
