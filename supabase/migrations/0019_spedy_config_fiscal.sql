-- =====================================================================
-- SPEDY — configuração tributária por loja (complemento da 0018)
-- Os códigos fiscais de venda de veículo usado (CFOP, CST/CSOSN do ICMS,
-- redução de base, PIS/COFINS) VARIAM por estado e regime tributário e
-- precisam ser confirmados pelo contador de cada loja — nunca hardcoded
-- no código (ver ADR-17). Guardados como jsonb livre até existir uma tela
-- dedicada; o Edge Function spedy-api recusa emitir sem essa configuração.
--
-- Formato esperado de loja_config.config_fiscal:
-- {
--   "ncm": "87032310",
--   "cfop": 5502,
--   "icms": { "origin": 0, "csosn": 400 }
--     -- Simples Nacional: csosn (400 mais comum p/ revenda de usados)
--     -- Regime Normal: cst + baseTaxModality + baseTaxReduction + rate
--   "pis": { "cst": 7 },
--   "cofins": { "cst": 7 }
-- }
--
-- Rode depois da migration 0018.
-- =====================================================================

alter table loja_config
  add column if not exists config_fiscal jsonb;
