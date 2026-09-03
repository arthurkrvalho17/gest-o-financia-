// ═════════════════════════════════════════════════════════════════════════
// ⚠️  ALERTA — NÃO EXISTE SANDBOX NA RENAVE FÁCIL.
//
// QUALQUER chamada feita por este arquivo bate no ambiente REAL de produção
// (https://api.renavefacil.net/v2/integration), com o CNPJ real do
// estabelecimento. Não há ambiente de homologação, não há "modo teste", não
// há como desfazer um envio pedindo pra ignorar.
//
// É o mesmo tipo de risco que a `spedy-api` carrega ao emitir nota com
// validade fiscal REAL — só que lá existe sandbox e aqui NÃO. Trate cada
// execução como um envio de dado cadastral verdadeiro a uma integradora
// ligada ao RENAVE.
//
// Consequências práticas registradas na doc deles:
//   · é PROIBIDO envio em massa ("o envio deve ser sob demanda") — por isso
//     toda ação aqui exige um `veiculo_id` específico (guard anti-massa);
//   · cadastro sem processo RENAVE aberto por >90 dias é APAGADO da base
//     deles — cadastrar "por precaução" não ajuda, atrapalha.
//
// Nenhum teste automatizado deste repositório chama a rede: `index.test.ts`
// trava o `fetch` global e injeta env por `__RENAVE_TEST_ENV__`.
// ═════════════════════════════════════════════════════════════════════════
//
// Edge Function: integração com a Renave Fácil (RENAVE — ADR-16, revisado
// 02/09/2026). Etapa 2 (Fase B): a função que o `conectorRenave.js` chama.
//
// O QUE ESTA FUNÇÃO FAZ (e o que não faz): alimenta cadastro (cliente e
// veículo), envia a chave de NF-e já emitida (compra/venda/transferência) e
// espelha o que a Renave Fácil expõe só leitura (status e documentos). O
// Financia+ NÃO abre, não acompanha e não assina processo RENAVE — isso é no
// painel da própria integradora. Por isso, em NENHUMA mensagem, log ou
// retorno daqui aparece "registrado no RENAVE": o vocabulário é "enviado à
// Renave Fácil" (ver TEXTO_ENVIADO em _shared/renaveCore.ts).
//
// Ações (action no body — mesmo padrão da spedy-api):
//   sincronizar_cliente       → POST/PUT /dms/{cnpj}/client[/{cpfCnpj}]
//   sincronizar_veiculo       → POST/PUT /dms/{cnpj}/vehicle[/{chassi}/{tipo}]
//   enviar_nfe_compra         → POST /dms/{cnpj}/vehicle/nfe/purchase
//   enviar_nfe_venda          → POST /dms/{cnpj}/vehicle/nfe/sales
//   enviar_nfe_transferencia  → POST /dms/{cnpj}/vehicle/nfe/transfer
//   consultar_status          → GET  /renave/{cnpj}/docs/status?placa=&renavam=
//   baixar_documento          → GET  /renave/{cnpj}/docs/atpve/entrada|atpve/saida|crlve
//
// SEGURANÇA — as três regras que não se negociam nesta função:
//   1. `loja_id` vem SEMPRE do JWT do usuário logado (usuarios.loja_id),
//      NUNCA do body. Resolver loja pelo body fura o RLS: qualquer usuário
//      autenticado passaria a operar sobre a loja de outro.
//   2. `cnpjEstabelecimento` é lido de `lojas` a partir desse loja_id —
//      nunca do body. Aceitar CNPJ do cliente é a mesma falha da regra 1
//      por outro caminho.
//   3. A apiKey vive só no secret RENAVE_PARTNER_API_KEY e é lida em UM
//      lugar (`resolverCredencial`) — nunca no front, nunca em
//      `canal_credencial` (que é legível pelo browser via RLS).
//
// Todo identificador de veículo (placa, renavam, chassi) é lido do banco a
// partir do `veiculo_id`, com o `loja_id` do JWT no filtro — o body não
// escolhe sobre qual carro se opera.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  RENAVE_API_URL_PADRAO,
  RENAVE_TIMEZONE_PADRAO,
  TEXTO_ENVIADO,
  apenasDigitos,
  camposCompraFaltando,
  camposVeiculoFaltando,
  camposVendedorOrigemFaltando,
  formatarDtHrProcesso,
  mensagemCamposFaltando,
  montarPayloadCliente,
  montarPayloadNfe,
  montarPayloadVeiculo,
  normalizarUrlBase,
  resolverEvento,
  resolverTipoVeiculo,
  rotaDocumento,
  textoEnviado,
  ROTA_NFE,
  type AcaoNfe,
} from '../_shared/renaveCore.ts';

// typeof Deno !== 'undefined': este módulo é importado direto pelos testes
// vitest (guards e retry, sem tocar a Renave Fácil real) — fora do Deno os
// secrets não existem e o teste injeta o que precisar por
// globalThis.__RENAVE_TEST_ENV__. Mesmo padrão já usado na spedy-api.
const temDeno = typeof Deno !== 'undefined';

function envGet(nome: string): string | undefined {
  return temDeno ? Deno.env.get(nome) : (globalThis as any).__RENAVE_TEST_ENV__?.[nome];
}

// URL base configurável por env, com DEFAULT DE PRODUÇÃO — porque produção é
// o único ambiente que existe (ver alerta no topo). O env serve para apontar
// para um proxy/mock em investigação, nunca para "um sandbox" que não há.
// Função, não const no import, para o teste conseguir variar o valor.
function renaveApiUrl(): string {
  return normalizarUrlBase(envGet('RENAVE_API_URL') || RENAVE_API_URL_PADRAO);
}

function renaveTimezone(): string {
  return envGet('RENAVE_TIMEZONE') || RENAVE_TIMEZONE_PADRAO;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

type RespostaRenave = { ok: boolean; status: number; data: any; erroRede?: string };

// Nunca lança: uma queda de rede tem que virar auditoria em renave_registro
// (regra 5), não exceção não tratada. status 0 = nem chegou a haver resposta.
async function chamarRenave(
  caminho: string,
  apiKey: string,
  method = 'GET',
  body: unknown = null,
): Promise<RespostaRenave> {
  let res: Response;
  try {
    res = await fetch(`${renaveApiUrl()}${caminho}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const motivo = (e as Error)?.message || String(e);
    return {
      ok: false,
      status: 0,
      data: { erro_rede: motivo },
      erroRede: `Não foi possível falar com a Renave Fácil (${motivo}). Nada foi ${TEXTO_ENVIADO}; tente de novo em instantes.`,
    };
  }

  // A doc não garante JSON em toda rota (as de documento podem devolver
  // outra coisa) — o texto cru é preservado em vez de virar {} silencioso.
  const bruto = await res.text().catch(() => '');
  let data: any;
  try {
    data = bruto ? JSON.parse(bruto) : {};
  } catch {
    data = { conteudo: bruto, formato: 'texto' };
  }
  return { ok: res.ok, status: res.status, data };
}

// ── Credencial (regra 3) ──────────────────────────────────────────────────
// ÚNICO ponto do sistema que lê a chave da Renave Fácil. Está isolado de
// propósito: ainda NÃO está confirmado se a Renave Fácil trabalha com uma
// chave de PARCEIRO (uma só, do Financia+, modelo Owner igual à Spedy — é o
// que o ADR-16 assume hoje) ou com uma chave POR LOJA. Se virar por loja,
// só esta função muda.
//
// O que NÃO pode mudar em nenhuma das hipóteses: a chave não vai para
// `canal_credencial`. Aquela coluna é legível pelo browser via RLS (achado
// já registrado no trabalho de 27/08 sobre o Mercado Livre) — guardar chave
// lá é equivalente a publicá-la no front.
async function resolverCredencial(
  _admin: ReturnType<typeof createClient>,
  _lojaId: string,
): Promise<{ apiKey?: string; erro?: string }> {
  const apiKey = envGet('RENAVE_PARTNER_API_KEY');
  if (!apiKey) {
    return { erro: 'RENAVE_PARTNER_API_KEY não configurado — a integração com a Renave Fácil está indisponível.' };
  }
  return { apiKey };
}

// ── Estabelecimento (regra 2) ─────────────────────────────────────────────
// cnpjEstabelecimento SEMPRE de `lojas`, pelo loja_id do JWT.
async function resolverEstabelecimento(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
): Promise<{ cnpj?: string; erro?: string }> {
  const { data: loja } = await admin.from('lojas').select('cnpj').eq('id', lojaId).maybeSingle();
  const cnpj = apenasDigitos(loja?.cnpj);
  if (!cnpj) {
    return { erro: 'A loja não tem CNPJ cadastrado — sem ele não é possível identificar o estabelecimento na Renave Fácil.' };
  }
  return { cnpj };
}

// ── Contexto comum + guard anti-envio-em-massa ────────────────────────────
type Contexto = { veiculo: Record<string, any>; cnpj: string; apiKey: string };

// A doc da Renave Fácil proíbe envio em massa e apaga cadastro sem processo
// aberto depois de 90 dias. Traduzido em código: NENHUMA ação existe sem
// `veiculo_id`. Não há (nem pode haver) "sincronizar o estoque inteiro" —
// a ausência dessa capacidade é a feature.
async function abrirContexto(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  body: Record<string, any>,
): Promise<{ erro?: Response; ctx?: Contexto }> {
  const veiculoId = body?.veiculo_id || body?.veiculoId;
  if (!veiculoId) {
    return {
      erro: json(400, {
        erro: 'veiculo_id é obrigatório.',
        mensagem:
          'Toda ação da Renave Fácil precisa estar atrelada a um veículo específico — ' +
          'a integradora proíbe envio em massa de dados (o envio deve ser sob demanda).',
      }),
    };
  }

  // loja_id do JWT no filtro: veículo de outra loja simplesmente não existe
  // para esta chamada, mesmo com o service role no cliente.
  const { data: veiculo } = await admin
    .from('veiculos')
    .select('*')
    .eq('id', veiculoId)
    .eq('loja_id', lojaId)
    .maybeSingle();
  if (!veiculo) return { erro: json(404, { erro: 'Veículo não encontrado nesta loja.' }) };

  const estab = await resolverEstabelecimento(admin, lojaId);
  if (estab.erro) return { erro: json(409, { erro: estab.erro }) };

  const cred = await resolverCredencial(admin, lojaId);
  if (cred.erro) return { erro: json(500, { erro: cred.erro }) };

  return { ctx: { veiculo, cnpj: estab.cnpj!, apiKey: cred.apiKey! } };
}

// ── Auditoria (regra 5) ───────────────────────────────────────────────────
// TODA resposta bruta da integradora vai para renave_registro.dados, igual ao
// que a spedy-api faz com a nota. As respostas são acumuladas por ação (em
// vez de sobrescritas) para a auditoria não perder o passo anterior — um
// envio de NF-e que só funcionou depois do recadastro do veículo tem duas
// respostas que importam.
//
// NOTA SOBRE `status`: o CHECK da 0017 só aceita
// 'pendente'|'registrado'|'erro'|'cancelado'. 'registrado' aqui significa
// "a CHAMADA que fizemos foi aceita" (é o que a 0029 documenta: eixo interno,
// diferente de `situacao`) — NUNCA "registrado no RENAVE". Por isso o valor
// não vaza para a resposta HTTP: o retorno fala em "enviado à Renave Fácil".
async function gravarRegistro(
  admin: ReturnType<typeof createClient>,
  args: {
    lojaId: string;
    veiculoId: string;
    evento: 'entrada' | 'saida';
    acao: string;
    resposta: RespostaRenave;
    campos?: Record<string, unknown>;
    mensagemErro?: string | null;
  },
) {
  const { data: atual } = await admin
    .from('renave_registro')
    .select('*')
    .eq('veiculo_id', args.veiculoId)
    .eq('evento', args.evento)
    .maybeSingle();

  const dados = {
    ...(atual?.dados || {}),
    [args.acao]: {
      em: new Date().toISOString(),
      status_http: args.resposta.status,
      resposta: args.resposta.data,
    },
  };

  await admin.from('renave_registro').upsert(
    {
      loja_id: args.lojaId,
      veiculo_id: args.veiculoId,
      evento: args.evento,
      status: args.resposta.ok ? 'registrado' : 'erro',
      mensagem_erro: args.mensagemErro ? String(args.mensagemErro).slice(0, 1000) : null,
      dados,
      atualizado_em: new Date().toISOString(),
      ...(args.campos || {}),
    },
    { onConflict: 'veiculo_id,evento' },
  );
}

// Mensagem de falha vinda da integradora, sem inventar motivo que ela não deu.
function motivoRecusa(resposta: RespostaRenave): string {
  if (resposta.erroRede) return resposta.erroRede;
  const d = resposta.data;
  const bruto =
    d?.mensagem ||
    d?.message ||
    d?.erro ||
    d?.error ||
    (Array.isArray(d?.errors) ? d.errors.map((e: any) => e?.message || e).join('; ') : '') ||
    (typeof d?.conteudo === 'string' ? d.conteudo : '') ||
    '';
  const detalhe = String(bruto).trim().slice(0, 500);
  return detalhe
    ? `A Renave Fácil recusou (HTTP ${resposta.status}): ${detalhe}`
    : `A Renave Fácil recusou a chamada (HTTP ${resposta.status}, sem detalhe na resposta).`;
}

// ── Ação: sincronizar_cliente ─────────────────────────────────────────────
// O "cliente" da Renave Fácil no fluxo de COMPRA é o vendedor de origem do
// veículo (colunas vendedor_origem_* da 0030). Os dados vêm do banco, não do
// body: quem escolhe o que é enviado é o cadastro, não o navegador.
export async function sincronizarCliente(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  body: Record<string, any>,
) {
  const { erro, ctx } = await abrirContexto(admin, lojaId, body);
  if (erro) return erro;
  const { veiculo, cnpj, apiKey } = ctx!;

  const faltando = camposVendedorOrigemFaltando(veiculo);
  if (faltando.length) {
    return json(400, {
      erro: 'campos_obrigatorios_faltando',
      campos_faltando: faltando,
      mensagem: mensagemCamposFaltando(faltando),
    });
  }

  const payload = montarPayloadCliente(veiculo);
  const cpfCnpj = payload.cpfCnpj as string;
  // POST cria, PUT atualiza — quem chama sabe qual dos dois é o caso; não
  // dá para descobrir isso sozinho sem uma consulta que a doc não expõe.
  const atualizar = body?.atualizar === true;
  const caminho = atualizar ? `/dms/${cnpj}/client/${cpfCnpj}` : `/dms/${cnpj}/client`;

  const resposta = await chamarRenave(caminho, apiKey, atualizar ? 'PUT' : 'POST', payload);
  const evento = resolverEvento('sincronizar_cliente', body?.evento);
  const mensagemErro = resposta.ok ? null : motivoRecusa(resposta);
  await gravarRegistro(admin, {
    lojaId,
    veiculoId: veiculo.id,
    evento,
    acao: 'sincronizar_cliente',
    resposta,
    mensagemErro,
  });

  if (!resposta.ok) return json(resposta.status || 502, { erro: mensagemErro });
  return json(200, { ok: true, mensagem: `Cadastro do vendedor de origem ${TEXTO_ENVIADO}.` });
}

// ── Ação: sincronizar_veiculo ─────────────────────────────────────────────
export async function sincronizarVeiculo(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  body: Record<string, any>,
) {
  const { erro, ctx } = await abrirContexto(admin, lojaId, body);
  if (erro) return erro;
  const { veiculo, cnpj, apiKey } = ctx!;

  let tipoVeiculo: 'N' | 'U';
  try {
    tipoVeiculo = resolverTipoVeiculo(body?.tipoVeiculo ?? body?.tipo_veiculo);
  } catch (e) {
    return json(400, { erro: (e as Error).message });
  }

  const faltando = camposVeiculoFaltando(veiculo);
  if (faltando.length) {
    return json(400, {
      erro: 'campos_obrigatorios_faltando',
      campos_faltando: faltando,
      mensagem: mensagemCamposFaltando(faltando),
    });
  }

  const resposta = await enviarCadastroVeiculo(veiculo, tipoVeiculo, cnpj, apiKey, body?.atualizar === true);
  const evento = resolverEvento('sincronizar_veiculo', body?.evento);
  const mensagemErro = resposta.ok ? null : motivoRecusa(resposta);
  await gravarRegistro(admin, {
    lojaId,
    veiculoId: veiculo.id,
    evento,
    acao: 'sincronizar_veiculo',
    resposta,
    mensagemErro,
  });

  if (!resposta.ok) return json(resposta.status || 502, { erro: mensagemErro });
  return json(200, { ok: true, mensagem: `Cadastro do veículo ${TEXTO_ENVIADO}.` });
}

// Compartilhado entre a action `sincronizar_veiculo` e a recuperação do 404
// no envio de NF-e — as duas mandam exatamente o mesmo payload.
function enviarCadastroVeiculo(
  veiculo: Record<string, any>,
  tipoVeiculo: 'N' | 'U',
  cnpj: string,
  apiKey: string,
  atualizar = false,
) {
  const payload = montarPayloadVeiculo(veiculo, tipoVeiculo);
  const caminho = atualizar
    ? `/dms/${cnpj}/vehicle/${payload.chassi}/${tipoVeiculo}`
    : `/dms/${cnpj}/vehicle`;
  return chamarRenave(caminho, apiKey, atualizar ? 'PUT' : 'POST', payload);
}

// ── Ações: enviar_nfe_compra | _venda | _transferencia ────────────────────
// A chave da NF-e não é montada aqui: ela já existe (compra = a nota que o
// vendedor emitiu para a loja, gravada em veiculos.chave_nfe_compra pela
// 0030; venda = a access_key que a Spedy devolveu em nota_fiscal). O que
// esta função faz é ENVIAR essa chave.
export async function enviarNfe(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  acao: AcaoNfe,
  body: Record<string, any>,
) {
  const { erro, ctx } = await abrirContexto(admin, lojaId, body);
  if (erro) return erro;
  const { veiculo, cnpj, apiKey } = ctx!;

  let tipoVeiculo: 'N' | 'U';
  try {
    tipoVeiculo = resolverTipoVeiculo(body?.tipoVeiculo ?? body?.tipo_veiculo);
  } catch (e) {
    return json(400, { erro: (e as Error).message });
  }

  const origem = await reunirDadosNfe(admin, lojaId, acao, veiculo, body);
  if (origem.campos_faltando.length) {
    return json(400, {
      erro: 'campos_obrigatorios_faltando',
      campos_faltando: origem.campos_faltando,
      mensagem: mensagemCamposFaltando(origem.campos_faltando),
    });
  }

  // Regra 2 do pedido: dtHrProcesso é o momento do ENVIO — now(), nunca
  // `veiculos.entrada` (a data em que o carro entrou no estoque). Um único
  // instante alimenta o payload e a coluna, para os dois não divergirem.
  const agora = new Date();
  const dtHrProcesso = formatarDtHrProcesso(agora, renaveTimezone());
  const payload = montarPayloadNfe({
    chassi: veiculo.chassi,
    tipoVeiculo,
    chaveNfe: origem.chaveNfe,
    cpfCnpj: origem.cpfCnpj,
    dtHrProcesso,
    valor: origem.valor,
  });

  const caminho = `/dms/${cnpj}/vehicle/nfe/${ROTA_NFE[acao]}`;
  const evento = resolverEvento(acao, body?.evento);
  let resposta = await chamarRenave(caminho, apiKey, 'POST', payload);
  let recadastrouVeiculo = false;

  // Regra 1 do pedido: 404 no envio da chave = o veículo não está cadastrado
  // lá. Cadastra e refaz a chamada UMA vez — nunca em laço. A doc é explícita
  // que o veículo precisa existir antes da NF-e.
  if (resposta.status === 404) {
    const faltandoCadastro = camposVeiculoFaltando(veiculo);
    if (faltandoCadastro.length) {
      const mensagem = mensagemCamposFaltando(faltandoCadastro);
      await gravarRegistro(admin, { lojaId, veiculoId: veiculo.id, evento, acao, resposta, mensagemErro: mensagem });
      return json(400, { erro: 'campos_obrigatorios_faltando', campos_faltando: faltandoCadastro, mensagem });
    }

    const sinc = await enviarCadastroVeiculo(veiculo, tipoVeiculo, cnpj, apiKey);
    if (!sinc.ok) {
      const mensagem =
        `O veículo ainda não estava cadastrado na Renave Fácil e o cadastro automático falhou: ${motivoRecusa(sinc)} ` +
        `A chave da NF-e não foi ${textoEnviado('f')}.`;
      await gravarRegistro(admin, { lojaId, veiculoId: veiculo.id, evento, acao: 'sincronizar_veiculo', resposta: sinc, mensagemErro: mensagem });
      return json(sinc.status || 502, { erro: mensagem });
    }

    recadastrouVeiculo = true;
    await gravarRegistro(admin, { lojaId, veiculoId: veiculo.id, evento, acao: 'sincronizar_veiculo', resposta: sinc });
    resposta = await chamarRenave(caminho, apiKey, 'POST', payload);

    if (resposta.status === 404) {
      const mensagem =
        'A Renave Fácil continua respondendo que o veículo não existe mesmo depois de cadastrá-lo agora ' +
        `(chassi ${veiculo.chassi}). A chave da NF-e não foi ${textoEnviado('f')} — não insistimos de novo para não ` +
        'repetir envio. Confira o chassi no painel da Renave Fácil antes de tentar outra vez.';
      await gravarRegistro(admin, { lojaId, veiculoId: veiculo.id, evento, acao, resposta, mensagemErro: mensagem });
      return json(409, { erro: 'veiculo_nao_cadastrado', mensagem, recadastrou_veiculo: true });
    }
  }

  const mensagemErro = resposta.ok ? null : motivoRecusa(resposta);
  await gravarRegistro(admin, {
    lojaId,
    veiculoId: veiculo.id,
    evento,
    acao,
    resposta,
    mensagemErro,
    campos: {
      chave_nfe: payload.chaveNfe as string,
      dt_hr_processo: agora.toISOString(),
      valor: origem.valor,
      ...(resposta.data?.protocolo || resposta.data?.protocol
        ? { protocolo: String(resposta.data.protocolo || resposta.data.protocol) }
        : {}),
    },
  });

  if (!resposta.ok) return json(resposta.status || 502, { erro: mensagemErro, recadastrou_veiculo: recadastrouVeiculo });
  return json(200, {
    ok: true,
    mensagem: `Chave da NF-e ${textoEnviado('f')}.`,
    dt_hr_processo: dtHrProcesso,
    recadastrou_veiculo: recadastrouVeiculo,
  });
}

// De onde sai chaveNfe/cpfCnpj/valor em cada rota. Nenhum dos três é aceito
// do body quando existe fonte no banco — o body só preenche o que o sistema
// ainda não modela (transferência entre estabelecimentos não tem tabela).
async function reunirDadosNfe(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  acao: AcaoNfe,
  veiculo: Record<string, any>,
  body: Record<string, any>,
): Promise<{ chaveNfe: string; cpfCnpj: string; valor: number; campos_faltando: string[] }> {
  if (acao === 'enviar_nfe_compra') {
    // Valor da compra mora em veiculo_valor_compra desde a 0026 (a coluna
    // veiculos.compra não existe mais).
    const { data: vc } = await admin
      .from('veiculo_valor_compra')
      .select('compra')
      .eq('veiculo_id', veiculo.id)
      .eq('loja_id', lojaId)
      .maybeSingle();
    const valor = Number(vc?.compra ?? 0);
    return {
      chaveNfe: String(veiculo.chave_nfe_compra || ''),
      cpfCnpj: String(veiculo.vendedor_origem_cpf_cnpj || ''),
      valor,
      // Regra 4: a checagem completa (identificação + vendedor de origem +
      // chave + valor) é aqui, e o erro nomeia todos os campos de uma vez.
      campos_faltando: camposCompraFaltando(veiculo, valor),
    };
  }

  const faltandoVeiculo = camposVeiculoFaltando(veiculo);

  if (acao === 'enviar_nfe_venda') {
    // order+limit, não maybeSingle cru: `vendas` não tem unique por veículo
    // (um carro pode voltar ao estoque e ser vendido de novo — repasse). Sem
    // isso, duas vendas do mesmo carro fariam o maybeSingle() estourar e o
    // erro sairia como "venda não encontrada", que é mentira.
    const { data: venda } = await admin
      .from('vendas')
      .select('*')
      .eq('veiculo_id', veiculo.id)
      .eq('loja_id', lojaId)
      .order('data_venda', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: nota } = venda
      ? await admin.from('nota_fiscal').select('*').eq('venda_id', venda.id).eq('loja_id', lojaId).maybeSingle()
      : { data: null as any };

    const chaveNfe = String(nota?.access_key || '');
    const cpfCnpj = String(venda?.comprador_cpf || '');
    const valor = Number(venda?.valor_venda ?? 0);
    const campos_faltando = [...faltandoVeiculo];
    if (!venda) campos_faltando.push('venda do veículo');
    if (!chaveNfe) campos_faltando.push('chave da NF-e de venda (a nota ainda não foi autorizada)');
    if (!cpfCnpj) campos_faltando.push('CPF/CNPJ do comprador');
    if (!(valor > 0)) campos_faltando.push('valor da venda');
    return { chaveNfe, cpfCnpj, valor, campos_faltando };
  }

  // Transferência entre estabelecimentos/filiais: o sistema não modela esse
  // evento (não existe tabela nem tela). Os três dados vêm do body, e cada
  // ausência é nomeada — nada é enviado pela metade.
  const chaveNfe = String(body?.chaveNfe || body?.chave_nfe || '');
  const cpfCnpj = String(body?.cpfCnpj || body?.cpf_cnpj || '');
  const valor = Number(body?.valor ?? 0);
  const campos_faltando = [...faltandoVeiculo];
  if (!chaveNfe) campos_faltando.push('chave da NF-e de transferência');
  if (!cpfCnpj) campos_faltando.push('CPF/CNPJ do estabelecimento de destino');
  if (!(valor > 0)) campos_faltando.push('valor da transferência');
  return { chaveNfe, cpfCnpj, valor, campos_faltando };
}

// Códigos de situacaoEstoqueRenave que o CHECK da 0029 aceita.
const SITUACOES_VALIDAS = new Set(['S', 'T', 'C', 'X', 'V', 'E', 'I', '']);

// ── Ação: consultar_status ────────────────────────────────────────────────
// GET /renave/{cnpj}/docs/status?placa=&renavam= — sob demanda, sempre. Não
// existe webhook nesta integradora: `situacao`/`documentos_disponiveis` só
// mudam quando alguém pergunta. `consultado_em` registra quando foi.
export async function consultarStatus(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  body: Record<string, any>,
) {
  const { erro, ctx } = await abrirContexto(admin, lojaId, body);
  if (erro) return erro;
  const { veiculo, cnpj, apiKey } = ctx!;

  // placa/renavam do BANCO, nunca do body (o body não escolhe o carro).
  const qs = new URLSearchParams();
  if (veiculo.placa) qs.set('placa', String(veiculo.placa).trim().toUpperCase());
  if (veiculo.renavam) qs.set('renavam', apenasDigitos(veiculo.renavam));
  if (![...qs.keys()].length) {
    return json(400, {
      erro: 'campos_obrigatorios_faltando',
      campos_faltando: ['placa', 'renavam'],
      mensagem: 'O veículo não tem placa nem RENAVAM cadastrados — sem um dos dois não há como consultar o status.',
    });
  }

  const resposta = await chamarRenave(`/renave/${cnpj}/docs/status?${qs.toString()}`, apiKey);
  const evento = resolverEvento('consultar_status', body?.evento);
  const mensagemErro = resposta.ok ? null : motivoRecusa(resposta);
  const consultadoEm = new Date().toISOString();

  const situacao = resposta.ok ? String(resposta.data?.situacaoEstoqueRenave ?? '') : null;
  const documentos = resposta.ok ? resposta.data?.documentosDisponiveis ?? {} : null;

  await gravarRegistro(admin, {
    lojaId,
    veiculoId: veiculo.id,
    evento,
    acao: 'consultar_status',
    resposta,
    mensagemErro,
    campos: resposta.ok
      ? {
          // Só grava `situacao` se vier um código que o CHECK da 0029 aceita —
          // a Renave Fácil pode devolver algo ainda não documentado, e isso
          // não pode derrubar a gravação inteira (a resposta bruta fica em
          // `dados` de qualquer jeito).
          ...(SITUACOES_VALIDAS.has(situacao!) ? { situacao } : {}),
          documentos_disponiveis: documentos,
          consultado_em: consultadoEm,
        }
      : {},
  });

  if (!resposta.ok) return json(resposta.status || 502, { erro: mensagemErro });

  // Repassa o shape que o conector já espera (situacaoEstoqueRenave /
  // documentosDisponiveis) — mapear código→rótulo é papel do conector.
  return json(200, {
    ok: true,
    situacaoEstoqueRenave: situacao,
    documentosDisponiveis: documentos,
    chassi: resposta.data?.chassi,
    placa: resposta.data?.placa,
    renavam: resposta.data?.renavam,
    descricao: resposta.data?.descricao,
    consultado_em: consultadoEm,
  });
}

// ── Ação: baixar_documento ────────────────────────────────────────────────
// GET /renave/{cnpj}/docs/atpve/entrada | atpve/saida | crlve. Só existe se
// `documentosDisponiveis` indicar (ex.: ATPV-e de entrada não existe quando a
// entrada usou CRV em papel) — quem consulta antes é o chamador.
export async function baixarDocumento(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  body: Record<string, any>,
) {
  const { erro, ctx } = await abrirContexto(admin, lojaId, body);
  if (erro) return erro;
  const { veiculo, cnpj, apiKey } = ctx!;

  let rota: string;
  try {
    rota = rotaDocumento(String(body?.tipo || ''));
  } catch (e) {
    return json(400, { erro: (e as Error).message });
  }

  const qs = new URLSearchParams();
  if (veiculo.placa) qs.set('placa', String(veiculo.placa).trim().toUpperCase());
  if (veiculo.renavam) qs.set('renavam', apenasDigitos(veiculo.renavam));
  if (![...qs.keys()].length) {
    return json(400, {
      erro: 'campos_obrigatorios_faltando',
      campos_faltando: ['placa', 'renavam'],
      mensagem: 'O veículo não tem placa nem RENAVAM cadastrados — sem um dos dois não há como buscar o documento.',
    });
  }

  const resposta = await chamarRenave(`/renave/${cnpj}/docs/${rota}?${qs.toString()}`, apiKey);
  const evento = resolverEvento('baixar_documento', body?.evento, body?.tipo);
  const mensagemErro = resposta.ok ? null : motivoRecusa(resposta);
  const url = resposta.ok ? resposta.data?.url || resposta.data?.link || null : null;

  await gravarRegistro(admin, {
    lojaId,
    veiculoId: veiculo.id,
    evento,
    acao: `baixar_documento:${body?.tipo}`,
    resposta,
    mensagemErro,
    // atpv_e_url (0017) guarda a ATPV-e espelhada; o CRLV-e não é ATPV-e e
    // não entra nessa coluna.
    campos: url && String(body?.tipo).startsWith('atpve') ? { atpv_e_url: url } : {},
  });

  if (!resposta.ok) return json(resposta.status || 502, { erro: mensagemErro });
  return json(200, { ok: true, tipo: body?.tipo, url, resposta: resposta.data });
}

// Guarda de import: sem isso, Deno.serve executaria no import e quebraria
// fora do Deno (vitest/Node). Mesmo padrão da spedy-api.
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // REGRA 1: a loja sai do JWT. O body não tem voz nenhuma sobre isso.
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: userData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !userData?.user) return json(401, { erro: 'Não autenticado.' });

    const { data: usuario } = await admin
      .from('usuarios')
      .select('loja_id')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!usuario?.loja_id) return json(403, { erro: 'Usuário sem loja vinculada.' });

    const body = await req.json().catch(() => ({}));
    return despachar(admin, usuario.loja_id, body);
  });
}

// Separado do Deno.serve para o teste conseguir exercitar o roteamento sem
// montar um Request/JWT — o handler HTTP acima continua sendo a única porta
// de entrada em produção.
export async function despachar(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  body: Record<string, any>,
) {
  switch (body?.action) {
    case 'sincronizar_cliente':
      return sincronizarCliente(admin, lojaId, body);
    case 'sincronizar_veiculo':
      return sincronizarVeiculo(admin, lojaId, body);
    case 'enviar_nfe_compra':
    case 'enviar_nfe_venda':
    case 'enviar_nfe_transferencia':
      return enviarNfe(admin, lojaId, body.action as AcaoNfe, body);
    case 'consultar_status':
      return consultarStatus(admin, lojaId, body);
    case 'baixar_documento':
      return baixarDocumento(admin, lojaId, body);
    default:
      // Falha ALTA de propósito, com a lista no corpo. O conector da etapa 1
      // (`src/integracoes/renave/conectorRenave.js`) ainda manda os nomes
      // antigos `enviar_chave_nfe_purchase|sales|transfer` e não manda
      // `veiculo_id` — nenhum alias silencioso foi criado aqui para esconder
      // isso: o conector precisa ser alinhado na etapa 3 de qualquer forma
      // (por causa do guard anti-massa), e um 400 nomeando as actions é mais
      // fácil de diagnosticar do que uma chamada que "passa" e trava adiante.
      return json(400, {
        erro: 'action inválida.',
        actions_validas: [...ACTIONS_VALIDAS],
      });
  }
}

const ACTIONS_VALIDAS = [
  'sincronizar_cliente',
  'sincronizar_veiculo',
  'enviar_nfe_compra',
  'enviar_nfe_venda',
  'enviar_nfe_transferencia',
  'consultar_status',
  'baixar_documento',
] as const;
