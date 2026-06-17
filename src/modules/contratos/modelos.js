// Modelos de documento e seus campos específicos.
export const MODELOS = {
  compra_venda: { nome: 'Contrato de compra e venda', desc: 'Venda do veículo ao cliente', extra: [] },
  recibo_sinal: { nome: 'Recibo de sinal', desc: 'Entrada / reserva do veículo', extra: [{ key: 'valor_sinal', label: 'Valor do sinal', dinheiro: true }] },
  consignacao: { nome: 'Contrato de consignação', desc: 'Carro de terceiro à venda na loja', extra: [{ key: 'consignante_nome', label: 'Nome do consignante' }, { key: 'consignante_cpf', label: 'CPF do consignante' }] },
  test_drive: { nome: 'Termo de test drive', desc: 'Responsabilidade durante o test drive', extra: [{ key: 'cnh', label: 'CNH do condutor' }] },
  procuracao: { nome: 'Procuração', desc: 'Transferência junto ao Detran', extra: [{ key: 'finalidade', label: 'Finalidade' }] },
  nota_entrada: { nome: 'Nota de entrada', desc: 'Compra de carro de particular', extra: [{ key: 'vendedor_nome', label: 'Vendedor (particular)' }, { key: 'vendedor_cpf', label: 'CPF do vendedor' }] },
};

export const ORDEM_MODELOS = [
  'compra_venda', 'recibo_sinal', 'consignacao', 'test_drive', 'procuracao', 'nota_entrada',
];
