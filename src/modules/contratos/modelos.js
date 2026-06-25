// Modelos de documento e seus campos específicos (pesquisados conforme as
// exigências usuais no Brasil). Cada campo: { key, label, dinheiro?, textarea?, full?, valorPadrao? }.

const T = (key, label, opts = {}) => ({ key, label, ...opts });

export const MODELOS = {
  compra_venda: {
    nome: 'Contrato de compra e venda',
    desc: 'Venda do veículo ao cliente',
    grupos: [
      { titulo: 'Qualificação do comprador', campos: [
        T('nacionalidade', 'Nacionalidade'), T('estado_civil', 'Estado civil'),
        T('endereco', 'Endereço completo', { full: true }),
      ] },
      // Dados do veículo (RENAVAM, chassi, km, combustível) vêm do cadastro no estoque.
      { titulo: 'Negociação', campos: [
        T('valor_venda', 'Valor da venda', { dinheiro: true }),
        T('forma_pagamento', 'Forma de pagamento'),
        T('garantia', 'Garantia'),
        T('observacoes', 'Observações / estado do veículo', { textarea: true, full: true }),
      ] },
    ],
  },
  recibo_sinal: {
    nome: 'Recibo de sinal',
    desc: 'Entrada / reserva do veículo',
    notaLegal: 'Sinal = arras (arts. 417–420 do Código Civil): se o cliente desiste, perde o sinal; se a loja desiste, devolve em dobro.',
    grupos: [
      { titulo: 'Dados do cliente', campos: [
        T('endereco', 'Endereço completo', { full: true }),
      ] },
      { titulo: 'Valores', campos: [
        T('valor_sinal', 'Valor do sinal recebido', { dinheiro: true }),
        T('observacoes', 'Observações', { textarea: true, full: true }),
      ] },
    ],
  },
  consignacao: {
    nome: 'Contrato de consignação',
    desc: 'Carro de terceiro à venda na loja',
    grupos: [
      // O consignante (empresa) vem preenchido do cadastro do veículo consignado.
      { titulo: 'Consignante (dono — empresa)', campos: [
        T('consignante_nome', 'Razão social', { full: true }),
        T('consignante_cnpj', 'CNPJ'), T('consignante_tel', 'Telefone'),
        T('consignante_endereco', 'Endereço completo', { full: true }),
      ] },
      { titulo: 'Termos', campos: [
        T('valor_pretendido', 'Valor de venda pretendido', { dinheiro: true }),
        T('valor_repasse', 'Valor de repasse ao dono', { dinheiro: true }),
        T('comissao', 'Comissão da loja', { dinheiro: true }),
        T('prazo', 'Prazo da consignação'),
        T('responsabilidades', 'Responsabilidades (IPVA, multas, manutenção)', { textarea: true, full: true }),
      ] },
    ],
  },
  procuracao: {
    nome: 'Procuração',
    desc: 'Transferência junto ao Detran',
    grupos: [
      { titulo: 'Outorgado', campos: [
        T('outorgado_nome', 'Nome do outorgado', { full: true }),
        T('outorgado_cpf', 'CPF'), T('outorgado_nascimento', 'Data de nascimento'),
      ] },
      // Dados do veículo (RENAVAM, chassi) vêm do cadastro no estoque.
      { titulo: 'Mandato', campos: [
        T('poderes', 'Poderes', { textarea: true, full: true, valorPadrao: 'Poderes para representar o outorgante junto ao Detran, assinar ATPV-e/CRV e praticar atos para a transferência do veículo.' }),
        T('validade', 'Validade / prazo'), T('cidade', 'Cidade'),
      ] },
    ],
  },
  test_drive: {
    nome: 'Termo de test drive',
    desc: 'Responsabilidade durante o test drive',
    grupos: [
      { titulo: 'Condutor', campos: [
        T('cnh_numero', 'CNH (número)'), T('cnh_categoria', 'Categoria'),
        T('cnh_validade', 'Validade da CNH'), T('telefone', 'Telefone'),
      ] },
      { titulo: 'Test drive', campos: [
        T('data_hora', 'Data e hora'), T('trajeto', 'Trajeto previsto', { full: true }),
        T('declaracao', 'Declaração de responsabilidade', { textarea: true, full: true, valorPadrao: 'O condutor assume total responsabilidade por danos, multas e ocorrências durante o test drive.' }),
      ] },
    ],
  },
};

export const ORDEM_MODELOS = [
  'compra_venda', 'recibo_sinal', 'consignacao', 'procuracao', 'test_drive',
];

// Campos do consignante que vêm do cadastro do veículo consignado (autofill).
export const CAMPOS_CONSIGNANTE = ['consignante_nome', 'consignante_cnpj', 'consignante_tel', 'consignante_endereco'];

// Todos os campos extras achatados (para o formulário e valores padrão).
export function camposExtra(tipo) {
  return (MODELOS[tipo]?.grupos || []).flatMap((g) => g.campos);
}
