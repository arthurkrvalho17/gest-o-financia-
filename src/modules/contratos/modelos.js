// Modelos de documento e seus campos. Cada campo: { key, label, dinheiro?, textarea?, full?, valorPadrao?, date? }.

const T = (key, label, opts = {}) => ({ key, label, ...opts });

// Campos do "cliente" (bloco único). Cada modelo escolhe quais usar e o rótulo do bloco.
export const CLIENTE_CAMPOS = {
  nome: { label: 'Nome completo', full: true },
  cpf: { label: 'CPF' },
  nascimento: { label: 'Data de nascimento', date: true },
  estado_civil: { label: 'Estado civil' },
  telefone: { label: 'Telefone' },
  email: { label: 'E-mail' },
  endereco: { label: 'Endereço completo', full: true },
  nacionalidade: { label: 'Nacionalidade' },
};

export const MODELOS = {
  compra_venda: {
    nome: 'Contrato de compra e venda',
    desc: 'Venda do veículo ao cliente',
    // Bloco ÚNICO do cliente (sem separar "qualificação"); sem nacionalidade.
    clienteTitulo: 'Cliente',
    cliente: ['nome', 'cpf', 'nascimento', 'estado_civil', 'telefone', 'email', 'endereco'],
    grupos: [
      // Dados do veículo vêm do cadastro no estoque.
      { titulo: 'Negociação', campos: [
        T('vendedor_nome', 'Vendedor'),
        T('data_venda', 'Data da venda', { date: true }),
        T('valor_venda', 'Valor da venda', { dinheiro: true }),
        T('forma_pagamento', 'Forma de pagamento', { full: true }),
        T('observacoes', 'Observações', { textarea: true, full: true }),
      ] },
      { titulo: 'Situação de regularidade (Cláusula Nona)', campos: [
        T('tributos', 'Valor aproximado dos tributos'),
        T('multas_abertas', 'Multas e taxas anuais em aberto'),
        T('furto', 'Furto'),
        T('alienacao', 'Alienação fiduciária'),
        T('registros_impeditivos', 'Outros registros impeditivos', { full: true }),
        T('troca_valor', 'Valor do veículo dado em troca', { dinheiro: true }),
      ] },
    ],
  },
  recibo_sinal: {
    nome: 'Recibo de sinal',
    desc: 'Entrada / reserva do veículo',
    notaLegal: 'Sinal = arras (arts. 417–420 do Código Civil): se o cliente desiste, perde o sinal; se a loja desiste, devolve em dobro.',
    // Cliente unificado (nome, CPF, nascimento, telefone e endereço juntos).
    clienteTitulo: 'Cliente',
    cliente: ['nome', 'cpf', 'nascimento', 'telefone', 'endereco'],
    grupos: [
      { titulo: 'Valores', campos: [
        T('valor_sinal', 'Valor do sinal recebido', { dinheiro: true }),
        T('observacoes', 'Observações', { textarea: true, full: true }),
      ] },
    ],
  },
  consignacao: {
    nome: 'Contrato de consignação',
    desc: 'Carro de terceiro à venda na loja',
    // O consignante (empresa) vem preenchido do cadastro do veículo consignado.
    clienteTitulo: 'Consignante (dono — empresa)',
    cliente: [],
    grupos: [
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
    // Outorgante = cliente (dono que outorga os poderes).
    clienteTitulo: 'Outorgante (cliente)',
    cliente: ['nome', 'cpf', 'nacionalidade', 'estado_civil', 'endereco'],
    grupos: [
      { titulo: 'Outorgado (procurador)', campos: [
        T('outorgado_nome', 'Nome do outorgado', { full: true }),
        T('outorgado_cpf', 'CPF'),
        T('outorgado_nacionalidade', 'Nacionalidade'),
        T('outorgado_estado_civil', 'Estado civil'),
        T('outorgado_endereco', 'Endereço completo', { full: true }),
      ] },
      // Dados do veículo vêm do cadastro no estoque.
      { titulo: 'Procuração', campos: [
        T('cidade_procuracao', 'Cidade'),
        T('data_procuracao', 'Data', { date: true }),
      ] },
    ],
  },
  test_drive: {
    nome: 'Termo de test drive',
    desc: 'Responsabilidade durante o test drive',
    // Condutor = cliente, com endereço completo.
    clienteTitulo: 'Condutor',
    cliente: ['nome', 'cpf', 'nascimento', 'telefone', 'endereco'],
    grupos: [
      { titulo: 'CNH', campos: [
        T('cnh_numero', 'CNH (número)'), T('cnh_categoria', 'Categoria'),
        T('cnh_validade', 'Validade da CNH'),
      ] },
      { titulo: 'Test drive', campos: [
        T('data_hora', 'Data e hora'),
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

// Campos do cliente exibidos no bloco único (lista de defs {key, ...}).
export function camposCliente(tipo) {
  return (MODELOS[tipo]?.cliente || []).map((k) => ({ key: k, ...CLIENTE_CAMPOS[k] }));
}

// Todos os campos extras achatados (para o formulário e valores padrão).
export function camposExtra(tipo) {
  return (MODELOS[tipo]?.grupos || []).flatMap((g) => g.campos);
}
