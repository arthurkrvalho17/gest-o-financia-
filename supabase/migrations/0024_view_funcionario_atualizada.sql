-- =====================================================================
-- VIEW veiculos_funcionario DEFASADA — corrige e atualiza
--
-- A view foi criada na 0006 com a lista de colunas de veiculos daquele
-- momento. Desde então a tabela ganhou chassi/km/combustivel (0008),
-- consignante_* (0010) e versao/portas (0023) — nenhuma delas sensível
-- (nenhuma é Compra nem Lucro), mas a view continuou sem elas.
--
-- Também faltava `minimo`: o comentário original da 0006 dizia "o
-- funcionário não pode ver compra/minimo nem lucro", mas a regra vigente
-- (README §6, regra 6.5) mudou — hoje o funcionário VÊ Mínimo e Venda, só
-- não vê Compra e Lucro. A view ficou presa na regra antiga.
--
-- Continua faltando `compra` de propósito: é o único valor que a regra
-- 6.5 esconde do funcionário (lucro nunca é coluna — é sempre calculado
-- na leitura, então nem entra aqui).
--
-- Sem efeito prático ainda: nenhuma query do front usa esta view hoje
-- (README §11 lista "proteção de coluna por papel" como pendente) — mas
-- ela é o caminho documentado para quando isso for ligado, então precisa
-- refletir o schema atual.
-- =====================================================================

-- `create or replace view` recusa mudar a ORDEM/nome das colunas já
-- existentes (só permite acrescentar no fim) — a tentativa original falhou
-- em produção com "cannot change name of view column ... to minimo"
-- porque `minimo` entrava no meio da lista. Como nada depende desta view
-- ainda (comentário acima), drop + create resolve sem esse limite.
drop view if exists veiculos_funcionario;
create view veiculos_funcionario
with (security_invoker = true) as
  select id, loja_id, codigo, modelo, fab_mod, cor, placa, tipo,
         entrada, saida, situacao, pedido, minimo, descricao, renavam,
         chassi, km, combustivel, versao, portas,
         consignante_nome, consignante_cnpj, consignante_tel, consignante_endereco,
         marcador_texto, marcador_cor, criado_em
  from veiculos;
