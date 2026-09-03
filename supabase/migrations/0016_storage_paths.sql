-- =====================================================================
-- STORAGE — guardar o PATH do arquivo, não a URL assinada
-- URLs assinadas expiram (1 ano); gravá-las no banco quebra fotos, notas
-- e documentos silenciosamente no futuro. A partir daqui: escrita guarda
-- o path e a leitura gera a URL assinada na hora (src/lib/storage.js).
-- As colunas *_url continuam como fallback para linhas antigas.
-- Rode depois de 0000–0015. (veiculo_documento.arquivo_path já existe.)
-- =====================================================================

alter table veiculo_fotos add column if not exists path text;
alter table loja_config add column if not exists logo_path text;
alter table despesas add column if not exists nota_fiscal_path text;
alter table preparacao_gastos add column if not exists nota_fiscal_path text;
