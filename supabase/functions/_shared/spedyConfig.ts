// Lógica PURA da configuração de emissão da Spedy (sem Deno/rede) — usada
// pela spedy-api e importável nos testes (vitest) sem tocar a Spedy real.
//
// Contexto (doc pages/guides/configuracao-inicial e primeiros-passos):
// antes de emitir, a empresa precisa de PUT /v1/companies/{id}/settings com
// productInvoice.{environmentType, series, nextNumber}. O PUT SUBSTITUI os
// campos do bloco enviado — campo omitido volta ao default (environmentType
// volta a um valor INVÁLIDO). Por isso o fluxo é sempre GET → altera só o
// necessário → PUT do bloco completo. Nunca PUT cego.

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
