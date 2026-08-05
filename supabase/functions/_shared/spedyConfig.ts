// Lógica PURA da configuração de emissão da Spedy (sem Deno/rede) — usada
// pela spedy-api e importável nos testes (vitest) sem tocar a Spedy real.
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

// Default por ambiente. No sandbox o default NUNCA é 'production': a doc
// avisa que é possível configurar production DENTRO do sandbox e a nota sai
// com validade fiscal REAL. Override explícito via SPEDY_ENVIRONMENT_TYPE
// (validado contra o enum; valor desconhecido cai no default seguro).
export function resolverEnvironmentType(sandbox: boolean, override?: string | null): EnvironmentType {
  if (override && (ENVIRONMENT_TYPES as readonly string[]).includes(override)) {
    return override as EnvironmentType;
  }
  return sandbox ? 'development' : 'production';
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
