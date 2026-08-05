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
import { prepararBlocosConfiguracao, resolverEnvironmentType } from '../_shared/spedyConfig.ts';

// Ambientes (doc: pages/start/ambiente-de-testes):
//   produção  https://api.spedy.com.br/v1          (default)
//   sandbox   https://sandbox-api.spedy.com.br/v1  (SPEDY_API_URL)
// O sandbox é um CADASTRO SEPARADO (Plano Desenvolvedor): a chave Owner de
// produção NÃO funciona no sandbox, e vice-versa — ao trocar SPEDY_API_URL,
// troque JUNTO a SPEDY_OWNER_API_KEY pela chave daquele ambiente.
const SPEDY_API = (Deno.env.get('SPEDY_API_URL') || 'https://api.spedy.com.br/v1').replace(/\/+$/, '');
const SPEDY_SANDBOX = SPEDY_API.includes('sandbox');

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
  const res = await fetch(`${SPEDY_API}${path}`, {
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
  const ownerKey = Deno.env.get('SPEDY_OWNER_API_KEY');
  if (!ownerKey) return json(500, { erro: 'SPEDY_OWNER_API_KEY não configurado.' });

  const { data: loja } = await admin.from('lojas').select('*').eq('id', lojaId).maybeSingle();
  if (!loja) return json(404, { erro: 'Loja não encontrada.' });
  if (!loja.cnpj) return json(400, { erro: 'Cadastre o CNPJ da loja antes de habilitar a emissão de NF-e.' });

  const { data: dono } = await admin
    .from('usuarios')
    .select('email')
    .eq('loja_id', lojaId)
    .eq('papel', 'dono')
    .limit(1)
    .maybeSingle();

  const payload = {
    name: loja.nome,
    legalName: loja.nome,
    federalTaxNumber: String(loja.cnpj).replace(/\D/g, ''),
    stateTaxNumber: loja.inscricao_estadual || undefined,
    email: dono?.email || undefined,
    phone: loja.telefone ? String(loja.telefone).replace(/\D/g, '') : undefined,
    address: {
      street: loja.logradouro || undefined,
      number: loja.numero || undefined,
      district: loja.bairro || undefined,
      postalCode: loja.cep ? String(loja.cep).replace(/\D/g, '') : undefined,
      city: {
        code: loja.cidade_ibge || undefined,
        name: loja.cidade || undefined,
        state: loja.uf || undefined,
      },
    },
    taxRegime: loja.regime_tributario || undefined,
    economicActivities: loja.cnae_principal
      ? [{ code: loja.cnae_principal, isMain: true }]
      : undefined,
  };

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
      ? { environment_type: cfg.environmentType }
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
): Promise<{ ok: boolean; environmentType?: string; erro?: string; detalhe?: unknown }> {
  const ownerKey = Deno.env.get('SPEDY_OWNER_API_KEY');
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
  // SPEDY_ENVIRONMENT_TYPE sobrepõe (validado); no sandbox o default NUNCA é
  // production — configurar production dentro do sandbox emite nota com
  // validade fiscal REAL (aviso da doc de ambiente de testes).
  const environmentType = resolverEnvironmentType(
    SPEDY_SANDBOX,
    Deno.env.get('SPEDY_ENVIRONMENT_TYPE'),
  );

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
  const respTecRaw = Deno.env.get('SPEDY_TECHNICAL_RESPONSIBLE');
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

  return { ok: true, environmentType };
}

// ── Ação: certificado (envia o .pfx da loja para a Spedy) ────────────────
async function certificado(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  { fileBase64, filename, password }: { fileBase64: string; filename: string; password: string }
) {
  const ownerKey = Deno.env.get('SPEDY_OWNER_API_KEY');
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

  const res = await fetch(`${SPEDY_API}/companies/${companyId}/certificates`, {
    method: 'POST',
    headers: { 'X-Api-Key': ownerKey },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(res.status, { erro: 'Falha ao enviar certificado.', detalhe: data });

  return json(200, { ok: true });
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

  const configFiscal = lojaConfig?.config_fiscal;
  if (!configFiscal?.cfop || !configFiscal?.icms) {
    await upsertNota({
      status: 'created',
      processing_status: 'failed',
      processing_message: 'Configuração tributária (config_fiscal) não definida em Configurações — confirme com o contador antes de habilitar a emissão automática.',
    });
    return json(200, { ok: false, erro: 'config_fiscal ausente' });
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

  const apiKey = cred.credenciais?.api_key;
  const valor = Number(venda.valor_venda) || 0;
  const descricaoVeiculo = [veiculo?.modelo, veiculo?.fab_mod, veiculo?.placa ? `placa ${veiculo.placa}` : null]
    .filter(Boolean)
    .join(' ');

  const payload = {
    integrationId: vendaId,
    isFinalCustomer: true,
    operationType: 'outgoing',
    destination: 'internal', // MVP: assume venda dentro do estado (endereço do comprador não é coletado hoje)
    presenceType: 'presence',
    operationNature: 'Venda de veículo usado',
    sendEmailToCustomer: false,
    receiver: {
      federalTaxNumber: cpfCnpj,
      name: venda.comprador_nome || 'Consumidor final',
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

  const { ok, status, data } = await chamarSpedy('/product-invoices', apiKey, 'POST', payload);

  if (!ok) {
    const mensagem = Array.isArray(data?.errors) ? data.errors.map((e: { message: string }) => e.message).join('; ') : JSON.stringify(data);
    await upsertNota({ status: 'created', processing_status: 'failed', processing_message: mensagem.slice(0, 1000) });
    return json(200, { ok: false, erro: mensagem });
  }

  await upsertNota({
    spedy_invoice_id: data.id,
    status: data.status || 'enqueued',
    number: data.number ? String(data.number) : null,
    processing_status: data.processingDetail?.status || 'processing',
    processing_message: data.processingDetail?.message || null,
    processing_code: data.processingDetail?.code || null,
  });

  return json(200, { ok: true, id: data.id, status: data.status });
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

  const { ok, status, data } = await chamarSpedy(`/product-invoices/${nota.spedy_invoice_id}`, apiKey);
  if (!ok) return json(status, { erro: 'Falha ao consultar nota.', detalhe: data });

  await admin
    .from('nota_fiscal')
    .update({
      status: data.status,
      number: data.number ? String(data.number) : nota.number,
      access_key: data.accessKey || nota.access_key,
      protocolo: data.authorization?.protocol || nota.protocolo,
      processing_status: data.processingDetail?.status || nota.processing_status,
      processing_message: data.processingDetail?.message || nota.processing_message,
      processing_code: data.processingDetail?.code || nota.processing_code,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', nota.id);

  return json(200, { ok: true, status: data.status });
}

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
        ? json(200, { ok: true, environment_type: cfg.environmentType })
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
