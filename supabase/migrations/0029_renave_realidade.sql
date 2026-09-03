-- =====================================================================
-- RENAVE — realinhamento ao modelo real da Renave Fácil (ADR-16, revisado)
--
-- POR QUE O SCHEMA MUDA: a 0017 foi escrita a partir da intenção original
-- do ADR-16 (Financia+ "orquestrando" o registro de entrada/saída/
-- consignação no RENAVE, com webhook de retorno). Lendo a doc oficial
-- direto (apidoc.renavefacil.net, 02/09/2026), isso está errado. A doc é
-- textual: "A integração é apenas para envio de dados cadastrais de
-- clientes, veículos e NF-e. Os processos RENAVE são feitos exclusivamente
-- em nossa plataforma." Não existe endpoint de registrar entrada/saída/
-- consignação, não existe webhook, e não existe NENHUM endpoint de
-- consignação (o modelo de consignação do sistema — ADR-14 — continua só
-- como espelho comercial).
--
-- O papel real do Financia+: alimentar cadastro (cliente/veículo) e
-- enviar a chave da NF-e já emitida (compra/venda/transferência) —
-- e ESPELHAR o que a Renave Fácil expõe só leitura (GET /docs/status,
-- /docs/atpve/entrada, /docs/atpve/saida, /docs/crlve). Essa consulta é
-- sempre sob demanda: a própria doc proíbe sincronização em massa ("não é
-- permitido o envio em massa de dados, o envio deve ser sob demanda") e
-- um cadastro sem processo RENAVE aberto por mais de 90 dias é apagado da
-- base deles.
--
-- Esta migration NÃO edita a 0017 (já aplicada) — só adiciona/ajusta o
-- que faltava em `renave_registro`. `renave_job` fica como está (fila
-- ainda sem uso — Edge Function/polling são Fase B, fora desta migration).
-- Rode depois de 0000–0028.
-- =====================================================================

-- Situação do veículo no ESTOQUE DA RENAVE (situacaoEstoqueRenave, devolvida
-- por GET /docs/status) — eixo DIFERENTE de `status` (que é só o controle
-- interno de "a chamada que fizemos deu certo"). '' = sem processo aberto.
alter table renave_registro add column if not exists situacao text
  check (situacao in ('S', 'T', 'C', 'X', 'V', 'E', 'I', ''));
comment on column renave_registro.situacao is
  'situacaoEstoqueRenave (GET /docs/status): S solicitado | T transferido (processo aberto no Detran, não finalizado) | C confirmado (em estoque) | X cancelado | V vendido | E transferência entre estabelecimentos (CNPJ raiz distinto) | I transferência entre filiais | (vazio) sem processo.';

-- documentosDisponiveis (GET /docs/status): { termoEntrada, atpvEntrada, crlv,
-- termoSaida, ... }. Regra da doc: atpvEntrada não existe se a entrada usou
-- CRV em papel (verde) — por isso é jsonb, não colunas fixas: a presença de
-- cada chave já é a informação.
alter table renave_registro add column if not exists documentos_disponiveis jsonb;
comment on column renave_registro.documentos_disponiveis is
  'Espelho de documentosDisponiveis (GET /docs/status) — ex.: {termoEntrada, atpvEntrada, crlv, termoSaida}. Chave ausente = documento não existe (ex.: atpvEntrada quando a entrada usou CRV em papel).';

-- Chave de NF-e enviada (POST /vehicle/nfe/{purchase|sales|transfer}) e os
-- dados que a acompanham. Não existe "registro" nosso aqui — existe "mandamos
-- a chave de uma nota que a Spedy (ADR-17) já emitiu".
alter table renave_registro add column if not exists chave_nfe text;
alter table renave_registro add column if not exists dt_hr_processo timestamptz;
alter table renave_registro add column if not exists valor numeric;

-- Última vez que consultamos GET /docs/status para este veículo. Não existe
-- webhook — toda atualização de `situacao`/`documentos_disponiveis` vem de
-- uma consulta explícita, nunca de um evento empurrado pela integradora.
alter table renave_registro add column if not exists consultado_em timestamptz;
comment on column renave_registro.consultado_em is
  'Data/hora da última leitura de GET /docs/status. Não existe webhook nesta integradora — toda atualização de situacao/documentos_disponiveis vem de consulta sob demanda, nunca de job em lote (proibido pela doc da Renave Fácil).';

-- 'consignacao' nunca existiu como endpoint na Renave Fácil — não há
-- registro eletrônico de consignação nem previsão de existir. Removido do
-- enum em vez de deprecado silenciosamente: nenhum código futuro deveria
-- conseguir gravar isso (a tabela está vazia nesta data — sem dado a migrar).
alter table renave_registro drop constraint if exists renave_registro_evento_check;
alter table renave_registro add constraint renave_registro_evento_check
  check (evento in ('entrada', 'saida'));
