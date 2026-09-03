// Lógica PURA da integração Spedy (sem Deno/rede) — usada pela spedy-api e
// pelo spedy-webhook, e importável nos testes (vitest) sem tocar a Spedy real.
//
// Contexto (doc pages/guides/configuracao-inicial e primeiros-passos):
// antes de emitir, a empresa precisa de PUT /v1/companies/{id}/settings com
// productInvoice.{environmentType, series, nextNumber}. O PUT SUBSTITUI os
// campos do bloco enviado — campo omitido volta ao default (environmentType
// volta a um valor INVÁLIDO). Por isso o fluxo é sempre GET → altera só o
// necessário → PUT do bloco completo. Nunca PUT cego.

// ── Provisionamento (POST /v1/companies) ─────────────────────────────────

// stateTaxNumber é necessário para emitir NF-e (doc primeiros-passos):
// empresas isentas usam o LITERAL 'ISENTO'. Não existe default silencioso —
// sem definição (IE nem isenção), o provisionamento é bloqueado com
// mensagem apontando o cadastro.
export function resolverInscricaoEstadual(bruta: string | null | undefined): string {
  const valor = String(bruta ?? '').trim();
  if (!valor) {
    throw new Error(
      'Informe a Inscrição Estadual da loja no cadastro (ou o valor ISENTO, se a loja for isenta) antes de habilitar a emissão — a NF-e exige essa definição.',
    );
  }
  if (/^isento$/i.test(valor)) return 'ISENTO';
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) {
    throw new Error(
      `Inscrição Estadual da loja inválida ("${valor}") — informe os dígitos da IE ou o valor ISENTO.`,
    );
  }
  return digitos;
}

type Loja = Record<string, unknown> & {
  nome?: string | null;
  cnpj?: string | number | null;
  inscricao_estadual?: string | null;
  telefone?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cep?: string | null;
  cidade_ibge?: string | null;
  cidade?: string | null;
  uf?: string | null;
  regime_tributario?: string | null;
  cnae_principal?: string | null;
};

// Monta o payload de criação da sub-empresa a partir do cadastro da loja.
// Lança erro (mensagem acionável) quando falta um dado que a NF-e exige.
export function montarPayloadEmpresa(loja: Loja, emailDono?: string | null) {
  if (!loja?.cnpj) {
    throw new Error('Cadastre o CNPJ da loja antes de habilitar a emissão de NF-e.');
  }
  return {
    name: loja.nome,
    legalName: loja.nome,
    federalTaxNumber: String(loja.cnpj).replace(/\D/g, ''),
    stateTaxNumber: resolverInscricaoEstadual(loja.inscricao_estadual),
    email: emailDono || undefined,
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
}

// ── Configuração de emissão (settings) ───────────────────────────────────

export const ENVIRONMENT_TYPES = ['production', 'development', 'simulation'] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];

// TRAVA DE SEGURANÇA: 'production' dentro do sandbox é proibido.
//
// A doc da Spedy avisa que dá para configurar environmentType 'production'
// mesmo estando no sandbox — e aí a nota sai com validade fiscal REAL,
// emitida contra a SEFAZ, no CNPJ da loja. Como o sandbox é onde se testa,
// é exatamente onde uma emissão real é mais provável de acontecer por
// engano e mais cara de desfazer (a saída é carta de correção ou
// cancelamento, com prazo legal).
//
// Antes esta função só validava o override contra o enum, então
// SPEDY_ENVIRONMENT_TYPE=production passava direto no sandbox. Agora a
// combinação é recusada com erro explícito, em qualquer ponto do fluxo.
export function garantirAmbienteCoerente(
  sandbox: boolean,
  environmentType: string,
  origem: string,
): void {
  if (sandbox && environmentType === 'production') {
    throw new Error(
      `Ambiente incoerente (${origem}): SPEDY_API_URL aponta para o SANDBOX, mas o environmentType é 'production'. ` +
        'Nessa combinação a Spedy emite nota com validade fiscal REAL a partir do ambiente de testes. ' +
        "Corrija SPEDY_ENVIRONMENT_TYPE (use 'development' ou remova o secret) ou aponte SPEDY_API_URL para produção — " +
        'os dois secrets devem ser trocados sempre juntos.',
    );
  }
}

// Default por ambiente. No sandbox o default NUNCA é 'production'. Override
// explícito via SPEDY_ENVIRONMENT_TYPE (validado contra o enum; valor
// desconhecido cai no default seguro; 'production' no sandbox é recusado).
export function resolverEnvironmentType(sandbox: boolean, override?: string | null): EnvironmentType {
  const resolvido: EnvironmentType =
    override && (ENVIRONMENT_TYPES as readonly string[]).includes(override)
      ? (override as EnvironmentType)
      : sandbox
        ? 'development'
        : 'production';

  garantirAmbienteCoerente(sandbox, resolvido, 'SPEDY_ENVIRONMENT_TYPE');
  return resolvido;
}

type Settings = Record<string, unknown> & {
  productInvoice?: Record<string, unknown> | null;
  general?: Record<string, unknown> | null;
};

// general.technicalResponsible (infRespTec da NF-e):
// { federalTaxNumber, contactName, email, phone, csrts? } — doc de
// configuracao-inicial. Um SaaS que emite por terceiros DEVE configurá-lo;
// sem configurar (nem na empresa nem na Owner), a Spedy assume como
// responsável técnico (CNPJ 47332178000101).
export type TechnicalResponsible = Record<string, unknown>;

// Recebe as settings ATUAIS (resposta do GET) e devolve só os blocos a
// enviar no PUT, com os campos existentes preservados (espalhados) e apenas
// o necessário alterado. Série/numeração iniciais seguem o exemplo da doc
// (series "1", nextNumber 1) e só entram quando a empresa ainda não tem.
export function prepararBlocosConfiguracao(
  settingsAtuais: Settings | null | undefined,
  {
    environmentType,
    technicalResponsible = null,
  }: {
    environmentType: EnvironmentType;
    technicalResponsible?: TechnicalResponsible | null;
  },
) {
  const atuais = settingsAtuais || {};
  const productInvoiceAtual = (atuais.productInvoice || {}) as Record<string, unknown>;

  const productInvoice = {
    ...productInvoiceAtual,
    environmentType,
    series: productInvoiceAtual.series ?? '1',
    nextNumber: productInvoiceAtual.nextNumber ?? 1,
  };

  // Só o bloco alterado vai no PUT: blocos não enviados ficam intactos na
  // Spedy (a substituição é por bloco) — não reenviamos general/consumer/
  // serviceInvoice sem necessidade.
  const blocos: { productInvoice: typeof productInvoice; general?: Record<string, unknown> } = {
    productInvoice,
  };

  // general só entra quando há responsável técnico a gravar. Regra da doc:
  // reenviar general OMITINDO technicalResponsible REMOVE o responsável —
  // por isso, sempre que general for enviado, o campo vai junto (o novo, ou
  // o que já estava gravado).
  if (technicalResponsible) {
    const geralAtual = (atuais.general || {}) as Record<string, unknown>;
    blocos.general = {
      ...geralAtual,
      technicalResponsible: technicalResponsible ?? geralAtual.technicalResponsible,
    };
  }

  return blocos;
}

// ── Webhook (invoice.status_changed) ─────────────────────────────────────

// Extrai do evento bruto o id da nota na Spedy (chave de busca em
// nota_fiscal.spedy_invoice_id) e o patch a aplicar. invoiceId vazio =
// evento sem data.id — o chamador registra o erro e não atualiza nada.
export function montarPatchNota(evento: Record<string, unknown> | null | undefined) {
  const data = ((evento as Record<string, unknown>)?.data || {}) as Record<string, any>;
  const invoiceId = String(data.id || '');
  if (!invoiceId) return { invoiceId: '', patch: null };

  const patch: Record<string, unknown> = {
    status: data.status,
    atualizado_em: new Date().toISOString(),
  };
  if (data.number != null) patch.number = String(data.number);
  if (data.authorization?.protocol) patch.protocolo = data.authorization.protocol;
  if (data.processingDetail) {
    patch.processing_status = data.processingDetail.status;
    patch.processing_message = data.processingDetail.message;
    patch.processing_code = data.processingDetail.code;
  }
  return { invoiceId, patch };
}

// Ordem esperada do pipeline de uma NF-e (enum de nota_fiscal.status, 0018).
// authorized/rejected têm o MESMO rank: são os dois resultados finais
// POSSÍVEIS do mesmo processamento — nunca os dois juntos para o mesmo
// invoiceId. canceled/denied/disabled/removed são ações administrativas
// que só fazem sentido DEPOIS de autorizada.
const RANK_STATUS: Record<string, number> = {
  created: 0,
  enqueued: 1,
  received: 2,
  inContingent: 3,
  authorized: 4,
  rejected: 4,
  canceled: 5,
  denied: 5,
  disabled: 5,
  removed: 5,
};

// Trava de evento fora de ordem: a Spedy pode reenviar (retry) um webhook
// atrasado depois que um mais recente já chegou. Sem isso, uma nota já
// AUTORIZADA podia voltar para 'rejected' (ou até para 'enqueued') só
// porque a entrega chegou fora de ordem — dado fiscal errado gravado por
// causa da rede, não da SEFAZ.
//
// Regra: bloqueia (a) qualquer regressão para um estágio de rank menor, e
// (b) a troca entre os dois resultados finais contraditórios (authorized
// ⇄ rejected) do mesmo invoiceId. Status desconhecido (fora do enum) nunca
// é bloqueado por excesso de zelo — rank Infinity, sempre "avança".
export function podeAplicarStatusWebhook(
  statusAtual: string | null | undefined,
  statusNovo: string | null | undefined,
): boolean {
  if (!statusNovo) return true;
  if (!statusAtual || statusAtual === statusNovo) return true;

  const rAtual = RANK_STATUS[statusAtual] ?? -1;
  const rNovo = RANK_STATUS[statusNovo] ?? Infinity;

  if (rNovo < rAtual) return false; // regressão para estágio anterior (retry atrasado)
  if (rAtual === 4 && rNovo === 4) return false; // authorized ⇄ rejected: contradição
  return true;
}

// ── Emissão (emitir): guardas antes de chamar a Spedy ────────────────────

// Certificado A1: só sabemos se foi enviado porque certificado() grava a
// validade devolvida pela Spedy em canal_credencial.credenciais (nunca o
// arquivo nem a senha — ver comentário em spedy-api/index.ts). Sem essa
// marca, a loja nunca enviou certificado nenhum.
export function certificadoValido(
  credenciais: Record<string, unknown> | null | undefined,
  agoraISO: string = new Date().toISOString(),
): { ok: true } | { ok: false; motivo: string } {
  const expiraEm = credenciais?.certificado_expira_em as string | undefined;
  if (!expiraEm) {
    return {
      ok: false,
      motivo:
        'O certificado digital A1 desta loja ainda não foi enviado. Vá em Configurações → Emissão de NF-e e envie o certificado antes de emitir.',
    };
  }
  if (new Date(expiraEm).getTime() < new Date(agoraISO).getTime()) {
    return {
      ok: false,
      motivo: `O certificado digital A1 desta loja está vencido desde ${new Date(expiraEm).toLocaleDateString('pt-BR')}. Envie um certificado novo em Configurações → Emissão de NF-e antes de emitir.`,
    };
  }
  return { ok: true };
}

// Lista (não escolhe) os campos tributários que faltam em config_fiscal —
// mesma regra de sempre: nenhum valor é inventado aqui, só apontamos o que
// falta preencher com o contador.
export function camposFiscaisFaltando(
  configFiscal: Record<string, unknown> | null | undefined,
): string[] {
  const cf = configFiscal || {};
  const faltando: string[] = [];
  if (!cf.ncm) faltando.push('ncm');
  if (!cf.cfop) faltando.push('cfop');
  if (!cf.icms || typeof cf.icms !== 'object' || Object.keys(cf.icms as object).length === 0) {
    faltando.push('icms');
  }
  return faltando;
}

// Mensagem para quando a Spedy está fora do ar / a chamada dá timeout —
// erro de REDE (fetch rejeitado), não uma resposta HTTP com corpo de erro.
// A venda já foi gravada antes deste ponto (emitir roda fire-and-forget
// depois do insert em vendas) — este texto só explica a nota, nunca a venda.
export function mensagemFalhaRedeSpedy(erro: unknown): string {
  const bruto = String((erro as Error)?.message || erro || 'erro desconhecido');
  return `Não foi possível falar com a Spedy agora (${bruto}). A venda foi registrada normalmente; a nota fiscal será reenviada quando o serviço voltar (rode a emissão de novo, ou aguarde a reconciliação automática).`;
}
