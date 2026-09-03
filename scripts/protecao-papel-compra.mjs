#!/usr/bin/env node
// =====================================================================
// Teste de proteção de coluna por papel (dono × funcionário) — Financia+
//
// Prova, contra o Supabase REAL e só com a ANON KEY, as duas migrations
// 0025/0026 (31/08/2026):
//   1. Um funcionário autenticado NÃO enxerga `compra` de um veículo da
//      PRÓPRIA loja (migration 0026 — veiculo_valor_compra, RLS que exige
//      loja E papel='dono').
//   2. Um funcionário autenticado NÃO consegue virar dono sozinho
//      (migration 0025 — trigger que barra UPDATE de papel/loja_id em
//      usuarios vindo da API pública).
//
// Este script MUDA temporariamente o papel de uma conta de teste para
// 'funcionario' via `supabase db query --linked` (canal administrativo,
// fora da API pública — o mesmo canal que aplica migrations) e devolve a
// 'dono' no final, mesmo se algo falhar no meio. Só toca em contas
// descartáveis (RLSTEST_* / as duas contas de teste já usadas em
// scripts/rls-multiloja.mjs) e em linhas semeadas com prefixo RLSTEST-.
//
// USO
//   node --env-file=<arquivo com RLS_A_EMAIL/PASSWORD, RLS_B_EMAIL/PASSWORD> \
//     scripts/protecao-papel-compra.mjs
//
// Pré-requisito: as duas contas já precisam existir e estar com papel
// 'dono' (mesmo estado usado por scripts/rls-multiloja.mjs).
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
const A_EMAIL = process.env.RLS_A_EMAIL, A_SENHA = process.env.RLS_A_PASSWORD;
const B_EMAIL = process.env.RLS_B_EMAIL, B_SENHA = process.env.RLS_B_PASSWORD;
if (!URL || !ANON || !A_EMAIL || !A_SENHA || !B_EMAIL || !B_SENHA) {
  console.error('Faltam VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (.env.local) e RLS_A_/RLS_B_EMAIL/PASSWORD.');
  process.exit(1);
}
if (/service_role/i.test(ANON)) {
  console.error('A chave configurada parece ser service_role. Este teste só roda com a ANON KEY.');
  process.exit(1);
}

const MARCA = `RLSTEST-${Date.now().toString(36)}`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

// Canal administrativo (fora da API pública, mesmo caminho que aplica
// migrations) — só usado para preparar/desfazer o estado de teste
// (papel de B), nunca para verificar o comportamento em si.
function dbQuery(sql) {
  const arq = resolve(RAIZ, `.protecao-papel-compra-${randomUUID()}.sql`);
  writeFileSync(arq, sql);
  try {
    return execFileSync('cmd.exe', ['/c', 'npx', 'supabase', 'db', 'query', '--linked', '--file', arq], {
      cwd: RAIZ,
      encoding: 'utf8',
    });
  } finally {
    unlinkSync(arq);
  }
}

async function login(email, senha) {
  const cli = createClient(URL, ANON, opts);
  const { data, error } = await cli.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`Login falhou (${email}): ${error.message}`);
  const { data: usuario } = await cli.from('usuarios').select('id, loja_id, papel').eq('id', data.session.user.id).maybeSingle();
  if (!usuario?.loja_id) throw new Error(`Conta ${email} sem loja vinculada.`);
  return { cli, userId: data.session.user.id, lojaId: usuario.loja_id, email };
}

const linhas = [];
const ok = (nome, passou, obs = '') => {
  linhas.push({ nome, veredito: passou ? 'PASSOU' : 'VAZOU', obs });
  console.log(`${passou ? '✅' : '❌'} ${nome}${obs ? ' — ' + obs : ''}`);
};

(async () => {
  console.log(`Projeto: ${URL}\nMarca: ${MARCA}\n`);

  const A = await login(A_EMAIL, A_SENHA); // permanece dono o tempo todo
  const B = await login(B_EMAIL, B_SENHA); // vira funcionário durante o teste

  if (A.lojaId === B.lojaId) throw new Error('As duas contas estão na mesma loja — teste não faz sentido aqui.');

  let veiculoId = null;
  try {
    // ── Preparação: B vira funcionário via canal administrativo ──
    dbQuery(`update usuarios set papel = 'funcionario' where id = '${B.userId}';`);

    // Confirma via anon key que o papel realmente mudou (AuthContext relê do banco).
    const { data: bAgora } = await B.cli.from('usuarios').select('papel').eq('id', B.userId).maybeSingle();
    ok('setup: B está funcionario', bAgora?.papel === 'funcionario', `papel atual: ${bAgora?.papel}`);

    // ── 1. Funcionário não vê compra de um veículo da própria loja ──
    // Semeado por canal administrativo (simula "o dono cadastrou o carro e
    // o preço em algum momento antes"), sem depender de existir um segundo
    // dono na loja B durante o teste.
    veiculoId = randomUUID();
    dbQuery(`
      insert into veiculos (id, loja_id, modelo, placa) values ('${veiculoId}', '${B.lojaId}', '${MARCA} veiculo', '${MARCA}');
      insert into veiculo_valor_compra (veiculo_id, loja_id, compra) values ('${veiculoId}', '${B.lojaId}', 12345);
    `);

    const { data: valorParaFuncionario } = await B.cli
      .from('veiculo_valor_compra')
      .select('compra')
      .eq('veiculo_id', veiculoId);
    ok(
      'compra some para funcionário (mesma loja)',
      !valorParaFuncionario || valorParaFuncionario.length === 0,
      `linhas retornadas: ${valorParaFuncionario?.length ?? 0}`
    );

    // Controle: veículo em si continua visível (só a coluna some, não a linha).
    const { data: veicParaFuncionario } = await B.cli.from('veiculos').select('id, modelo').eq('id', veiculoId).maybeSingle();
    ok('controle positivo: veículo em si continua visível ao funcionário', !!veicParaFuncionario);

    // Funcionário não consegue nem gravar um valor de compra.
    const { error: erroInsertCompra } = await B.cli
      .from('veiculo_valor_compra')
      .upsert({ veiculo_id: veiculoId, loja_id: B.lojaId, compra: 99999 });
    ok('funcionário não grava compra', !!erroInsertCompra, erroInsertCompra?.message?.slice(0, 80));

    // ── 2. Funcionário não consegue se autopromover a dono ──
    const { error: erroAutopromocao } = await B.cli.from('usuarios').update({ papel: 'dono' }).eq('id', B.userId);
    ok('funcionário não consegue virar dono sozinho', !!erroAutopromocao, erroAutopromocao?.message?.slice(0, 80));

    // Confirma que o papel REALMENTE não mudou (não confia só no erro do PostgREST).
    const { data: bDepois } = await B.cli.from('usuarios').select('papel').eq('id', B.userId).maybeSingle();
    ok('papel de B continua funcionario após a tentativa', bDepois?.papel === 'funcionario', `papel: ${bDepois?.papel}`);

    // ── Controle positivo: dono da PRÓPRIA loja continua enxergando compra ──
    // (usa A, que nunca deixou de ser dono, com um veículo próprio de A.)
    const veiculoIdA = randomUUID();
    dbQuery(`
      insert into veiculos (id, loja_id, modelo, placa) values ('${veiculoIdA}', '${A.lojaId}', '${MARCA} veiculo A', '${MARCA}A');
      insert into veiculo_valor_compra (veiculo_id, loja_id, compra) values ('${veiculoIdA}', '${A.lojaId}', 54321);
    `);
    const { data: valorParaDono } = await A.cli.from('veiculo_valor_compra').select('compra').eq('veiculo_id', veiculoIdA).maybeSingle();
    ok('dono continua enxergando a própria compra', valorParaDono?.compra === 54321 || Number(valorParaDono?.compra) === 54321, `valor: ${valorParaDono?.compra}`);
    dbQuery(`delete from veiculos where id = '${veiculoIdA}';`); // cascade limpa veiculo_valor_compra
  } finally {
    // ── Limpeza: apaga o veículo semeado e devolve B a dono ──
    if (veiculoId) dbQuery(`delete from veiculos where id = '${veiculoId}';`); // cascade limpa veiculo_valor_compra
    dbQuery(`update usuarios set papel = 'dono' where id = '${B.userId}';`);
    const { data: bRestaurado } = await B.cli.from('usuarios').select('papel').eq('id', B.userId).maybeSingle();
    console.log(`\nB restaurado para: ${bRestaurado?.papel} (deve ser 'dono')`);
  }

  const vazou = linhas.filter((l) => l.veredito === 'VAZOU').length;
  console.log(`\nPASSOU: ${linhas.length - vazou}   VAZOU: ${vazou}`);
  process.exit(vazou > 0 ? 1 : 0);
})().catch((e) => {
  console.error('\nERRO:', e.message);
  process.exit(2);
});
