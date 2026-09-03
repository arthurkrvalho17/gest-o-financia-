// Edge Function: integração com a Spedy (emissão de NF-e — ADR-17).
//
// Financia+ é a empresa OWNER na Spedy; cada loja é uma sub-empresa criada
// por esta função (ninguém cria conta em portal nenhum). Duas chaves entram
// em jogo:
//   - SPEDY_OWNER_API_KEY (secret, nunca sai do servidor): usada para ações
//     de GESTÃO de empresa — criar (provisionar) e enviar certificado.
//   - a api_key DA SUB-EMPRESA (em canal_credencial, por loja): usada só
//     para emitir/consultar notas — é o que a hierarquia da Spedy permite
//     a uma "empresa secundária" fazer.
//
// Ações (action no body):
//   provisionar  → POST /v1/companies (chave Owner) + salva credencial
//                  + configura a emissão em seguida (ver 'configurar')
//   configurar   → GET/PUT /v1/companies/{id}/settings (chave Owner):
//                  productInvoice.{environmentType, series, nextNumber} —
//                  obrigatório antes de emitir; GET→altera→PUT, nunca PUT cego
//   certificado  → POST /v1/companies/{id}/certificates (chave Owner)
//   emitir       → monta e envia POST /v1/product-invoices (chave da loja)
//   consultar    → GET /v1/product-invoices/{id} e atualiza nota_fiscal
//
// Nunca inventamos CFOP/CST/alíquota: os dados tributários vêm de
// loja_config.config_fiscal, configurado pelo lojista com o contador.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  camposFiscaisFaltando,
  certificadoValido,
  garantirAmbienteCoerente,
  mensagemFalhaRedeSpedy,
  montarPayloadEmpresa,
  podeAplicarStatusWebhook,
  prepararBlocosConfiguracao,
  resolverEnvironmentType,
  resolverInscricaoEstadual,
} from '../_shared/spedyConfig.ts';

// typeof Deno !== 'undefined': este módulo é importado direto pelos testes
// vitest (guards de emitir(), sem tocar a Spedy real) — fora do Deno, os
// secrets nunca existem, então os defaults abaixo valem para o teste.
const temDeno = typeof Deno !== 'undefined';
// idem para EdgeRuntime.waitUntil (só existe no runtime das Edge Functions).
const temEdgeRuntime = typeof EdgeRuntime !== 'undefined';

// Fora do Deno (vitest), não existem secrets — os testes que precisam de um
// valor (ex.: SPEDY_OWNER_API_KEY em certificado()) o injetam via
// globalThis.__SPEDY_TEST_ENV__ antes de chamar a função.
function envGet(nome: string): string | undefined {
  return temDeno ? Deno.env.get(nome) : (globalThis as any).__SPEDY_TEST_ENV__?.[nome];
}

// Ambientes (doc: pages/start/ambiente-de-testes):
//   produção  https://api.spedy.com.br/v1          (default)
//   sandbox   https://sandbox-api.spedy.com.br/v1  (SPEDY_API_URL)
// O sandbox é um CADASTRO SEPARADO (Plano Desenvolvedor): a chave Owner de
// produção NÃO funciona no sandbox, e vice-versa — ao trocar SPEDY_API_URL,
// troque JUNTO a SPEDY_OWNER_API_KEY pela chave daquele ambiente.
//
// Funções (não consts congeladas no import) para os testes conseguirem
// simular sandbox×produção via __SPEDY_TEST_ENV__ — ver envGet().
function spedyApiUrl(): string {
  return (envGet('SPEDY_API_URL') || 'https://api.spedy.com.br/v1').replace(/\/+$/, '');
}
function ehSandbox(): boolean {
  return spedyApiUrl().includes('sandbox');
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

async function chamarSpedy(path: string, apiKey: string, method = 'GET', body: unknown = null) {
  const res = await fetch(`${spedyApiUrl()}${path}`, {
    method,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ── Ação: provisionar (cria a sub-empresa da loja na Spedy) ──────────────
async function provisionar(admin: ReturnType<typeof createClient>, lojaId: string) {
  const ownerKey = envGet('SPEDY_OWNER_API_KEY');
  if (!ownerKey) return json(500, { erro: 'SPEDY_OWNER_API_KEY não configurado.' });

  const { data: loja } = await admin.from('lojas').select('*').eq('id', lojaId).maybeSingle();
  if (!loja) return json(404, { erro: 'Loja não encontrada.' });

  const { data: dono } = await admin
    .from('usuarios')
    .select('email')
    .eq('loja_id', lojaId)
    .eq('papel', 'dono')
    .limit(1)
    .maybeSingle();

  // Bloqueia com mensagem acionável quando falta CNPJ ou a definição da
  // Inscrição Estadual (dígitos ou o literal ISENTO — exigência da NF-e).
  let payload: ReturnType<typeof montarPayloadEmpresa>;
  try {
    payload = montarPayloadEmpresa(loja, dono?.email);
  } catch (e) {
    return json(400, { erro: (e as Error).message });
  }

  const { ok, status, data } = await chamarSpedy('/companies', ownerKey, 'POST', payload);
  if (!ok) return json(status, { erro: 'Falha ao criar empresa na Spedy.', detalhe: data });

  const apiKey = data?.apiCredentials?.apiKey;
  const companyId = data?.id;
  if (!apiKey || !companyId) return json(502, { erro: 'Resposta da Spedy sem apiKey/id.', detalhe: data });

  await admin.from('canal_credencial').upsert(
    {
      loja_id: lojaId,
      canal: 'spedy',
      credenciais: { company_id: companyId, api_key: apiKey },
      status: 'conectado',
      conectado_em: new Date().toISOString(),
    },
    { onConflict: 'loja_id,canal' }
  );

  // A sub-empresa precisa nascer com série/numeração/ambiente prontos —
  // sem isso a primeira emissão falharia. Se a configuração falhar, a
  // empresa já existe e a credencial já está salva: devolvemos ok com o
  // aviso, e a action 'configurar' permite reexecutar isolada.
  const cfg = await configurarEmissao(admin, lojaId);
  return json(200, {
    ok: true,
    company_id: companyId,
    configurado: cfg.ok,
    ...(cfg.ok
      ? {
          // environment_type é o que a Spedy CONFIRMOU (releitura das settings),
          // não o que pedimos. 'development' = Homologação, sem validade fiscal.
          environment_type: cfg.environmentType,
          environment_type_solicitado: cfg.solicitado,
          sandbox: cfg.sandbox,
          ambiente: cfg.environmentType === 'development' ? 'HOMOLOGAÇÃO (sem validade fiscal)' : 'PRODUÇÃO (nota valendo)',
        }
      : { aviso: `Empresa criada, mas a configuração de emissão falhou: ${cfg.erro} Reexecute com a action 'configurar'.` }),
  });
}

// ── Configuração de emissão (settings da empresa) ────────────────────────
// Obrigatória antes de emitir (doc configuracao-inicial): a empresa nasce sem
// série/numeração/ambiente válidos para NF-e. Fluxo GET → altera SÓ o bloco
// productInvoice → PUT do bloco completo (o PUT substitui o bloco enviado;
// campo omitido volta a default inválido — nunca PUT cego).
async function configurarEmissao(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
): Promise<{
  ok: boolean;
  environmentType?: string; // o que a Spedy CONFIRMOU na releitura das settings
  solicitado?: string; // o que pedimos no PUT
  sandbox?: boolean;
  erro?: string;
  detalhe?: unknown;
}> {
  const ownerKey = envGet('SPEDY_OWNER_API_KEY');
  if (!ownerKey) return { ok: false, erro: 'SPEDY_OWNER_API_KEY não configurado.' };

  const { data: cred } = await admin
    .from('canal_credencial')
    .select('credenciais')
    .eq('loja_id', lojaId)
    .eq('canal', 'spedy')
    .maybeSingle();
  const companyId = cred?.credenciais?.company_id;
  if (!companyId) return { ok: false, erro: 'Empresa ainda não provisionada na Spedy.' };

  const atual = await chamarSpedy(`/companies/${companyId}/settings`, ownerKey);
  if (!atual.ok) {
    return { ok: false, erro: 'Falha ao ler as configurações da empresa na Spedy.', detalhe: atual.data };
  }

  // Sandbox → 'development' (Homologação); produção → 'production'.
  // SPEDY_ENVIRONMENT_TYPE sobrepõe (validado). 'production' dentro do
  // sandbox é RECUSADO aqui (garantirAmbienteCoerente lança) — a doc avisa
  // que essa combinação emite nota com validade fiscal REAL.
  let environmentType: ReturnType<typeof resolverEnvironmentType>;
  try {
    environmentType = resolverEnvironmentType(ehSandbox(), envGet('SPEDY_ENVIRONMENT_TYPE'));
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }

  // TODO(Arthur) — DECISÃO DE NEGÓCIO PENDENTE (infRespTec da NF-e):
  //   opção A: Financia+ assume responsável técnico → nossa marca no
  //            documento fiscal, mas exige autorização de uso (CSRT) por
  //            SEFAZ estadual;
  //   opção B: deixar a Spedy assumir (CNPJ 47332178000101) → menos atrito.
  // Enquanto não decidido, NENHUM valor é configurado aqui: o secret
  // SPEDY_TECHNICAL_RESPONSIBLE fica vazio e o bloco general nem é enviado
  // (enviá-lo sem technicalResponsible REMOVERIA o responsável — regra da
  // doc). Quando decidido, basta setar o secret com o JSON
  // { federalTaxNumber, contactName, email, phone } — nada de hardcode.
  let technicalResponsible: Record<string, unknown> | null = null;
  const respTecRaw = envGet('SPEDY_TECHNICAL_RESPONSIBLE');
  if (respTecRaw) {
    try {
      technicalResponsible = JSON.parse(respTecRaw);
    } catch {
      return { ok: false, erro: 'SPEDY_TECHNICAL_RESPONSIBLE não é um JSON válido.' };
    }
  }

  const blocos = prepararBlocosConfiguracao(atual.data, { environmentType, technicalResponsible });
  const put = await chamarSpedy(`/companies/${companyId}/settings`, ownerKey, 'PUT', blocos);
  if (!put.ok) {
    return { ok: false, erro: 'Falha ao gravar as configurações de emissão na Spedy.', detalhe: put.data };
  }

  // Relê as settings para reportar o environmentType EFETIVO — o que a Spedy
  // de fato gravou, não o que pedimos. Sem isso, um PUT aceito mas ignorado
  // (ou sobrescrito por default do lado dela) passaria despercebido e a loja
  // acharia que está em Homologação enquanto emite valendo.
  const confirmacao = await chamarSpedy(`/companies/${companyId}/settings`, ownerKey);
  const efetivo = String(
    (confirmacao.ok ? (confirmacao.data as Record<string, any>)?.productInvoice?.environmentType : '') || '',
  );

  if (!confirmacao.ok || !efetivo) {
    return {
      ok: false,
      erro: 'Configuração enviada, mas não foi possível reler o environmentType efetivo na Spedy para confirmar.',
      detalhe: confirmacao.data,
    };
  }

  // Mesma trava aplicada ao valor que voltou da Spedy: se ela reportar
  // 'production' com SPEDY_API_URL no sandbox, recusa em vez de seguir.
  try {
    garantirAmbienteCoerente(ehSandbox(), efetivo, 'resposta da Spedy');
  } catch (e) {
    return { ok: false, erro: (e as Error).message, detalhe: { environment_type_efetivo: efetivo } };
  }

  // Guarda o ambiente efetivo junto da credencial: assim a emissão confere
  // sem precisar de mais uma chamada à Spedy a cada nota.
  const { data: credAtual } = await admin
    .from('canal_credencial')
    .select('credenciais')
    .eq('loja_id', lojaId)
    .eq('canal', 'spedy')
    .maybeSingle();
  await admin
    .from('canal_credencial')
    .update({ credenciais: { ...(credAtual?.credenciais || {}), environment_type: efetivo } })
    .eq('loja_id', lojaId)
    .eq('canal', 'spedy');

  return { ok: true, environmentType: efetivo, solicitado: environmentType, sandbox: ehSandbox() };
}

// ── Ação: certificado (envia o .pfx da loja para a Spedy) ────────────────
async function certificado(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  { fileBase64, filename, password }: { fileBase64: string; filename: string; password: string }
) {
  const ownerKey = envGet('SPEDY_OWNER_API_KEY');
  if (!ownerKey) return json(500, { erro: 'SPEDY_OWNER_API_KEY não configurado.' });

  const { data: cred } = await admin
    .from('canal_credencial')
    .select('credenciais')
    .eq('loja_id', lojaId)
    .eq('canal', 'spedy')
    .maybeSingle();
  const companyId = cred?.credenciais?.company_id;
  if (!companyId) return json(409, { erro: 'Empresa ainda não provisionada na Spedy.' });

  const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
  const form = new FormData();
  // Campos do multipart conforme a doc (guias primeiros-passos/configuracao-
  // inicial e api-reference "adicionar-certificado"): certificateFile + password.
  form.append('certificateFile', new Blob([bytes]), filename || 'certificado.pfx');
  form.append('password', password);

  const res = await fetch(`${spedyApiUrl()}/companies/${companyId}/certificates`, {
    method: 'POST',
    headers: { 'X-Api-Key': ownerKey },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json(res.status, { erro: traduzirErroCertificado(res.status, data), detalhe: data });
  }

  // Sucesso: devolve os metadados do certificado (nunca o arquivo nem a
  // senha — não guardamos nenhum dos dois, nem aqui nem em lugar nenhum
  // nosso) pro front avisar a loja quando o certificado estiver perto de
  // vencer (doc: docs.spedy.com.br/api-reference/empresas/adicionar-
  // certificado, consultada em 31/08/2026).
  //
  // A validade (SÓ a data — nunca arquivo/senha) fica gravada na credencial
  // para o guard de emitir() (certificadoValido) saber, sem depender de
  // estado efêmero do navegador, se esta loja já enviou certificado algum
  // dia e se ele ainda vale.
  await admin
    .from('canal_credencial')
    .update({
      credenciais: {
        ...cred.credenciais,
        certificado_expira_em: data?.expirationAt || null,
        certificado_titular: data?.subject || null,
      },
    })
    .eq('loja_id', lojaId)
    .eq('canal', 'spedy');

  return json(200, {
    ok: true,
    expiraEm: data?.expirationAt || null,
    titular: data?.subject || null,
    emissor: data?.issuer || null,
    ativo: data?.isActive ?? null,
  });
}

// A doc oficial da Spedy para esta rota (consultada em 31/08/2026) só
// documenta os status HTTP genéricos — 400 "erro de validação ou regra de
// negócio", 403 "chave de API inválida", 429 "limite de requisições" — sem
// enumerar os motivos exatos nem os textos de erro para senha incorreta,
// certificado vencido ou CNPJ que não bate com o da empresa. A tradução
// abaixo é HEURÍSTICA (procura palavras-chave na mensagem que a Spedy manda
// de volta) — por isso o texto original dela SEMPRE acompanha em `detalhe`
// na resposta: se a heurística errar o motivo, a loja/suporte ainda tem o
// texto de verdade pra decidir o que fazer.
function traduzirErroCertificado(status: number, data: Record<string, unknown>): string {
  const bruto = String(
    (data as any)?.message ||
      (Array.isArray((data as any)?.errors) ? (data as any).errors.map((e: any) => e?.message).join('; ') : '') ||
      ''
  ).toLowerCase();

  if (status === 403) {
    return 'Falha de autenticação com a Spedy (chave da conta Owner do Financia+, não é o certificado da loja). Avise o suporte técnico.';
  }
  if (status === 429) {
    return 'A Spedy recebeu requisições demais em pouco tempo. Aguarde um minuto e tente enviar o certificado de novo.';
  }
  if (/senha|password|incorrect|wrong.*pass|invalid.*pass/.test(bruto)) {
    return 'A senha do certificado está incorreta. Confira com quem gerou o certificado (contador/despachante/certificadora) e tente de novo.';
  }
  if (/expir|vencid|valid.*period|not.*valid|out of date/.test(bruto)) {
    return 'Este certificado está vencido (ou fora do período de validade). É preciso providenciar um certificado A1 novo com a autoridade certificadora.';
  }
  if (/cnpj|federaltaxnumber|tax.*number|does not match|não\s*(corresponde|bate)/.test(bruto)) {
    return 'O CNPJ do certificado não é o mesmo CNPJ cadastrado para esta loja na Spedy. Confirme se o arquivo enviado é o certificado da empresa correta.';
  }
  // Não bateu com nenhuma palavra-chave conhecida — não inventa um motivo;
  // devolve o texto da Spedy tal como veio.
  return bruto ? `A Spedy recusou o certificado: ${bruto}` : 'A Spedy recusou o certificado (a resposta não detalhou o motivo).';
}

// ── Ação: emitir (cria a NF-e da venda) ───────────────────────────────────
function mapaFormaPagamento(forma: string | null): string {
  // SefazInvoicePaymentMethod: só informativo, não altera tributação.
  if (forma === 'avista') return '01'; // dinheiro (aproximação — não distinguimos pix/cartão hoje)
  return '99'; // financiamento, consórcio, outros
}

async function emitir(admin: ReturnType<typeof createClient>, lojaId: string, vendaId: string) {
  const { data: venda } = await admin.from('vendas').select('*').eq('id', vendaId).eq('loja_id', lojaId).maybeSingle();
  if (!venda) return json(404, { erro: 'Venda não encontrada.' });

  const { data: veiculo } = await admin.from('veiculos').select('*').eq('id', venda.veiculo_id).maybeSingle();
  const { data: loja } = await admin.from('lojas').select('inscricao_estadual').eq('id', lojaId).maybeSingle();
  const { data: lojaConfig } = await admin.from('loja_config').select('config_fiscal').eq('loja_id', lojaId).maybeSingle();
  const { data: cred } = await admin
    .from('canal_credencial')
    .select('credenciais, status')
    .eq('loja_id', lojaId)
    .eq('canal', 'spedy')
    .maybeSingle();

  const upsertNota = (campos: Record<string, unknown>) =>
    admin.from('nota_fiscal').upsert(
      { loja_id: lojaId, venda_id: vendaId, veiculo_id: venda.veiculo_id, integration_id: vendaId, ...campos },
      { onConflict: 'venda_id' }
    );

  // Loja não habilitou o complemento — não é erro, apenas não emite.
  if (!cred || cred.status !== 'conectado') return json(200, { ok: false, skip: 'spedy_nao_conectado' });

  // Trava de ambiente no ponto mais caro do fluxo: emitir 'production' a
  // partir do sandbox gera nota fiscal REAL no CNPJ da loja, e desfazer
  // exige cancelamento/carta de correção dentro do prazo legal. O ambiente
  // efetivo foi gravado na credencial pela action 'configurar'.
  //
  // Achado (02/09/2026): quando `environment_type` está VAZIO — loja
  // conectada por fora de 'configurar' (aconteceu de verdade em 31/08, ver
  // cérebro/Gestão) — o `if` antigo pulava a trava inteira e deixava
  // `emitir` seguir sem checagem nenhuma. Falha fechada agora: sem o
  // ambiente confirmado, não emite.
  const ambienteCredencial = String(cred.credenciais?.environment_type || '');
  if (!ambienteCredencial) {
    const msg = 'Ambiente de emissão não confirmado para esta loja — rode a action "configurar" antes de emitir (sem isso não há garantia contra nota com validade fiscal indevida).';
    await upsertNota({ status: 'created', processing_status: 'failed', processing_message: msg });
    return json(409, { erro: 'ambiente_nao_confirmado' });
  }
  try {
    garantirAmbienteCoerente(ehSandbox(), ambienteCredencial, 'credencial da loja');
  } catch (e) {
    await upsertNota({
      status: 'created',
      processing_status: 'failed',
      processing_message: (e as Error).message.slice(0, 1000),
    });
    return json(409, { erro: (e as Error).message });
  }

  // Certificado A1: bloqueia ANTES de tentar — sem isso a Spedy recusaria a
  // assinatura da NF-e, mas com um erro pensado para quem já tem
  // certificado (senha/vencido/CNPJ), não para quem nunca enviou nenhum.
  const certCheck = certificadoValido(cred.credenciais);
  if (!certCheck.ok) {
    await upsertNota({ status: 'created', processing_status: 'failed', processing_message: certCheck.motivo });
    return json(200, { ok: false, erro: 'certificado_invalido' });
  }

  // Inscrição Estadual: resolverInscricaoEstadual já é usada no provisionamento,
  // mas uma loja pode ter sido conectada por fora dele (aconteceu de verdade
  // em 31/08/2026 — ver cérebro/Gestão) ou ter o cadastro editado depois.
  // Reexecutar a mesma validação aqui pega os dois casos antes de gastar uma
  // chamada com a Spedy.
  try {
    resolverInscricaoEstadual(loja?.inscricao_estadual);
  } catch (e) {
    await upsertNota({
      status: 'created',
      processing_status: 'failed',
      processing_message: (e as Error).message,
    });
    return json(200, { ok: false, erro: 'inscricao_estadual_ausente' });
  }

  const configFiscal = lojaConfig?.config_fiscal;
  const camposFaltando = camposFiscaisFaltando(configFiscal);
  if (camposFaltando.length) {
    await upsertNota({
      status: 'created',
      processing_status: 'failed',
      processing_message: `Configuração tributária (config_fiscal) incompleta — faltam: ${camposFaltando.join(', ')}. Confirme com o contador antes de habilitar a emissão automática.`,
    });
    return json(200, { ok: false, erro: 'config_fiscal_incompleto', campos_faltando: camposFaltando });
  }

  const cpfCnpj = (venda.comprador_cpf || '').replace(/\D/g, '');
  if (!cpfCnpj) {
    await upsertNota({
      status: 'created',
      processing_status: 'failed',
      processing_message: 'CPF/CNPJ do comprador não informado — não foi possível emitir a NF-e.',
    });
    return json(200, { ok: false, erro: 'comprador_cpf ausente' });
  }

  // Endereço do comprador — a Spedy exige receiver.address completo pra
  // emitir (achado de 31/08/2026: sem isso, rejeita com "Endereço do
  // cliente é obrigatório"). Coletado no Registrar venda via CEP (ViaCEP).
  if (!venda.comprador_cep || !venda.comprador_numero || !venda.comprador_cidade_ibge) {
    await upsertNota({
      status: 'created',
      processing_status: 'failed',
      processing_message: 'Endereço do comprador incompleto (CEP/número) — não foi possível emitir a NF-e.',
    });
    return json(200, { ok: false, erro: 'endereco_comprador_incompleto' });
  }

  const apiKey = cred.credenciais?.api_key;
  const valor = Number(venda.valor_venda) || 0;
  const descricaoVeiculo = [veiculo?.modelo, veiculo?.fab_mod, veiculo?.placa ? `placa ${veiculo.placa}` : null]
    .filter(Boolean)
    .join(' ');

  const payload = {
    integrationId: vendaId,
    isFinalCustomer: true,
    operationType: 'outgoing',
    destination: 'internal', // MVP: assume venda dentro do estado (não coletamos a UF pra decidir 6.xxx — pergunta 7 do contador, ver cérebro/Gestão 2026-08-27)
    presenceType: 'presence',
    operationNature: 'Venda de veículo usado',
    sendEmailToCustomer: false,
    receiver: {
      federalTaxNumber: cpfCnpj,
      name: venda.comprador_nome || 'Consumidor final',
      address: {
        street: venda.comprador_logradouro || undefined,
        number: venda.comprador_numero,
        district: venda.comprador_bairro || undefined,
        postalCode: venda.comprador_cep,
        city: {
          code: venda.comprador_cidade_ibge,
          name: venda.comprador_cidade || undefined,
          state: venda.comprador_uf || undefined,
        },
      },
    },
    items: [
      {
        code: veiculo?.codigo || veiculo?.placa || vendaId.slice(0, 8),
        description: descricaoVeiculo || 'Veículo usado',
        ncm: configFiscal.ncm,
        cfop: configFiscal.cfop,
        unit: 'UN',
        quantity: 1,
        unitAmount: valor,
        totalAmount: valor,
        unitTax: 'UN',
        quantityTax: 1,
        unitTaxAmount: valor,
        makeupTotal: true,
        taxes: {
          icms: configFiscal.icms,
          pis: configFiscal.pis || { cst: 7 },
          cofins: configFiscal.cofins || { cst: 7 },
        },
      },
    ],
    payments: [{ method: mapaFormaPagamento(venda.forma_pagamento), amount: valor }],
    total: { invoiceAmount: valor, productAmount: valor },
  };

  // fetch pode rejeitar (Spedy fora do ar, timeout, DNS etc.) — sem este
  // try/catch a exceção subia sem tratamento e nota_fiscal nunca era
  // atualizada: a venda ficava registrada, mas a loja não tinha NENHUM
  // registro de que a emissão sequer foi tentada.
  let resposta: { ok: boolean; status: number; data: any };
  try {
    resposta = await chamarSpedy('/product-invoices', apiKey, 'POST', payload);
  } catch (e) {
    await upsertNota({ status: 'created', processing_status: 'failed', processing_message: mensagemFalhaRedeSpedy(e) });
    return json(200, { ok: false, erro: 'spedy_indisponivel' });
  }
  const { ok, data } = resposta;

  if (!ok) {
    const mensagem = Array.isArray(data?.errors) ? data.errors.map((e: { message: string }) => e.message).join('; ') : JSON.stringify(data);
    await upsertNota({ status: 'created', processing_status: 'failed', processing_message: mensagem.slice(0, 1000) });
    return json(200, { ok: false, erro: mensagem });
  }

  const { data: notaSalva } = await upsertNota({
    spedy_invoice_id: data.id,
    status: data.status || 'enqueued',
    number: data.number ? String(data.number) : null,
    processing_status: data.processingDetail?.status || 'processing',
    processing_message: data.processingDetail?.message || null,
    processing_code: data.processingDetail?.code || null,
  }).select('id').single();

  // Rede de segurança para quando o webhook nunca chega (a Spedy não
  // documenta reenvio garantido): reconsulta esta nota sozinha ~25s depois,
  // em background, sem depender do navegador continuar aberto. Não
  // substitui o webhook (que é o caminho normal, mais rápido) — só cobre a
  // lacuna dele. A action 'consultar' segue disponível para checar de novo
  // manualmente a qualquer momento.
  if (temEdgeRuntime && data.id && !['authorized', 'rejected'].includes(String(data.status))) {
    EdgeRuntime.waitUntil(reconciliarNotaDepois(admin, apiKey, notaSalva?.id, data.id, 25_000));
  }

  return json(200, { ok: true, id: data.id, status: data.status });
}

// Núcleo de "buscar na Spedy e gravar em nota_fiscal", compartilhado pela
// action 'consultar' (manual) e pela reconciliação automática após emitir()
// (rede de segurança para quando o webhook não chega — Parte 1, item 4).
// Aplica a MESMA trava de evento fora de ordem do webhook (podeAplicarStatusWebhook):
// se o webhook já autorizou a nota entre o emitir() e esta reconsulta, um
// GET que por algum motivo viesse com status antigo não pode regredir o estado.
async function atualizarNotaDaSpedy(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  notaId: string,
  invoiceId: string,
) {
  const { data: notaAtual } = await admin.from('nota_fiscal').select('*').eq('id', notaId).maybeSingle();
  if (!notaAtual) return { ok: false, erro: 'Nota não encontrada.' } as const;

  const { ok, status, data } = await chamarSpedy(`/product-invoices/${invoiceId}`, apiKey);
  if (!ok) return { ok: false, status, erro: 'Falha ao consultar nota.', detalhe: data } as const;

  if (!podeAplicarStatusWebhook(notaAtual.status, data.status)) {
    return { ok: true, ignorado: true, status: notaAtual.status } as const;
  }

  await admin
    .from('nota_fiscal')
    .update({
      status: data.status,
      number: data.number ? String(data.number) : notaAtual.number,
      access_key: data.accessKey || notaAtual.access_key,
      protocolo: data.authorization?.protocol || notaAtual.protocolo,
      processing_status: data.processingDetail?.status || notaAtual.processing_status,
      processing_message: data.processingDetail?.message || notaAtual.processing_message,
      processing_code: data.processingDetail?.code || notaAtual.processing_code,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', notaId);

  return { ok: true, status: data.status } as const;
}

async function reconciliarNotaDepois(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  notaId: string | undefined,
  invoiceId: string,
  atrasoMs: number,
) {
  if (!notaId) return;
  await new Promise((resolve) => setTimeout(resolve, atrasoMs));
  await atualizarNotaDaSpedy(admin, apiKey, notaId, invoiceId);
}

// ── Ação: consultar (atualiza o status a partir da Spedy) ─────────────────
async function consultar(admin: ReturnType<typeof createClient>, lojaId: string, vendaId: string) {
  const { data: nota } = await admin.from('nota_fiscal').select('*').eq('venda_id', vendaId).eq('loja_id', lojaId).maybeSingle();
  if (!nota?.spedy_invoice_id) return json(404, { erro: 'Nota não encontrada ou ainda não enviada.' });

  const { data: cred } = await admin
    .from('canal_credencial')
    .select('credenciais')
    .eq('loja_id', lojaId)
    .eq('canal', 'spedy')
    .maybeSingle();
  const apiKey = cred?.credenciais?.api_key;
  if (!apiKey) return json(409, { erro: 'Spedy não conectada.' });

  const resultado = await atualizarNotaDaSpedy(admin, apiKey, nota.id, nota.spedy_invoice_id);
  if (!resultado.ok) return json((resultado as any).status || 502, { erro: resultado.erro, detalhe: (resultado as any).detalhe });

  return json(200, { ok: true, status: resultado.status, ignorado: (resultado as any).ignorado || false });
}

// Exportado só para os testes vitest (guards de emitir(), com um admin
// fake) — o handler HTTP real abaixo continua sendo a única porta de
// entrada em produção.
export { emitir, certificado, consultar, atualizarNotaDaSpedy, configurarEmissao };

// Guarda de import: mesmo motivo do spedy-webhook — sem isso, Deno.serve
// executaria na hora do import e quebraria fora do Deno (vitest/Node).
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

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
  const { action } = body;

  switch (action) {
    case 'provisionar':
      return provisionar(admin, usuario.loja_id);
    case 'configurar': {
      const cfg = await configurarEmissao(admin, usuario.loja_id);
      return cfg.ok
        ? json(200, {
            ok: true,
            environment_type: cfg.environmentType,
            environment_type_solicitado: cfg.solicitado,
            sandbox: cfg.sandbox,
            ambiente: cfg.environmentType === 'development' ? 'HOMOLOGAÇÃO (sem validade fiscal)' : 'PRODUÇÃO (nota valendo)',
          })
        : json(502, { erro: cfg.erro, detalhe: cfg.detalhe });
    }
    case 'certificado':
      return certificado(admin, usuario.loja_id, body);
    case 'emitir':
      return emitir(admin, usuario.loja_id, body.vendaId);
    case 'consultar':
      return consultar(admin, usuario.loja_id, body.vendaId);
    default:
      return json(400, { erro: 'action inválida.' });
  }
});
}
