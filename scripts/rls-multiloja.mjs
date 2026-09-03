#!/usr/bin/env node
// =====================================================================
// Teste de isolamento multi-loja (RLS) — Financia+ Gestão
//
// Prova, contra o Supabase REAL, o princípio nº 1 do README (seção 2) e o
// ADR-02: a separação entre lojas acontece no Postgres, não no React.
//
// COMO FUNCIONA
//   1. Cria DUAS contas descartáveis (signup normal → o trigger
//      handle_new_user cria uma loja para cada). Nenhum dado de loja real
//      entra no teste: as duas lojas nascem aqui.
//   2. Autenticado como loja B, semeia linhas marcadas com o prefixo
//      RLSTEST-<carimbo> em cada tabela.
//   3. Autenticado como loja A, tenta SELECT / UPDATE / DELETE nessas
//      linhas e INSERT com o loja_id da B. Tudo deve falhar.
//   4. Sem autenticação nenhuma, tenta SELECT. Deve falhar.
//   5. Apaga o que semeou.
//
// REGRAS QUE O SCRIPT SEGUE
//   - ANON KEY apenas. A service_role nunca é usada nem lida.
//   - Só toca em linhas que ele mesmo criou (prefixo RLSTEST-).
//   - Todo caso tem CONTROLE POSITIVO: antes de exigir que A não veja a
//     linha de B, confirma que B VÊ a própria linha. Sem isso, "não
//     retornou nada" não prova isolamento — prova só que a query não
//     achou nada (tabela vazia, id errado, coluna inexistente).
//   - UPDATE e DELETE não confiam no retorno vazio do PostgREST: relêem
//     a linha como B para confirmar que nada mudou de verdade.
//
// USO
//   node scripts/rls-multiloja.mjs
//
// Variáveis (lidas de .env.local ou do ambiente):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   — obrigatórias
//   RLS_A_EMAIL / RLS_A_PASSWORD                — opcional, reusa conta
//   RLS_B_EMAIL / RLS_B_PASSWORD                — opcional, reusa conta
//
// RESÍDUO CONHECIDO: a anon key não apaga usuário do auth nem linha de
// `lojas`/`usuarios` (não há policy de DELETE — de propósito). As duas
// contas de teste ficam no projeto e precisam ser removidas à mão no
// painel do Supabase (Authentication → Users → delete). O script imprime
// os e-mails no fim.
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Ambiente ─────────────────────────────────────────────────────────
function carregarEnvLocal(caminho) {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}
carregarEnvLocal(resolve(RAIZ, '.env.local'));

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env.local ou ambiente).');
  process.exit(1);
}
if (/service_role/i.test(ANON)) {
  console.error('A chave configurada parece ser service_role. Este teste só roda com a ANON KEY.');
  process.exit(1);
}

const CARIMBO = Date.now().toString(36);
const MARCA = `RLSTEST-${CARIMBO}`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const novoCliente = () => createClient(URL, ANON, opts);

// ── Coleta de resultados ─────────────────────────────────────────────
const linhas = [];
const registrar = (r) => linhas.push({ obs: '', ...r });

const OK = 'OK';
const VAZOU = 'VAZOU';
const NA = '—';
const INC = 'INCONCLUSIVO';

// ── Conta de teste ───────────────────────────────────────────────────
// O validador de e-mail do Supabase recusa domínio sem MX real (inclusive
// example.com e domínios inventados) com email_address_invalid. Por isso o
// default é um domínio com MX de verdade — com "Confirm email" desligado
// nenhuma mensagem chega a ser enviada para lá.
const DOMINIO = process.env.RLS_EMAIL_DOMAIN || 'mailinator.com';

async function criarConta(rotulo, emailEnv, senhaEnv) {
  const cli = novoCliente();
  const email = process.env[emailEnv] || `rlstest-${rotulo}-${CARIMBO}@${DOMINIO}`;
  const senha = process.env[senhaEnv] || randomBytes(18).toString('base64url');

  let sessao = null;

  // Credenciais vieram do ambiente = conta já existe (criada à mão, com
  // "Auto Confirm User"). Vai direto ao login: tentar signUp aqui só
  // esbarraria no rate limit de e-mail quando "Confirm email" está ligado.
  if (process.env[emailEnv] && process.env[senhaEnv]) {
    const { data: login, error: erroLogin } = await cli.auth.signInWithPassword({ email, password: senha });
    if (erroLogin) {
      throw new Error(
        `Login falhou para a conta ${rotulo} (${email}): ${erroLogin.message}\n` +
          'Confira e-mail/senha e se o usuário está confirmado (Authentication → Users → coluna de confirmação).'
      );
    }
    sessao = login.session;
    return await resolverLoja(cli, sessao, rotulo, email, senha);
  }

  const { data: cadastro, error: erroCadastro } = await cli.auth.signUp({
    email,
    password: senha,
    options: { data: { nome_loja: `${MARCA} loja ${rotulo.toUpperCase()}`, nome: `Teste ${rotulo}` } },
  });

  if (erroCadastro) {
    // Diagnósticos acionáveis para os dois erros que aparecem na prática.
    if (/rate limit/i.test(erroCadastro.message)) {
      throw new Error(
        'O Supabase tentou ENVIAR e-mail de confirmação e bateu no limite (over_email_send_rate_limit).\n' +
          'Isso significa que "Confirm email" está LIGADO no projeto. Desligue em\n' +
          'Authentication → Providers → Email → Confirm email (README seção 13, passo 5) e rode de novo.\n' +
          'Com ele desligado nenhum e-mail é enviado e não há limite a estourar.'
      );
    }
    if (/invalid/i.test(erroCadastro.message) && /email/i.test(erroCadastro.message)) {
      throw new Error(
        `O Supabase recusou o domínio "${DOMINIO}" (email_address_invalid) — ele exige domínio com MX real.\n` +
          'Passe outro em RLS_EMAIL_DOMAIN=<dominio-com-mx> ou use RLS_A_EMAIL/RLS_B_EMAIL com contas prontas.'
      );
    }
    // Conta já existe (reuso via env) → tenta login.
    const { data: login, error: erroLogin } = await cli.auth.signInWithPassword({ email, password: senha });
    if (erroLogin) {
      throw new Error(`Não foi possível criar nem logar a conta ${rotulo}: ${erroCadastro.message} / ${erroLogin.message}`);
    }
    sessao = login.session;
  } else {
    sessao = cadastro.session;
    if (!sessao) {
      // signUp sem sessão = confirmação de e-mail ligada no projeto.
      const { data: login, error: erroLogin } = await cli.auth.signInWithPassword({ email, password: senha });
      if (erroLogin) {
        throw new Error(
          `Conta ${rotulo} criada mas sem sessão — a confirmação de e-mail está LIGADA no projeto.\n` +
            'Desligue em Authentication → Providers → Email → "Confirm email" (README seção 13, passo 5) ' +
            'ou passe RLS_*_EMAIL/RLS_*_PASSWORD de contas já confirmadas.'
        );
      }
      sessao = login.session;
    }
  }

  return await resolverLoja(cli, sessao, rotulo, email, senha);
}

// Resolve a loja do usuário logado. Sem linha em `usuarios` o trigger
// handle_new_user não rodou (ou rodou antes de a conta existir) — é erro
// de setup, não de RLS, e precisa aparecer como tal.
async function resolverLoja(cli, sessao, rotulo, email, senha) {
  const { data: usuario, error: erroUsuario } = await cli
    .from('usuarios')
    .select('loja_id')
    .eq('id', sessao.user.id)
    .maybeSingle();
  if (erroUsuario || !usuario?.loja_id) {
    throw new Error(
      `Conta ${rotulo} (${email}) sem loja vinculada: ${erroUsuario?.message || 'sem linha em usuarios'}\n` +
        'O trigger handle_new_user deveria criar a loja no signup. Confira se ele existe em auth.users.'
    );
  }
  return { cli, email, senha, userId: sessao.user.id, lojaId: usuario.loja_id };
}

// ── Runner genérico de uma tabela ────────────────────────────────────
// alvo = {
//   tabela, chave (default 'id'), campo (coluna mutável para o UPDATE),
//   valorAtaque (valor que A tenta gravar),
//   semear(cliB, lojaB, ctx) -> { id } | { pular: 'motivo' },
//   inserirComoA(lojaB, ctx) -> payload do INSERT cruzado
// }
async function testarTabela(alvo, A, B, ctx) {
  const { tabela, chave = 'id', campo, valorAtaque = `${MARCA}-INVADIDO` } = alvo;
  const r = { alvo: tabela, tipo: 'tabela', positivo: NA, select: NA, update: NA, delete: NA, insert: NA, anon: NA, veredito: INC, obs: '' };

  // ── semear como B ──
  let id;
  try {
    const semeado = await alvo.semear(B.cli, B.lojaId, ctx);
    if (semeado?.pular) {
      r.obs = semeado.pular;
      r.veredito = 'NÃO TESTADA';
      registrar(r);
      return null;
    }
    id = semeado.id;
  } catch (e) {
    r.obs = `falha ao semear: ${e.message}`;
    registrar(r);
    return null;
  }

  // ── 1. CONTROLE POSITIVO: B enxerga a própria linha ──
  const { data: proprio, error: erroProprio } = await B.cli.from(tabela).select(chave).eq(chave, id).maybeSingle();
  if (erroProprio || !proprio) {
    r.obs = `controle positivo falhou (B não vê a própria linha): ${erroProprio?.message || 'sem retorno'}`;
    registrar(r);
    return { id, ctx };
  }
  r.positivo = OK;

  let vazou = false;

  // ── 2a. SELECT cruzado ──
  const { data: lidoPorA } = await A.cli.from(tabela).select('*').eq(chave, id);
  if (lidoPorA && lidoPorA.length > 0) {
    r.select = VAZOU;
    vazou = true;
  } else {
    r.select = OK;
  }

  // ── 2b. UPDATE cruzado (verificado por releitura como B) ──
  if (campo) {
    const antes = await B.cli.from(tabela).select(campo).eq(chave, id).maybeSingle();
    await A.cli.from(tabela).update({ [campo]: valorAtaque }).eq(chave, id);
    const depois = await B.cli.from(tabela).select(campo).eq(chave, id).maybeSingle();
    const mudou = JSON.stringify(antes.data?.[campo]) !== JSON.stringify(depois.data?.[campo]);
    if (mudou) {
      r.update = VAZOU;
      vazou = true;
      // devolve o valor original para não deixar lixo alterado
      await B.cli.from(tabela).update({ [campo]: antes.data?.[campo] ?? null }).eq(chave, id);
    } else {
      r.update = OK;
    }
  }

  // ── 2c. DELETE cruzado (verificado por releitura como B) ──
  await A.cli.from(tabela).delete().eq(chave, id);
  const { data: sobreviveu } = await B.cli.from(tabela).select(chave).eq(chave, id).maybeSingle();
  if (!sobreviveu) {
    r.delete = VAZOU;
    vazou = true;
  } else {
    r.delete = OK;
  }

  // ── 3. INSERT como A com loja_id da B ──
  if (alvo.inserirComoA && sobreviveu) {
    const payload = alvo.inserirComoA(B.lojaId, ctx);
    const { data: inserido, error: erroInsert } = await A.cli.from(tabela).insert(payload).select(chave);
    if (!erroInsert && inserido?.length) {
      r.insert = VAZOU;
      vazou = true;
      await B.cli.from(tabela).delete().eq(chave, inserido[0][chave]); // limpa o que vazou
    } else {
      r.insert = OK;
    }
  }

  // ── 4. Cliente anônimo ──
  if (sobreviveu) {
    const anon = novoCliente();
    const { data: lidoAnon } = await anon.from(tabela).select('*').eq(chave, id);
    r.anon = lidoAnon && lidoAnon.length > 0 ? VAZOU : OK;
    if (r.anon === VAZOU) vazou = true;
  }

  r.veredito = vazou ? VAZOU : OK;
  registrar(r);
  return { id };
}

// ── Definição dos alvos (ordem importa: FK) ──────────────────────────
const hoje = new Date().toISOString().slice(0, 10);
const futuro = new Date(Date.now() + 36e5).toISOString();

const ALVOS = [
  {
    tabela: 'veiculos',
    campo: 'modelo',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli.from('veiculos').insert({ loja_id: loja, modelo: `${MARCA} veiculo`, placa: `${MARCA}` }).select('id').single();
      if (error) throw error;
      ctx.veiculoB = data.id;
      return { id: data.id };
    },
    inserirComoA: (loja) => ({ loja_id: loja, modelo: `${MARCA} invasao` }),
  },
  {
    tabela: 'vendas',
    campo: 'comprador_nome',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('vendas')
        .insert({ loja_id: loja, veiculo_id: ctx.veiculoB, valor_venda: 1, data_venda: hoje, comprador_nome: `${MARCA} comprador` })
        .select('id')
        .single();
      if (error) throw error;
      ctx.vendaB = data.id;
      return { id: data.id };
    },
    inserirComoA: (loja, ctx) => ({ loja_id: loja, veiculo_id: ctx.veiculoB, valor_venda: 1, data_venda: hoje }),
  },
  {
    tabela: 'nota_fiscal',
    campo: 'processing_message',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('nota_fiscal')
        .insert({ loja_id: loja, venda_id: ctx.vendaB, veiculo_id: ctx.veiculoB, integration_id: ctx.vendaB, processing_message: `${MARCA}` })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'preparacao_gastos',
    campo: 'descricao',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('preparacao_gastos')
        .insert({ loja_id: loja, veiculo_id: ctx.veiculoB, descricao: `${MARCA} gasto`, valor: 1 })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    inserirComoA: (loja, ctx) => ({ loja_id: loja, veiculo_id: ctx.veiculoB, descricao: `${MARCA} invasao` }),
  },
  {
    tabela: 'despesas',
    campo: 'descricao',
    semear: async (cli, loja) => {
      const { data, error } = await cli
        .from('despesas')
        .insert({ loja_id: loja, categoria: 'outra', mes_ref: hoje.slice(0, 8) + '01', descricao: `${MARCA} despesa` })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    inserirComoA: (loja) => ({ loja_id: loja, categoria: 'outra', mes_ref: hoje.slice(0, 8) + '01', descricao: `${MARCA} invasao` }),
  },
  {
    tabela: 'leads',
    campo: 'nome',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli.from('leads').insert({ loja_id: loja, nome: `${MARCA} lead` }).select('id').single();
      if (error) throw error;
      ctx.leadB = data.id;
      return { id: data.id };
    },
    inserirComoA: (loja) => ({ loja_id: loja, nome: `${MARCA} invasao` }),
  },
  {
    tabela: 'contato',
    campo: 'nome',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli.from('contato').insert({ loja_id: loja, lead_id: ctx.leadB, nome: `${MARCA} contato` }).select('id').single();
      if (error) throw error;
      ctx.contatoB = data.id;
      return { id: data.id };
    },
  },
  {
    tabela: 'conversa',
    campo: 'status',
    valorAtaque: 'fechada',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('conversa')
        .insert({ loja_id: loja, contato_id: ctx.contatoB, lead_id: ctx.leadB, canal: 'whatsapp' })
        .select('id')
        .single();
      if (error) throw error;
      ctx.conversaB = data.id;
      return { id: data.id };
    },
  },
  {
    tabela: 'mensagem',
    campo: 'conteudo',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('mensagem')
        .insert({ loja_id: loja, conversa_id: ctx.conversaB, direcao: 'entrada', conteudo: `${MARCA} mensagem` })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    inserirComoA: (loja, ctx) => ({ loja_id: loja, conversa_id: ctx.conversaB, direcao: 'saida', conteudo: `${MARCA} invasao` }),
  },
  {
    tabela: 'documentos',
    campo: 'cliente_nome',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('documentos')
        .insert({ loja_id: loja, tipo: 'recibo_sinal', veiculo_id: ctx.veiculoB, cliente_nome: `${MARCA} cliente` })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'veiculo_fotos',
    campo: 'url',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli.from('veiculo_fotos').insert({ loja_id: loja, veiculo_id: ctx.veiculoB, url: `${MARCA}.jpg` }).select('id').single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'veiculo_documento',
    campo: 'nome_arquivo',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('veiculo_documento')
        .insert({ loja_id: loja, veiculo_id: ctx.veiculoB, tipo: 'outro', nome_arquivo: `${MARCA}.pdf` })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'modelos_documento',
    campo: 'arquivo_url',
    semear: async (cli, loja) => {
      const { data, error } = await cli
        .from('modelos_documento')
        .insert({ loja_id: loja, tipo: `${MARCA}-tipo`, arquivo_url: `${MARCA}.docx` })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'contrato_modelo',
    campo: 'conteudo',
    semear: async (cli, loja) => {
      const { data, error } = await cli
        .from('contrato_modelo')
        .insert({ loja_id: loja, tipo: `${MARCA}-tipo`, conteudo: `${MARCA} conteudo` })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'regra_distribuicao',
    campo: 'tipo',
    valorAtaque: 'rodizio',
    semear: async (cli, loja) => {
      const { data, error } = await cli
        .from('regra_distribuicao')
        .insert({ loja_id: loja, canal: `${MARCA}-canal`, tipo: 'fixo' })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'canal_credencial',
    campo: 'status',
    valorAtaque: 'conectado',
    // unique(loja_id, canal) + FK para o catálogo: só semeia se a loja de
    // teste ainda não tiver credencial nesse canal (numa conta nova, nunca tem).
    semear: async (cli, loja) => {
      const { data: existente } = await cli.from('canal_credencial').select('id').eq('loja_id', loja).eq('canal', 'agregador').maybeSingle();
      if (existente) return { pular: 'já existe credencial no canal agregador — não sobrescrevo' };
      const { data, error } = await cli
        .from('canal_credencial')
        .insert({ loja_id: loja, canal: 'agregador', credenciais: { rlstest: true }, status: 'desconectado' })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
    inserirComoA: (loja) => ({ loja_id: loja, canal: 'instagram', credenciais: { rlstest: true } }),
  },
  {
    tabela: 'canal_mensageria_credencial',
    campo: 'status',
    valorAtaque: 'conectado',
    semear: async (cli, loja) => {
      const { data, error } = await cli
        .from('canal_mensageria_credencial')
        .insert({ loja_id: loja, canal: `${MARCA}-canal`, waba_id: MARCA })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'anuncio_publicacao',
    campo: 'mensagem_erro',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('anuncio_publicacao')
        .insert({ loja_id: loja, veiculo_id: ctx.veiculoB, canal: 'agregador', mensagem_erro: MARCA })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'publicacao_job',
    campo: 'status',
    valorAtaque: 'concluido',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('publicacao_job')
        .insert({ loja_id: loja, veiculo_id: ctx.veiculoB, canal: 'agregador', acao: 'publicar' })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'renave_registro',
    campo: 'protocolo',
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('renave_registro')
        .insert({ loja_id: loja, veiculo_id: ctx.veiculoB, evento: 'entrada', protocolo: MARCA })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'renave_job',
    campo: 'tentativas',
    valorAtaque: 999,
    semear: async (cli, loja, ctx) => {
      const { data, error } = await cli
        .from('renave_job')
        .insert({ loja_id: loja, veiculo_id: ctx.veiculoB, acao: 'consultar_status' })
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    tabela: 'oauth_state',
    chave: 'nonce',
    campo: 'expira_em',
    valorAtaque: futuro,
    semear: async (cli, loja) => {
      const nonce = `${MARCA}-${randomUUID()}`;
      const { error } = await cli.from('oauth_state').insert({ nonce, loja_id: loja, canal: 'agregador', expira_em: futuro });
      if (error) throw error;
      return { id: nonce };
    },
    inserirComoA: (loja) => ({ nonce: `${MARCA}-${randomUUID()}`, loja_id: loja, canal: 'olx', expira_em: futuro }),
  },
  // ── Singletons por loja: a linha É a loja de teste (criada pelo signup
  //    do próprio script), então UPDATE/DELETE são seguros aqui.
  {
    tabela: 'loja_config',
    chave: 'loja_id',
    campo: 'assinatura_nome',
    semear: async (cli, loja) => {
      const { error } = await cli.from('loja_config').insert({ loja_id: loja, assinatura_nome: `${MARCA} assinatura` });
      if (error) throw error;
      return { id: loja };
    },
    inserirComoA: (loja) => ({ loja_id: loja, assinatura_nome: `${MARCA} invasao` }),
  },
  {
    tabela: 'loja_plano',
    chave: 'loja_id',
    campo: 'plano',
    semear: async (cli, loja) => {
      const { error } = await cli.from('loja_plano').insert({ loja_id: loja, plano: `${MARCA}` });
      if (error) throw error;
      return { id: loja };
    },
    inserirComoA: (loja) => ({ loja_id: loja, plano: `${MARCA} invasao` }),
  },
  // NOVA desde 0026 (01-02/09/2026): policy dupla (loja_id = loja_do_usuario()
  // AND usuario_e_dono()). As duas contas de teste nascem 'dono' (handle_new_user),
  // então o eixo loja cruza normal aqui; o eixo papel já foi testado à parte em
  // scripts/protecao-papel-compra.mjs (31/08). Sem inserirComoA: veiculo_id é PK +
  // FK composta (veiculo_id, loja_id) -> veiculos(id, loja_id) — um payload com
  // loja_id da B e veiculo_id de A já falharia por violação de FK, não por RLS;
  // não dá pra isolar o que travou sem forjar um cenário que não existe de verdade.
  {
    tabela: 'veiculo_valor_compra',
    chave: 'veiculo_id',
    campo: 'compra',
    valorAtaque: 999999,
    semear: async (cli, loja, ctx) => {
      const { error } = await cli.from('veiculo_valor_compra').insert({ veiculo_id: ctx.veiculoB, loja_id: loja, compra: 1 });
      if (error) throw error;
      return { id: ctx.veiculoB };
    },
  },
];

// ── Tabelas criadas pelo trigger (não semeadas por insert) ───────────
// lojas e usuarios não têm policy de INSERT/DELETE: o esperado é que o
// DELETE cruzado seja NEGADO e o INSERT também. A linha pertence a uma
// loja de teste, então testar é seguro.
async function testarFundacao(A, B) {
  for (const [tabela, chave, campo, payloadInsert] of [
    ['lojas', 'id', 'nome', { nome: `${MARCA} loja forjada` }],
    ['usuarios', 'id', 'nome', null],
  ]) {
    const id = tabela === 'lojas' ? B.lojaId : B.userId;
    const r = { alvo: `${tabela} (trigger)`, tipo: 'tabela', positivo: NA, select: NA, update: NA, delete: NA, insert: NA, anon: NA, veredito: INC, obs: 'sem policy de INSERT/DELETE — ambos devem ser negados' };

    const { data: proprio } = await B.cli.from(tabela).select(chave).eq(chave, id).maybeSingle();
    if (!proprio) {
      r.obs = 'controle positivo falhou (B não vê a própria linha)';
      registrar(r);
      continue;
    }
    r.positivo = OK;
    let vazou = false;

    const { data: lidoA } = await A.cli.from(tabela).select('*').eq(chave, id);
    r.select = lidoA?.length ? ((vazou = true), VAZOU) : OK;

    const antes = await B.cli.from(tabela).select(campo).eq(chave, id).maybeSingle();
    await A.cli.from(tabela).update({ [campo]: `${MARCA}-INVADIDO` }).eq(chave, id);
    const depois = await B.cli.from(tabela).select(campo).eq(chave, id).maybeSingle();
    if (antes.data?.[campo] !== depois.data?.[campo]) {
      r.update = VAZOU;
      vazou = true;
      await B.cli.from(tabela).update({ [campo]: antes.data?.[campo] ?? null }).eq(chave, id);
    } else {
      r.update = OK;
    }

    await A.cli.from(tabela).delete().eq(chave, id);
    const { data: sobreviveu } = await B.cli.from(tabela).select(chave).eq(chave, id).maybeSingle();
    r.delete = sobreviveu ? OK : ((vazou = true), VAZOU);

    if (payloadInsert) {
      const { data: ins, error: err } = await A.cli.from(tabela).insert(payloadInsert).select('id');
      r.insert = !err && ins?.length ? ((vazou = true), VAZOU) : OK;
    }

    const anon = novoCliente();
    const { data: lidoAnon } = await anon.from(tabela).select('*').eq(chave, id);
    r.anon = lidoAnon?.length ? ((vazou = true), VAZOU) : OK;

    r.veredito = vazou ? VAZOU : OK;
    registrar(r);
  }
}

// ── integracao_evento: policy só de SELECT (não dá para semear) ──────
async function testarIntegracaoEvento(A, B) {
  const r = {
    alvo: 'integracao_evento',
    tipo: 'tabela',
    positivo: INC,
    select: NA,
    update: NA,
    delete: NA,
    insert: NA,
    anon: NA,
    veredito: INC,
    obs: 'policy é só SELECT: o cliente não consegue semear (escrita é service_role). Testado só que a escrita é negada.',
  };
  const { error: erroA } = await A.cli.from('integracao_evento').insert({ canal: 'agregador', loja_id: B.lojaId, payload: { rlstest: true } });
  r.insert = erroA ? OK : VAZOU;
  if (!erroA) r.veredito = VAZOU;

  const anon = novoCliente();
  const { data: lidoAnon } = await anon.from('integracao_evento').select('*').limit(1);
  r.anon = lidoAnon?.length ? VAZOU : OK;
  if (lidoAnon?.length) r.veredito = VAZOU;

  registrar(r);
}

// ── canal: catálogo global (leitura livre, escrita negada) ───────────
async function testarCanal(A) {
  const r = { alvo: 'canal (catálogo global)', tipo: 'tabela', positivo: NA, select: NA, update: NA, delete: NA, insert: NA, anon: NA, veredito: INC, obs: 'global por desenho: leitura livre. O teste é a escrita ser negada.' };
  const { data: lido } = await A.cli.from('canal').select('chave').limit(1);
  r.positivo = lido?.length ? OK : INC;
  r.select = NA;

  const { data: ins, error: err } = await A.cli.from('canal').insert({ chave: `${MARCA}-canal`, nome: MARCA }).select('chave');
  r.insert = !err && ins?.length ? VAZOU : OK;
  if (!err && ins?.length) await A.cli.from('canal').delete().eq('chave', `${MARCA}-canal`);

  const { error: errUpd } = await A.cli.from('canal').update({ nome: `${MARCA}-INVADIDO` }).eq('chave', 'olx');
  const { data: conferir } = await A.cli.from('canal').select('nome').eq('chave', 'olx').maybeSingle();
  r.update = conferir?.nome === `${MARCA}-INVADIDO` ? VAZOU : OK;
  if (r.update === VAZOU) await A.cli.from('canal').update({ nome: 'OLX' }).eq('chave', 'olx');

  r.veredito = [r.insert, r.update].includes(VAZOU) ? VAZOU : OK;
  registrar(r);
}

// ── view veiculos_funcionario (security_invoker) ─────────────────────
async function testarView(A, B, ctx) {
  const r = { alvo: 'veiculos_funcionario (view)', tipo: 'view', positivo: NA, select: NA, update: NA, delete: NA, insert: NA, anon: NA, veredito: INC, obs: 'security_invoker=true → deve herdar o RLS de veiculos' };
  const { data: proprio } = await B.cli.from('veiculos_funcionario').select('id').eq('id', ctx.veiculoB).maybeSingle();
  if (!proprio) {
    r.obs += ' | controle positivo falhou';
    registrar(r);
    return;
  }
  r.positivo = OK;
  const { data: lidoA } = await A.cli.from('veiculos_funcionario').select('*').eq('id', ctx.veiculoB);
  r.select = lidoA?.length ? VAZOU : OK;
  const anon = novoCliente();
  const { data: lidoAnon } = await anon.from('veiculos_funcionario').select('*').eq('id', ctx.veiculoB);
  r.anon = lidoAnon?.length ? VAZOU : OK;
  r.veredito = [r.select, r.anon].includes(VAZOU) ? VAZOU : OK;
  registrar(r);
}

// ── FK cruzada: loja_id próprio + filho apontando para linha alheia ──
// O RLS valida só `loja_id = loja_do_usuario()`; nada checa se o pai
// pertence à mesma loja. Não vaza leitura, mas corrompe integridade
// entre tenants e serve de oráculo de existência de UUID.
async function testarFkCruzada(A, B, ctx) {
  const casos = [
    ['vendas.veiculo_id', 'vendas', (loja) => ({ loja_id: loja, veiculo_id: ctx.veiculoB, valor_venda: 1, data_venda: hoje, comprador_nome: `${MARCA} fk` })],
    ['preparacao_gastos.veiculo_id', 'preparacao_gastos', (loja) => ({ loja_id: loja, veiculo_id: ctx.veiculoB, descricao: `${MARCA} fk` })],
    ['veiculo_documento.veiculo_id', 'veiculo_documento', (loja) => ({ loja_id: loja, veiculo_id: ctx.veiculoB, tipo: 'outro', nome_arquivo: `${MARCA} fk` })],
    ['renave_registro.veiculo_id', 'renave_registro', (loja) => ({ loja_id: loja, veiculo_id: ctx.veiculoB, evento: 'saida', protocolo: `${MARCA} fk` })],
    ['contato.lead_id', 'contato', (loja) => ({ loja_id: loja, lead_id: ctx.leadB, nome: `${MARCA} fk` })],
    ['mensagem.conversa_id', 'mensagem', (loja) => ({ loja_id: loja, conversa_id: ctx.conversaB, direcao: 'saida', conteudo: `${MARCA} fk` })],
    ['vendas.vendedor_id', 'vendas', (loja) => ({ loja_id: loja, veiculo_id: ctx.veiculoA, valor_venda: 1, data_venda: hoje, vendedor_id: B.userId, comprador_nome: `${MARCA} fk` })],
  ];

  for (const [rotulo, tabela, montar] of casos) {
    const r = { alvo: rotulo, tipo: 'FK cruzada', positivo: NA, select: NA, update: NA, delete: NA, insert: NA, anon: NA, veredito: INC, obs: 'A insere com o PRÓPRIO loja_id apontando para linha da B' };
    const { data, error } = await A.cli.from(tabela).insert(montar(A.lojaId)).select('id');
    if (!error && data?.length) {
      r.insert = VAZOU;
      r.veredito = VAZOU;
      await A.cli.from(tabela).delete().eq('id', data[0].id);
    } else {
      r.insert = OK;
      r.veredito = OK;
      r.obs += ` | recusado: ${error?.message?.slice(0, 60) || 'sem retorno'}`;
    }
    registrar(r);
  }
}

// ── Storage ──────────────────────────────────────────────────────────
async function testarStorage(A, B) {
  const buckets = ['notas-fiscais', 'fotos-veiculos', 'docs-veiculos', 'logos-lojas', 'assinaturas']; // assinaturas: novo desde 0028 (01/09/2026)
  const conteudo = new Blob([`${MARCA} arquivo de teste`], { type: 'text/plain' });

  for (const bucket of buckets) {
    const caminho = `${B.lojaId}/${MARCA}.txt`;
    const r = { alvo: `storage/${bucket}`, tipo: 'storage', positivo: NA, select: NA, update: NA, delete: NA, insert: NA, anon: NA, veredito: INC, obs: 'path <loja_id>/… ; download autenticado (URL assinada é exposição aceita — ADR-18)' };

    const { error: erroUp } = await B.cli.storage.from(bucket).upload(caminho, conteudo, { upsert: true });
    if (erroUp) {
      r.obs = `falha ao semear: ${erroUp.message}`;
      registrar(r);
      continue;
    }

    // controle positivo: B lista e baixa o próprio arquivo
    const { data: listaB } = await B.cli.storage.from(bucket).list(B.lojaId);
    const { data: baixaB, error: erroBaixaB } = await B.cli.storage.from(bucket).download(caminho);
    r.positivo = listaB?.some((f) => f.name === `${MARCA}.txt`) && baixaB && !erroBaixaB ? OK : INC;

    if (r.positivo === OK) {
      const { data: listaA } = await A.cli.storage.from(bucket).list(B.lojaId);
      const viuNaLista = !!listaA?.some((f) => f.name === `${MARCA}.txt`);
      const { data: baixaA, error: erroBaixaA } = await A.cli.storage.from(bucket).download(caminho);
      const baixou = !!baixaA && !erroBaixaA;
      r.select = viuNaLista || baixou ? VAZOU : OK;

      const { error: erroDelA } = await A.cli.storage.from(bucket).remove([caminho]);
      const { data: aindaLa } = await B.cli.storage.from(bucket).list(B.lojaId);
      r.delete = aindaLa?.some((f) => f.name === `${MARCA}.txt`) ? OK : VAZOU;
      if (!erroDelA && r.delete === VAZOU) r.obs += ' | DELETE cruzado apagou o arquivo';

      const { error: erroUpA } = await A.cli.storage.from(bucket).upload(`${B.lojaId}/${MARCA}-invasao.txt`, conteudo);
      r.insert = erroUpA ? OK : VAZOU;
      if (!erroUpA) await B.cli.storage.from(bucket).remove([`${B.lojaId}/${MARCA}-invasao.txt`]);

      const anon = novoCliente();
      const { data: baixaAnon, error: erroAnon } = await anon.storage.from(bucket).download(caminho);
      r.anon = baixaAnon && !erroAnon ? VAZOU : OK;

      r.veredito = [r.select, r.delete, r.insert, r.anon].includes(VAZOU) ? VAZOU : OK;
    }

    await B.cli.storage.from(bucket).remove([caminho]);
    registrar(r);
  }
}

// ── Limpeza ──────────────────────────────────────────────────────────
async function limpar(B, ctx) {
  const ordem = [
    ['nota_fiscal', 'integration_id', ctx.vendaB],
    ['mensagem', 'conteudo', `${MARCA} mensagem`],
    ['conversa', 'id', ctx.conversaB],
    ['contato', 'id', ctx.contatoB],
    ['anuncio_publicacao', 'mensagem_erro', MARCA],
    ['publicacao_job', 'veiculo_id', ctx.veiculoB],
    ['renave_registro', 'veiculo_id', ctx.veiculoB],
    ['renave_job', 'veiculo_id', ctx.veiculoB],
    ['preparacao_gastos', 'veiculo_id', ctx.veiculoB],
    ['veiculo_documento', 'veiculo_id', ctx.veiculoB],
    ['veiculo_fotos', 'veiculo_id', ctx.veiculoB],
    ['documentos', 'veiculo_id', ctx.veiculoB],
    ['vendas', 'veiculo_id', ctx.veiculoB],
    ['leads', 'id', ctx.leadB],
    ['veiculos', 'id', ctx.veiculoB],
  ];
  for (const [tabela, coluna, valor] of ordem) {
    if (valor == null) continue;
    await B.cli.from(tabela).delete().eq(coluna, valor);
  }
  // marcados por prefixo
  await B.cli.from('modelos_documento').delete().eq('tipo', `${MARCA}-tipo`);
  await B.cli.from('contrato_modelo').delete().eq('tipo', `${MARCA}-tipo`);
  await B.cli.from('regra_distribuicao').delete().eq('canal', `${MARCA}-canal`);
  await B.cli.from('canal_mensageria_credencial').delete().eq('canal', `${MARCA}-canal`);
  await B.cli.from('canal_credencial').delete().eq('canal', 'agregador').eq('loja_id', B.lojaId);
  await B.cli.from('oauth_state').delete().like('nonce', `${MARCA}%`);
  await B.cli.from('loja_config').delete().eq('loja_id', B.lojaId);
  await B.cli.from('loja_plano').delete().eq('loja_id', B.lojaId);
}

// ── Relatório ────────────────────────────────────────────────────────
function imprimirRelatorio() {
  const cab = ['alvo', 'tipo', 'positivo', 'SELECT', 'UPDATE', 'DELETE', 'INSERT', 'anônimo', 'veredito'];
  const corpo = linhas.map((l) => [l.alvo, l.tipo, l.positivo, l.select, l.update, l.delete, l.insert, l.anon, l.veredito]);

  console.log('\n| ' + cab.join(' | ') + ' |');
  console.log('|' + cab.map(() => '---').join('|') + '|');
  for (const c of corpo) console.log('| ' + c.join(' | ') + ' |');

  const passou = linhas.filter((l) => l.veredito === OK).length;
  const vazou = linhas.filter((l) => l.veredito === VAZOU).length;
  const inconclusivos = linhas.filter((l) => l.veredito === INC || l.veredito === 'NÃO TESTADA');

  console.log(`\nPASSOU: ${passou}   VAZOU: ${vazou}   INCONCLUSIVO/NÃO TESTADA: ${inconclusivos.length}`);
  for (const i of inconclusivos) console.log(`  - ${i.alvo}: ${i.obs || 'sem detalhe'}`);
  const comObs = linhas.filter((l) => l.obs && !inconclusivos.includes(l));
  if (comObs.length) {
    console.log('\nObservações:');
    for (const o of comObs) console.log(`  - ${o.alvo}: ${o.obs}`);
  }
  return { passou, vazou, inconclusivos: inconclusivos.length };
}

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
  console.log(`Projeto: ${URL}`);
  console.log(`Marca desta rodada: ${MARCA}\n`);

  const A = await criarConta('a', 'RLS_A_EMAIL', 'RLS_A_PASSWORD');
  const B = await criarConta('b', 'RLS_B_EMAIL', 'RLS_B_PASSWORD');
  if (A.lojaId === B.lojaId) throw new Error('As duas contas caíram na MESMA loja — o teste não faz sentido. Verifique o trigger handle_new_user.');
  console.log(`loja A: ${A.lojaId}\nloja B: ${B.lojaId}\n`);

  const ctx = {};
  // um veículo na loja A também, para o caso vendas.vendedor_id
  const { data: veicA } = await A.cli.from('veiculos').insert({ loja_id: A.lojaId, modelo: `${MARCA} veiculo A` }).select('id').single();
  ctx.veiculoA = veicA?.id;

  try {
    for (const alvo of ALVOS) await testarTabela(alvo, A, B, ctx);
    await testarFundacao(A, B);
    await testarIntegracaoEvento(A, B);
    await testarCanal(A);
    await testarView(A, B, ctx);
    await testarFkCruzada(A, B, ctx);
    await testarStorage(A, B);
  } finally {
    await limpar(B, ctx);
    if (ctx.veiculoA) await A.cli.from('veiculos').delete().eq('id', ctx.veiculoA);
  }

  const resumo = imprimirRelatorio();

  console.log('\nRESÍDUO — apagar à mão no painel (Authentication → Users):');
  console.log(`  ${A.email}`);
  console.log(`  ${B.email}`);
  console.log('(a anon key não apaga usuário do auth nem linha de lojas/usuarios — não há policy de DELETE, de propósito)');

  process.exit(resumo.vazou > 0 ? 1 : 0);
})().catch((e) => {
  console.error('\nERRO:', e.message);
  process.exit(2);
});
