-- =====================================================================
-- FK COMPOSTA POR LOJA — fecha o vazamento de integridade entre tenants
--
-- O problema (medido em 26/08/2026 pelo scripts/rls-multiloja.mjs): as
-- policies validam `with check (loja_id = loja_do_usuario())` e param aí.
-- Nada garante que o registro apontado pela FK pertence à MESMA loja.
-- Autenticado como loja A dava para inserir uma linha com o PRÓPRIO
-- loja_id apontando para veículo/lead/conversa da loja B — aceito pelo
-- banco em 6 de 6 pares testados.
--
-- Não é vazamento de leitura (A continua sem enxergar a linha de B), mas
-- corrompe integridade entre tenants e funciona como oráculo de
-- existência: violação de FK versus sucesso revela se um UUID existe em
-- outro tenant.
--
-- A correção é a FK CARREGAR o loja_id: uma unique redundante em
-- (id, loja_id) no pai e a FK do filho passando a referenciar as duas
-- colunas. O banco recusa por construção — sem trigger, sem custo de
-- leitura, sem depender de o código lembrar de validar.
--
-- ON DELETE preservado par a par. Onde o original era `set null`, usamos
-- a forma `set null (coluna)` do Postgres 15+ (aqui roda 17.6): anular as
-- duas colunas quebraria, porque loja_id é NOT NULL.
--
-- Idempotente: tudo checa o catálogo antes de criar.
-- Rode depois da 0021.
-- =====================================================================

-- ── 1. Uniques (id, loja_id) nos pais ────────────────────────────────
-- Redundantes (id já é PK), servem só de alvo para a FK composta.
do $$
declare
  t text;
begin
  foreach t in array array['veiculos', 'usuarios', 'leads', 'contato', 'conversa', 'vendas'] loop
    if not exists (
      select 1 from pg_constraint
      where conname = t || '_id_loja_uk' and conrelid = t::regclass
    ) then
      execute format('alter table %I add constraint %I unique (id, loja_id);', t, t || '_id_loja_uk');
    end if;
  end loop;
end $$;

-- ── 2. Troca cada FK simples pela composta ───────────────────────────
-- Percorre os pares (filho, coluna, pai, on delete). Descobre o nome da
-- FK atual pelo catálogo em vez de assumir a convenção `_fkey`, derruba
-- e recria carregando o loja_id.
do $$
declare
  par record;
  fk_atual text;
  nome_novo text;
  clausula text;
begin
  for par in
    select * from (values
      -- filho,                  coluna,        pai,        on delete
      ('vendas',              'veiculo_id',   'veiculos', 'no action'),
      ('vendas',              'vendedor_id',  'usuarios', 'no action'),
      ('preparacao_gastos',   'veiculo_id',   'veiculos', 'cascade'),
      ('veiculo_documento',   'veiculo_id',   'veiculos', 'cascade'),
      ('veiculo_fotos',       'veiculo_id',   'veiculos', 'cascade'),
      ('documentos',          'veiculo_id',   'veiculos', 'no action'),
      ('leads',               'veiculo_id',   'veiculos', 'no action'),
      ('leads',               'vendedor_id',  'usuarios', 'no action'),
      ('anuncio_publicacao',  'veiculo_id',   'veiculos', 'cascade'),
      ('publicacao_job',      'veiculo_id',   'veiculos', 'cascade'),
      ('renave_registro',     'veiculo_id',   'veiculos', 'cascade'),
      ('renave_job',          'veiculo_id',   'veiculos', 'cascade'),
      ('nota_fiscal',         'venda_id',     'vendas',   'cascade'),
      ('nota_fiscal',         'veiculo_id',   'veiculos', 'set null'),
      ('contato',             'lead_id',      'leads',    'set null'),
      ('conversa',            'contato_id',   'contato',  'cascade'),
      ('conversa',            'lead_id',      'leads',    'set null'),
      ('mensagem',            'conversa_id',  'conversa', 'cascade')
    ) as t(filho, coluna, pai, ao_apagar)
  loop
    nome_novo := par.filho || '_' || par.coluna || '_loja_fk';

    -- Já convertida? Checa por ESTRUTURA, não por nome: o par
    -- vendas→veiculos foi convertido à mão em 26/08 com outro nome
    -- (vendas_veiculo_loja_fk), e procurar só pelo nome novo criaria
    -- uma segunda FK equivalente.
    if exists (
      select 1 from pg_constraint c
      where c.conrelid = par.filho::regclass
        and c.confrelid = par.pai::regclass
        and c.contype = 'f'
        and c.conkey = array[
          (select attnum from pg_attribute
           where attrelid = par.filho::regclass and attname = par.coluna),
          (select attnum from pg_attribute
           where attrelid = par.filho::regclass and attname = 'loja_id')
        ]
    ) then
      continue;
    end if;

    -- FK atual: mesma tabela, mesmo pai, referenciando SÓ essa coluna
    select c.conname into fk_atual
    from pg_constraint c
    where c.conrelid = par.filho::regclass
      and c.confrelid = par.pai::regclass
      and c.contype = 'f'
      and c.conkey = array[
        (select attnum from pg_attribute
         where attrelid = par.filho::regclass and attname = par.coluna)
      ]
    limit 1;

    if fk_atual is not null then
      execute format('alter table %I drop constraint %I;', par.filho, fk_atual);
    end if;

    -- `set null` só pode anular a coluna do filho: loja_id é NOT NULL
    clausula := case par.ao_apagar
                  when 'cascade'  then 'on delete cascade'
                  when 'set null' then format('on delete set null (%I)', par.coluna)
                  else ''
                end;

    execute format(
      'alter table %I add constraint %I foreign key (%I, loja_id) references %I(id, loja_id) %s;',
      par.filho, nome_novo, par.coluna, par.pai, clausula
    );
  end loop;
end $$;

-- Nota sobre colunas anuláveis (vendas.vendedor_id, leads.vendedor_id,
-- contato.lead_id, conversa.*): com MATCH SIMPLE (default), FK composta
-- com QUALQUER coluna NULL não é verificada — que é o comportamento
-- desejado: "sem vendedor" continua válido.

notify pgrst, 'reload schema';
