-- =====================================================================
-- RENAVE — dados de veículo que faltam no nosso banco (ADR-16, Fase A)
--
-- Auditoria da API (apidoc.renavefacil.net) — para cadastrar veículo e
-- solicitar ENTRADA em estoque, a Renave Fácil exige:
--   vehicle: tipoVeiculo(N|U), chassi, descricao, anoFabricacao(Number),
--            anoModelo(Number), placa, renavam, codigoFipe
--   nfe/purchase: chassi, tipoVeiculo, chaveNfe, cpfCnpj DO VENDEDOR,
--            dtHrProcesso, valor
--   client (o vendedor precisa estar cadastrado): razaoSocial, cep,
--            logradouro, numero, complemento, bairro, cidade, uf
--
-- O que já existia em `veiculos`: chassi (0008), placa (0001), renavam
-- (0006), descricao (0006). O que faltava: ano de fabricação/modelo
-- separados (só existe `fab_mod` texto, "2020/2021"), código FIPE, a chave
-- da NF-e de COMPRA (nota_fiscal da 0018 é de EMISSÃO de venda, eixo
-- diferente), e quem vendeu o veículo pra loja (não existe nenhum conceito
-- de fornecedor/vendedor de origem hoje — só `consignante_*`, que é outra
-- coisa: dono do carro em CONSIGNAÇÃO, não quem vendeu um carro PRÓPRIO).
--
-- POR QUE COLUNAS EM `veiculos`, NÃO TABELA SEPARADA: mesma decisão já
-- tomada para `comprador_*` em `vendas` (0027) e `consignante_*` em
-- `veiculos` (0010) — é uma relação 1:1 por natureza (um veículo teve UM
-- vendedor de origem, uma chave de NF-e de compra), sem histórico
-- múltiplo a guardar, sem necessidade de JOIN em nenhuma consulta do
-- Estoque. Uma tabela própria só compensaria se um veículo pudesse ter
-- vários vendedores de origem ao longo do tempo (não é o caso — a origem é
-- um fato único, de quando o carro entrou no estoque) ou se os dados
-- fossem reaproveitados entre veículos (também não são: cada compra é um
-- evento isolado, sem cadastro de "fornecedores recorrentes" no sistema
-- hoje). Seguindo o mesmo padrão de nomes com prefixo já usado em `0027`
-- (`comprador_*`) e `0010` (`consignante_*`).
--
-- `dtHrProcesso` (momento do ENVIO ao RENAVE) NÃO vira coluna aqui — é
-- `now()` no instante em que o processo for de fato enviado (Fase B), não
-- um dado do cadastro do veículo.
--
-- Nenhum campo novo é NOT NULL — a obrigatoriedade é condicional (só loja
-- com RENAVE ativo) e validada no FRONT (src/modules/estoque/
-- validacaoRenave.js), nunca como constraint: uma loja sem RENAVE não pode
-- ser bloqueada por um requisito de outra loja.
--
-- Rode depois de 0000–0029.
-- =====================================================================

alter table veiculos
  add column if not exists ano_fabricacao   int,
  add column if not exists ano_modelo       int,
  add column if not exists codigo_fipe      text,
  add column if not exists chave_nfe_compra text,
  -- Vendedor de origem: de quem a loja comprou o veículo (client + cpfCnpj
  -- do nfe/purchase). Mesmo padrão de nomes de comprador_* (0027).
  add column if not exists vendedor_origem_nome         text,
  add column if not exists vendedor_origem_cpf_cnpj     text,
  add column if not exists vendedor_origem_cep          text,
  add column if not exists vendedor_origem_logradouro   text,
  add column if not exists vendedor_origem_numero       text,
  add column if not exists vendedor_origem_complemento  text,
  add column if not exists vendedor_origem_bairro       text,
  add column if not exists vendedor_origem_cidade       text,
  add column if not exists vendedor_origem_uf           text;

-- ── Backfill não destrutivo de ano_fabricacao/ano_modelo a partir de
-- fab_mod ── `fab_mod` é MANTIDO (é o que a UI e os conectores de anúncio
-- usam) — isto só preenche as colunas novas, nunca apaga/altera fab_mod.
--
-- Mesma regra do parser JS (src/lib/veiculoAno.js — qualquer mudança
-- precisa ser replicada nos dois lugares):
--   "AAAA/AAAA"      -> os dois lados, só se AMBOS forem 4 dígitos
--   "AAAA"           -> mesmo ano nos dois campos, só se forem 4 dígitos
--   qualquer outra coisa (vazio, "0km", formato helper) -> null, nunca chuta
update veiculos
set ano_fabricacao = case
      when trim(fab_mod) ~ '^\d{4}/\d{4}$'
        then split_part(trim(fab_mod), '/', 1)::int
      when trim(fab_mod) ~ '^\d{4}$'
        then trim(fab_mod)::int
      else null
    end,
    ano_modelo = case
      when trim(fab_mod) ~ '^\d{4}/\d{4}$'
        then split_part(trim(fab_mod), '/', 2)::int
      when trim(fab_mod) ~ '^\d{4}$'
        then trim(fab_mod)::int
      else null
    end
where ano_fabricacao is null and ano_modelo is null;

-- ── veiculos_funcionario (mesmo padrão da 0024) ────────────────────────
-- Nenhuma das colunas novas é sensível (não é `compra`, o único campo que
-- a regra 6.5 esconde do funcionário) — todas entram, mesmo raciocínio já
-- registrado em 0024. drop+create (não create or replace) pelo mesmo
-- motivo da 0024: view não aceita inserir coluna no meio da lista.
drop view if exists veiculos_funcionario;
create view veiculos_funcionario
with (security_invoker = true) as
  select id, loja_id, codigo, modelo, fab_mod, cor, placa, tipo,
         entrada, saida, situacao, pedido, minimo, descricao, renavam,
         chassi, km, combustivel, versao, portas,
         consignante_nome, consignante_cnpj, consignante_tel, consignante_endereco,
         ano_fabricacao, ano_modelo, codigo_fipe, chave_nfe_compra,
         vendedor_origem_nome, vendedor_origem_cpf_cnpj, vendedor_origem_cep,
         vendedor_origem_logradouro, vendedor_origem_numero, vendedor_origem_complemento,
         vendedor_origem_bairro, vendedor_origem_cidade, vendedor_origem_uf,
         marcador_texto, marcador_cor, criado_em
  from veiculos;

notify pgrst, 'reload schema';
