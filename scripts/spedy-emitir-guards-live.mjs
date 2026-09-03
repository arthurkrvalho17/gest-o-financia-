#!/usr/bin/env node
// =====================================================================
// Teste AO VIVO dos guards de emitir() (Parte 2 do pedido de 31/08/2026)
// contra o Supabase REAL, chamando a Edge Function `spedy-api` já
// deployada com um JWT de usuário de verdade (não um Supabase falso).
//
// Muda temporariamente 3 campos da loja de teste ("Financia Mais
// Veículos") para provocar cada bloqueio, e devolve tudo ao estado
// original no finally — mesmo padrão de segurança de
// scripts/protecao-papel-compra.mjs. O snapshot/restauração usa
// `supabase db query --output-format json`, nunca transcrição manual.
//
// O cenário "certificado ausente" NÃO precisa de mutação nenhuma: é o
// estado real desta loja hoje (o upload de certificado de mais cedo
// aconteceu ANTES do guard existir, então a validade nunca foi
// persistida — achado registrado na documentação).
//
// USO
//   SPEDY_TESTE_EMAIL=... SPEDY_TESTE_PASSWORD=... node scripts/spedy-emitir-guards-live.mjs
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function carregarEnvLocal(caminho) {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
carregarEnvLocal(resolve(RAIZ, '.env.local'));

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.SPEDY_TESTE_EMAIL;
const SENHA = process.env.SPEDY_TESTE_PASSWORD;
if (!URL || !ANON || !EMAIL || !SENHA) {
  console.error('Faltam VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (.env.local) e SPEDY_TESTE_EMAIL/SPEDY_TESTE_PASSWORD (env).');
  process.exit(1);
}

const LOJA_ID = 'd4097e0f-004f-4ecb-84a1-94e5dd32f135';
const VENDA_ID = '11111111-1111-4111-8111-111111111102';

function dbQuery(sql, outputJson = false) {
  const arq = resolve(RAIZ, `.spedy-live-${randomUUID()}.sql`);
  writeFileSync(arq, sql, 'utf8');
  const args = ['/c', 'npx', 'supabase', 'db', 'query', '--linked', '--file', arq];
  if (outputJson) args.push('--output-format', 'json');
  try {
    return execFileSync('cmd.exe', args, { cwd: RAIZ, encoding: 'utf8' });
  } finally {
    unlinkSync(arq);
  }
}

// A saída --output-format json vem misturada com linhas de log
// ("Initialising login role...") — pega só o trecho que é JSON de verdade.
function extrairJson(saida) {
  const inicio = saida.indexOf('[');
  const fim = saida.lastIndexOf(']');
  if (inicio === -1 || fim === -1) throw new Error(`Saída sem JSON reconhecível:\n${saida}`);
  return JSON.parse(saida.slice(inicio, fim + 1));
}

function jsonSql(valorJs) {
  return `'${JSON.stringify(valorJs).replace(/'/g, "''")}'::jsonb`;
}

// Para colunas TEXT (não jsonb) — nunca usar jsonSql aqui, senão as aspas
// do JSON.stringify entram como parte do valor.
function sqlString(valor) {
  if (valor === null || valor === undefined) return 'null';
  return `'${String(valor).replace(/'/g, "''")}'`;
}

const linhas = [];
const ok = (nome, passou, obs = '') => {
  linhas.push({ nome, passou });
  console.log(`${passou ? '✅' : '❌'} ${nome}${obs ? ' — ' + obs : ''}`);
};

(async () => {
  console.log(`Projeto: ${URL}\n`);

  const cli = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessao, error: erroLogin } = await cli.auth.signInWithPassword({ email: EMAIL, password: SENHA });
  if (erroLogin) throw new Error(`Login falhou (${EMAIL}): ${erroLogin.message}`);
  const jwt = sessao.session.access_token;
  console.log(`Login ok: ${EMAIL}\n`);

  async function chamarEmitir() {
    const res = await fetch(`${URL}/functions/v1/spedy-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ action: 'emitir', vendaId: VENDA_ID }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  // ── Snapshot via JSON (nunca transcrito à mão) ──
  const [lojaSnap] = extrairJson(dbQuery(`select inscricao_estadual from lojas where id = '${LOJA_ID}';`, true));
  const [configSnap] = extrairJson(dbQuery(`select config_fiscal from loja_config where loja_id = '${LOJA_ID}';`, true));
  const [credSnap] = extrairJson(dbQuery(`select credenciais from canal_credencial where loja_id = '${LOJA_ID}' and canal = 'spedy';`, true));
  const [notaSnap] = extrairJson(dbQuery(`select status, processing_status, processing_message, processing_code, number from nota_fiscal where venda_id = '${VENDA_ID}';`, true));

  const inscricaoOriginal = lojaSnap.inscricao_estadual;
  const configFiscalOriginal = configSnap.config_fiscal;
  const credenciaisOriginais = credSnap.credenciais;

  console.log('Snapshot capturado (IE, config_fiscal, credenciais, nota_fiscal) — restaurando tudo no finally.\n');

  try {
    // ── Cenário 1: certificado ausente — ESTADO REAL, sem mutação ──
    const r1 = await chamarEmitir();
    ok('certificado ausente (estado real de hoje, sem mutação)', r1.body.erro === 'certificado_invalido', JSON.stringify(r1.body));

    // ── Cenário 2: IE ausente (bypassa certificado, zera IE) ──
    dbQuery(`update canal_credencial set credenciais = ${jsonSql({ ...credenciaisOriginais, certificado_expira_em: '2099-01-01T00:00:00Z' })} where loja_id = '${LOJA_ID}' and canal = 'spedy';`);
    dbQuery(`update lojas set inscricao_estadual = null where id = '${LOJA_ID}';`);
    const r2 = await chamarEmitir();
    ok('IE ausente', r2.body.erro === 'inscricao_estadual_ausente', JSON.stringify(r2.body));
    dbQuery(`update lojas set inscricao_estadual = ${sqlString(inscricaoOriginal)} where id = '${LOJA_ID}';`);

    // ── Cenário 3: config_fiscal ausente ──
    dbQuery(`update loja_config set config_fiscal = null where loja_id = '${LOJA_ID}';`);
    const r3 = await chamarEmitir();
    ok(
      'config_fiscal ausente (lista os 3 campos)',
      r3.body.erro === 'config_fiscal_incompleto' && JSON.stringify(r3.body.campos_faltando) === JSON.stringify(['ncm', 'cfop', 'icms']),
      JSON.stringify(r3.body),
    );
    dbQuery(`update loja_config set config_fiscal = ${jsonSql(configFiscalOriginal)} where loja_id = '${LOJA_ID}';`);
  } finally {
    dbQuery(`update canal_credencial set credenciais = ${jsonSql(credenciaisOriginais)} where loja_id = '${LOJA_ID}' and canal = 'spedy';`);
    dbQuery(
      `update nota_fiscal set status=${sqlString(notaSnap.status)}, processing_status=${sqlString(notaSnap.processing_status)}, processing_message=${sqlString(notaSnap.processing_message)}, processing_code=${sqlString(notaSnap.processing_code)}, number=${sqlString(notaSnap.number)} where venda_id = '${VENDA_ID}';`,
    );
    console.log('\nEstado original restaurado: credenciais, lojas.inscricao_estadual, loja_config.config_fiscal, nota_fiscal.');
  }

  console.log(`\n${linhas.filter((l) => l.passou).length}/${linhas.length} passaram.`);
  if (linhas.some((l) => !l.passou)) process.exit(1);
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
