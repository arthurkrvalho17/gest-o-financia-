#!/usr/bin/env node
// =====================================================================
// Aplica o CFOP CONFIRMADO PELO CONTADOR em todos os lugares do projeto.
//
// Contexto: o CFOP 5502/6502 foi documentado em 6 lugares do repositório,
// mas pela tabela nacional 5.502 é "remessa com fim específico de
// exportação" — não venda a consumidor. A suspeita virou a pergunta nº 1
// da lista para o contador (ver 2026-08-27_spedy-config-fiscal-homologacao
// em cérebro/Gestão).
//
// Este script NÃO escolhe o código. Ele exige os dois valores confirmados
// e recusa rodar sem eles — a decisão é do contador, sempre.
//
// USO
//   node scripts/aplicar-cfop-confirmado.mjs --interno=5102 --interestadual=6102 \
//        --confirmado-por="João Silva CRC-SP 123456, 28/08/2026"
//
//   --dry-run   mostra o que mudaria, sem escrever
//
// O QUE ELE TOCA
//   README.md                                  (ADR-17)
//   INTEGRACOES.md                             (seção 9)
//   docs/HANDOFF-SPEDY.md
//   docs/config-fiscal-homologacao.json        (valor + limpa os avisos)
//   src/modules/configuracoes/ConfiguracoesPage.jsx  (placeholder do textarea)
//   supabase/migrations/00NN_config_fiscal_comentario.sql   (GERADO)
//
// O QUE ELE NÃO TOCA — de propósito
//   supabase/migrations/0019_spedy_config_fiscal.sql
//     Migration já aplicada. A CLI do Supabase registra o conteúdo aplicado
//     em supabase_migrations.schema_migrations; editar o arquivo depois faz
//     ele divergir do que está registrado. Em vez disso, o script gera uma
//     migration nova com `comment on column loja_config.config_fiscal`, que
//     passa a ser a spec viva do formato — dentro do banco, onde não some.
// =====================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Argumentos ───────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);

const interno = String(args.interno || '');
const interestadual = String(args.interestadual || '');
const confirmadoPor = String(args['confirmado-por'] || '');
const dryRun = !!args['dry-run'];

function abortar(msg) {
  console.error(`\n${msg}\n`);
  console.error('Uso: node scripts/aplicar-cfop-confirmado.mjs --interno=NNNN --interestadual=NNNN --confirmado-por="quem e quando"');
  process.exit(1);
}

if (!interno || !interestadual) {
  abortar(
    'Faltam os CFOPs confirmados pelo contador.\n' +
      'Este script NÃO escolhe código tributário — ele só aplica o que já foi decidido.\n' +
      'Se o contador ainda não respondeu, a pergunta exata está em\n' +
      '  cérebro/Gestão/2026-08-27_spedy-config-fiscal-homologacao.md (pergunta nº 1).',
  );
}
// Operação de saída dentro do estado começa com 5; interestadual, com 6.
if (!/^5\d{3}$/.test(interno)) abortar(`CFOP interno inválido: "${interno}". Saída dentro do estado começa com 5 e tem 4 dígitos.`);
if (!/^6\d{3}$/.test(interestadual)) abortar(`CFOP interestadual inválido: "${interestadual}". Saída interestadual começa com 6 e tem 4 dígitos.`);
if (!confirmadoPor) {
  abortar(
    'Faltou --confirmado-por. Registrar QUEM confirmou e QUANDO não é burocracia:\n' +
      'é o que distingue um código tributário validado de um palpite que virou fato no banco.',
  );
}

// ── Edições ──────────────────────────────────────────────────────────
const mudancas = [];

function editar(caminhoRel, transformar) {
  const caminho = resolve(RAIZ, caminhoRel);
  if (!existsSync(caminho)) {
    mudancas.push({ arquivo: caminhoRel, status: 'AUSENTE — pulado' });
    return;
  }
  const antes = readFileSync(caminho, 'utf8');
  const depois = transformar(antes);
  if (antes === depois) {
    mudancas.push({ arquivo: caminhoRel, status: 'sem alteração (já aplicado?)' });
    return;
  }
  if (!dryRun) writeFileSync(caminho, depois);
  const n = (antes.match(/5502|6502/g) || []).length;
  mudancas.push({ arquivo: caminhoRel, status: `${n} ocorrência(s) trocada(s)` });
}

const trocaSimples = (s) => s.replaceAll('5502', interno).replaceAll('6502', interestadual);

editar('README.md', trocaSimples);
editar('INTEGRACOES.md', trocaSimples);
editar('docs/HANDOFF-SPEDY.md', trocaSimples);
editar('src/modules/configuracoes/ConfiguracoesPage.jsx', trocaSimples);

// O JSON de homologação: além do valor, os avisos saem. A AUSÊNCIA do
// _aviso é o sinal de que a configuração passou a ser confirmada.
editar('docs/config-fiscal-homologacao.json', (s) => {
  const j = JSON.parse(s);
  delete j._conflito_cfop;
  delete j._pendencias;
  j._aviso =
    `CFOP confirmado por: ${confirmadoPor}. ` +
    'Os DEMAIS campos (ncm, icms, pis, cofins) seguem NAO confirmados — ver a lista de perguntas ' +
    'em cerebro/Gestao/2026-08-27_spedy-config-fiscal-homologacao.md. Enquanto esta chave existir, ' +
    'a configuracao NAO esta pronta para producao.';
  j.cfop = Number(interno);
  j._cfop_interestadual = Number(interestadual);
  return JSON.stringify(j, null, 2) + '\n';
});

// ── Migration nova com o comentário corrigido ────────────────────────
const versoes = readdirSync(resolve(RAIZ, 'supabase/migrations'))
  .map((f) => parseInt(f.slice(0, 4), 10))
  .filter((n) => !Number.isNaN(n));
const proxima = String(Math.max(...versoes) + 1).padStart(4, '0');
const nomeMigration = `supabase/migrations/${proxima}_config_fiscal_comentario.sql`;

const sqlMigration = `-- =====================================================================
-- CONFIG_FISCAL — comentário corrigido com o CFOP confirmado pelo contador
--
-- Substitui a documentação de formato que estava no comentário da
-- 0019_spedy_config_fiscal.sql, onde o CFOP registrado era 5502 — que pela
-- tabela nacional é "remessa de mercadoria adquirida ou recebida de
-- terceiros, com fim específico de exportação", não venda a consumidor.
--
-- A 0019 não foi editada: migration aplicada é histórico. Este comentário
-- de coluna passa a ser a spec viva do formato, dentro do próprio banco.
--
-- CFOP confirmado por: ${confirmadoPor}
-- =====================================================================

comment on column loja_config.config_fiscal is
  'Configuracao tributaria da loja para emissao de NF-e (ADR-17). Formato:
   {
     "ncm": "<por veiculo: varia com cilindrada e combustivel>",
     "cfop": ${interno},                  -- saida dentro do estado
     "_cfop_interestadual": ${interestadual}, -- saida para outro estado
     "icms": { "origin": 0, "csosn": 400 },
     "pis": { "cst": 7 },
     "cofins": { "cst": 7 }
   }
   CFOP confirmado por ${confirmadoPor}. Os demais codigos seguem
   pendentes de confirmacao — ver a lista de perguntas ao contador em
   cerebro/Gestao/2026-08-27_spedy-config-fiscal-homologacao.md.
   O sistema NUNCA assume esses valores: sem config_fiscal, a spedy-api
   recusa emitir.';
`;

if (!dryRun) writeFileSync(resolve(RAIZ, nomeMigration), sqlMigration);
mudancas.push({ arquivo: nomeMigration, status: dryRun ? 'seria gerada' : 'gerada' });

// ── Relatório ────────────────────────────────────────────────────────
console.log(`\nCFOP interno: ${interno}   interestadual: ${interestadual}`);
console.log(`Confirmado por: ${confirmadoPor}`);
console.log(dryRun ? '\n--- DRY RUN: nada foi escrito ---\n' : '');
for (const m of mudancas) console.log(`  ${m.arquivo.padEnd(52)} ${m.status}`);

console.log(`
Falta fazer à mão:
  1. npx supabase db push          (aplica a ${proxima})
  2. Revisar o diff: git diff
  3. O código do app NAO muda — o CFOP sempre veio de config_fiscal,
     nunca esteve hardcoded. O que muda é documentacao + o placeholder
     que o lojista copia.
  4. Atualizar o config_fiscal das lojas JA configuradas:
       update loja_config set config_fiscal = jsonb_set(config_fiscal, '{cfop}', '${interno}')
       where config_fiscal is not null;
  5. ATENCAO: isto corrige SO o CFOP. ncm, icms, pis e cofins continuam
     nao confirmados — a lista de perguntas segue aberta.
`);
