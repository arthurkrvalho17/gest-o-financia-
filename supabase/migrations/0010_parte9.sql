-- =====================================================================
-- PARTE 9 — consignante (empresa) no cadastro do veículo + logo da loja
-- Rode depois de 0000–0009.
-- =====================================================================

-- Dados do consignante (empresa dona) do veículo consignado — alimentam o
-- contrato de consignação automaticamente (autofill por veiculo_id).
alter table veiculos add column if not exists consignante_nome text;      -- razão social
alter table veiculos add column if not exists consignante_cnpj text;
alter table veiculos add column if not exists consignante_tel text;
alter table veiculos add column if not exists consignante_endereco text;

-- Logo da loja para o cabeçalho dos documentos (já existe logo_url em loja_config;
-- garante a coluna para instalações antigas).
alter table loja_config add column if not exists logo_url text;
