// Lógica PURA da integração RENAVE (Renave Fácil) — sem rede, sem Deno, sem
// Supabase. Fica separada de `renave-api/index.ts` pelo mesmo motivo do
// `spedyConfig.ts`: montagem de payload e validação de campo faltando são o
// que mais erra e o que mais barato se testa — e testar isso não pode exigir
// runtime Deno nem chamada de verdade (que aqui seria SEMPRE em produção,
// porque a Renave Fácil não tem sandbox).
//
// Nomes de campo do lado da Renave Fácil (camelCase: chassi, anoFabricacao,
// dtHrProcesso...) só aparecem aqui e no index.ts. O resto do sistema fala
// snake_case do nosso banco.

export const RENAVE_API_URL_PADRAO = 'https://api.renavefacil.net/v2/integration';

// Fuso do processo. dtHrProcesso é carimbo de um processo administrativo
// brasileiro; mandar UTC faria 21h de São Paulo virar meia-noite do DIA
// SEGUINTE no documento. Local é a leitura defensável — mas a doc não diz
// qual fuso ela espera, então fica configurável por env (RENAVE_TIMEZONE) e
// listado como pendência a confirmar com a integradora.
export const RENAVE_TIMEZONE_PADRAO = 'America/Sao_Paulo';

export function normalizarUrlBase(url?: string | null): string {
  const bruta = (url || '').trim() || RENAVE_API_URL_PADRAO;
  return bruta.replace(/\/+$/, '');
}

// "YYYY-MM-DDTHH:MM:SS" — sem timezone, sem milissegundos, como a doc mostra.
//
// IMPORTANTE (regra do pedido, item 2): isto é o momento do ENVIO, nunca a
// data de entrada do veículo no estoque (`veiculos.entrada`). Quem chama
// passa `new Date()`; o parâmetro existe só para o teste conseguir fixar o
// instante.
export function formatarDtHrProcesso(agora: Date, timeZone: string = RENAVE_TIMEZONE_PADRAO): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(agora);

  const p: Record<string, string> = {};
  for (const parte of partes) p[parte.type] = parte.value;
  // hour12:false devolve '24' para meia-noite em alguns runtimes (bug clássico
  // de Intl) — '24:10:00' seria recusado como hora inválida.
  const hora = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hora}:${p.minute}:${p.second}`;
}

export function apenasDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

function vazio(valor: unknown): boolean {
  return valor == null || String(valor).trim() === '';
}

// ── Validação de campos faltando ──────────────────────────────────────────
// Devolve NOMES DE COLUNA do nosso banco (não os nomes camelCase da Renave
// Fácil): quem lê o erro é o lojista/suporte olhando o cadastro do veículo,
// não a doc da integradora. O rótulo amigável sai em `rotularCampos`.

const ROTULOS: Record<string, string> = {
  chassi: 'chassi',
  renavam: 'RENAVAM',
  ano_fabricacao: 'ano de fabricação',
  ano_modelo: 'ano do modelo',
  placa: 'placa',
  descricao: 'descrição',
  chave_nfe_compra: 'chave da NF-e de compra',
  valor_compra: 'valor de compra',
  vendedor_origem_nome: 'nome do vendedor de origem',
  vendedor_origem_cpf_cnpj: 'CPF/CNPJ do vendedor de origem',
  vendedor_origem_cep: 'CEP do vendedor de origem',
  vendedor_origem_logradouro: 'logradouro do vendedor de origem',
  vendedor_origem_numero: 'número do endereço do vendedor de origem',
  vendedor_origem_bairro: 'bairro do vendedor de origem',
  vendedor_origem_cidade: 'cidade do vendedor de origem',
  vendedor_origem_uf: 'UF do vendedor de origem',
};

export function rotularCampos(campos: string[]): string {
  return campos.map((c) => ROTULOS[c] || c).join(', ');
}

// Identificação do veículo exigida pela Renave Fácil para cadastro e para
// qualquer NF-e (0030 documenta a auditoria da API campo a campo).
export const CAMPOS_VEICULO_RENAVE = ['chassi', 'renavam', 'ano_fabricacao', 'ano_modelo'] as const;

export function camposVeiculoFaltando(veiculo: Record<string, unknown> | null | undefined): string[] {
  if (!veiculo) return [...CAMPOS_VEICULO_RENAVE];
  return CAMPOS_VEICULO_RENAVE.filter((c) => vazio(veiculo[c]));
}

// Vendedor de origem = de quem a loja comprou (colunas da 0030). `complemento`
// fica DE FORA de propósito: endereço sem complemento é o caso normal, exigir
// isso bloquearia cadastro correto — vai como '' quando não houver.
export const CAMPOS_VENDEDOR_ORIGEM = [
  'vendedor_origem_nome',
  'vendedor_origem_cpf_cnpj',
  'vendedor_origem_cep',
  'vendedor_origem_logradouro',
  'vendedor_origem_numero',
  'vendedor_origem_bairro',
  'vendedor_origem_cidade',
  'vendedor_origem_uf',
] as const;

export function camposVendedorOrigemFaltando(veiculo: Record<string, unknown> | null | undefined): string[] {
  if (!veiculo) return [...CAMPOS_VENDEDOR_ORIGEM];
  return CAMPOS_VENDEDOR_ORIGEM.filter((c) => vazio(veiculo[c]));
}

// Regra 4 do pedido: antes de enviar a NF-e de COMPRA, tudo tem que estar lá —
// identificação do veículo + vendedor de origem + a chave da nota + o valor.
// Faltando qualquer um, o erro NOMEIA os campos e nada é enviado pela metade.
export function camposCompraFaltando(
  veiculo: Record<string, unknown> | null | undefined,
  valor: unknown,
): string[] {
  const faltando = [...camposVeiculoFaltando(veiculo), ...camposVendedorOrigemFaltando(veiculo)];
  if (vazio(veiculo?.chave_nfe_compra)) faltando.push('chave_nfe_compra');
  if (valor == null || Number(valor) <= 0) faltando.push('valor_compra');
  return faltando;
}

// ── tipoVeiculo (N novo | U usado) ────────────────────────────────────────
// NÃO é `veiculos.tipo` (que é proprio|consignado — outro eixo). O sistema não
// tem hoje nenhuma coluna que diga "zero km": o default é 'U', porque o
// produto inteiro é revenda de usado. Quem souber o contrário passa no body,
// e o valor é validado — nunca chutado a partir de km/ano.
export function resolverTipoVeiculo(informado?: unknown): 'N' | 'U' {
  const v = String(informado ?? '').toUpperCase();
  if (v === 'N' || v === 'U') return v;
  if (v !== '') throw new Error("tipoVeiculo precisa ser 'N' (novo) ou 'U' (usado).");
  return 'U';
}

// ── Montagem de payloads ──────────────────────────────────────────────────

// POST/PUT /dms/{cnpjEstab}/client — campos conforme a auditoria registrada na
// 0030. A doc pública não lista o shape completo de `client`; estes são os que
// ela cita nominalmente. Nada é inventado além disso.
export function montarPayloadCliente(veiculo: Record<string, any>): Record<string, unknown> {
  return {
    cpfCnpj: apenasDigitos(veiculo.vendedor_origem_cpf_cnpj),
    razaoSocial: String(veiculo.vendedor_origem_nome || '').trim(),
    cep: apenasDigitos(veiculo.vendedor_origem_cep),
    logradouro: String(veiculo.vendedor_origem_logradouro || '').trim(),
    numero: String(veiculo.vendedor_origem_numero || '').trim(),
    complemento: String(veiculo.vendedor_origem_complemento || '').trim(),
    bairro: String(veiculo.vendedor_origem_bairro || '').trim(),
    cidade: String(veiculo.vendedor_origem_cidade || '').trim(),
    uf: String(veiculo.vendedor_origem_uf || '').trim().toUpperCase(),
  };
}

// POST/PUT /dms/{cnpjEstab}/vehicle — anoFabricacao/anoModelo são Number na
// doc (por isso as colunas int da 0030, e não o `fab_mod` texto). placa e
// renavam vão como '' quando ausentes (veículo novo), nunca como null.
export function montarPayloadVeiculo(
  veiculo: Record<string, any>,
  tipoVeiculo: 'N' | 'U',
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tipoVeiculo,
    chassi: String(veiculo.chassi || '').trim().toUpperCase(),
    descricao: String(veiculo.descricao || veiculo.modelo || '').trim(),
    anoFabricacao: Number(veiculo.ano_fabricacao),
    anoModelo: Number(veiculo.ano_modelo),
    placa: String(veiculo.placa || '').trim().toUpperCase(),
    renavam: apenasDigitos(veiculo.renavam),
  };
  // codigoFipe é opcional na doc — omitido quando não temos, nunca ''.
  if (!vazio(veiculo.codigo_fipe)) payload.codigoFipe = String(veiculo.codigo_fipe).trim();
  return payload;
}

// POST /dms/{cnpjEstab}/vehicle/nfe/{purchase|sales|transfer} — mesmo shape
// nas três rotas; o que muda é de quem é o cpfCnpj (vendedor na compra,
// comprador na venda) e de onde vem a chave.
export function montarPayloadNfe(dados: {
  chassi: string;
  tipoVeiculo: 'N' | 'U';
  chaveNfe: string;
  cpfCnpj: string;
  dtHrProcesso: string;
  valor: number;
}): Record<string, unknown> {
  return {
    chassi: String(dados.chassi || '').trim().toUpperCase(),
    tipoVeiculo: dados.tipoVeiculo,
    chaveNfe: apenasDigitos(dados.chaveNfe),
    cpfCnpj: apenasDigitos(dados.cpfCnpj),
    dtHrProcesso: dados.dtHrProcesso,
    valor: Number(dados.valor),
  };
}

// ── Rotas ─────────────────────────────────────────────────────────────────

export const ROTA_NFE = {
  enviar_nfe_compra: 'purchase',
  enviar_nfe_venda: 'sales',
  enviar_nfe_transferencia: 'transfer',
} as const;

export type AcaoNfe = keyof typeof ROTA_NFE;

// GET /renave/{cnpjEstab}/docs/{...} — só os três que a doc expõe (leitura).
export const ROTA_DOCUMENTO = {
  atpve_entrada: 'atpve/entrada',
  atpve_saida: 'atpve/saida',
  crlve: 'crlve',
} as const;

export function rotaDocumento(tipo: string): string {
  const rota = (ROTA_DOCUMENTO as Record<string, string>)[tipo];
  if (!rota) {
    throw new Error(
      `Tipo de documento desconhecido: ${tipo}. Use ${Object.keys(ROTA_DOCUMENTO).join(' | ')}.`,
    );
  }
  return rota;
}

// `renave_registro` é única por (veiculo_id, evento) e `evento` só aceita
// 'entrada'|'saida' (0017 + 0029). O status da Renave Fácil, porém, é POR
// VEÍCULO, não por evento — então cada ação precisa de um eixo determinado
// para gravar a auditoria. Mapa explícito em vez de adivinhação no meio do
// código; quem quiser o outro eixo manda `evento` no body.
export const EVENTO_POR_ACAO: Record<string, 'entrada' | 'saida'> = {
  sincronizar_cliente: 'entrada',
  sincronizar_veiculo: 'entrada',
  enviar_nfe_compra: 'entrada',
  enviar_nfe_venda: 'saida',
  enviar_nfe_transferencia: 'saida', // sai do estabelecimento — não existe modelo próprio disso no banco
  consultar_status: 'entrada',
  baixar_documento: 'entrada',
};

export function resolverEvento(acao: string, informado?: unknown, tipoDocumento?: unknown): 'entrada' | 'saida' {
  const v = String(informado ?? '').trim();
  if (v === 'entrada' || v === 'saida') return v;
  if (v !== '') throw new Error("evento precisa ser 'entrada' ou 'saida'.");
  if (acao === 'baixar_documento' && tipoDocumento === 'atpve_saida') return 'saida';
  return EVENTO_POR_ACAO[acao] || 'entrada';
}

// ── Vocabulário das mensagens ─────────────────────────────────────────────
// NUNCA escrever "registrado no RENAVE" em mensagem, log ou retorno: quem
// dispara o processo legal é o painel da Renave Fácil, não o Financia+ (a doc
// é textual — ver ADR-16 e a 0029). O que o Financia+ faz é ENVIAR dado.
export const DESTINO_ENVIO = 'à Renave Fácil';
export const TEXTO_ENVIADO = `enviado ${DESTINO_ENVIO}`;

// O sujeito da frase muda de gênero conforme o que foi enviado ("o cadastro
// enviado", "a chave enviada") — uma constante única produziria "Chave da
// NF-e enviado à Renave Fácil". Mensagem que o lojista lê não pode sair
// torta.
export function textoEnviado(genero: 'm' | 'f' = 'm'): string {
  return `enviad${genero === 'f' ? 'a' : 'o'} ${DESTINO_ENVIO}`;
}

export function mensagemCamposFaltando(campos: string[]): string {
  return (
    `Não foi ${TEXTO_ENVIADO}: faltam ${rotularCampos(campos)}. ` +
    'Complete o cadastro do veículo antes de enviar — a Renave Fácil recusa o processo pela metade.'
  );
}
