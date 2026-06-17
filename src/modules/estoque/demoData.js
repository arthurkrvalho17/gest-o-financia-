// Dados de demonstração no MESMO formato das tabelas do Supabase
// (veiculos / vendas). Usados só quando o Supabase não está configurado,
// para a tela ser navegável antes de plugar o backend. Espelha o protótipo.

const uid = () =>
  globalThis.crypto?.randomUUID?.() || 'demo-' + Math.random().toString(36).slice(2);

function v(o) {
  return {
    id: uid(),
    loja_id: 'demo',
    saida: null,
    marcador_texto: null,
    marcador_cor: null,
    ...o,
  };
}

// À venda
const aVenda = [
  v({ codigo: '8180569', modelo: 'Fazer YS250', fab_mod: '2015/2015', cor: 'Preto', placa: 'PAJ3H94', tipo: 'proprio', entrada: '2026-06-12', situacao: 'estoque', compra: 12500, pedido: 16900, minimo: 15500 }),
  v({ codigo: '8179093', modelo: 'Palio Fire', fab_mod: '2016/2016', cor: 'Prata', placa: 'PAR4046', tipo: 'consignado', entrada: '2026-06-11', situacao: 'estoque', compra: 29900, pedido: 32900, minimo: 31000 }),
  v({ codigo: '8176153', modelo: 'Corolla GLI Flex', fab_mod: '2012/2013', cor: 'Preto', placa: 'JKE2297', tipo: 'proprio', entrada: '2026-06-11', situacao: 'estoque', compra: 53000, pedido: 62900, minimo: 59000 }),
  v({ codigo: '8173736', modelo: 'Cruze LTZ HB', fab_mod: '2012/2012', cor: 'Preto', placa: 'JKC1933', tipo: 'consignado', entrada: '2026-06-10', situacao: 'estoque', compra: 55000, pedido: 58900, minimo: 56500, marcador_texto: 'REPASSE', marcador_cor: '#B5704A' }),
  v({ codigo: '8173719', modelo: 'Golf Highline AA', fab_mod: '2013/2014', cor: 'Preto', placa: 'JKQ7445', tipo: 'consignado', entrada: '2026-06-10', situacao: 'reservado', compra: 60000, pedido: 64900, minimo: 62000 }),
  v({ codigo: '8173682', modelo: 'Gol Special MB', fab_mod: '2015/2015', cor: 'Branco', placa: 'PQC3867', tipo: 'consignado', entrada: '2026-06-10', situacao: 'estoque', compra: 36000, pedido: 38900, minimo: 37000 }),
  v({ codigo: '8166677', modelo: 'Ranger XLT CD', fab_mod: '2019/2019', cor: 'Branco', placa: 'PBT7C23', tipo: 'consignado', entrada: '2026-06-08', situacao: 'estoque', compra: 131000, pedido: 139900, minimo: 135000 }),
  v({ codigo: '8166619', modelo: 'Civic LXS Flex', fab_mod: '2008/2008', cor: 'Prata', placa: 'JRE0H31', tipo: 'proprio', entrada: '2026-06-08', situacao: 'estoque', compra: 39000, pedido: 45900, minimo: 43000 }),
];

// Vendidos (veículo + a venda correspondente)
const vendidosBase = [
  { codigo: '8150220', modelo: 'HB20 Comfort', fab_mod: '2020/2020', cor: 'Prata', placa: 'QPA7H45', tipo: 'proprio', entrada: '2026-05-10', saida: '2026-06-02', situacao: 'vendido', compra: 50000, pedido: 61500, minimo: 58000, valor_venda: 61500 },
  { codigo: '8148990', modelo: 'Tracker Premier', fab_mod: '2021/2021', cor: 'Branco', placa: 'TRK2B21', tipo: 'proprio', entrada: '2026-05-13', saida: '2026-05-28', situacao: 'vendido', compra: 95000, pedido: 114900, minimo: 110000, valor_venda: 114900 },
  { codigo: '8147112', modelo: 'Onix Plus LT', fab_mod: '2021/2021', cor: 'Preto', placa: 'ONX2C21', tipo: 'consignado', entrada: '2026-05-05', saida: '2026-05-22', situacao: 'repasse', compra: 64000, pedido: 67900, minimo: 65000, valor_venda: 67900 },
];

const vendidos = vendidosBase.map((b) =>
  v({
    codigo: b.codigo, modelo: b.modelo, fab_mod: b.fab_mod, cor: b.cor, placa: b.placa,
    tipo: b.tipo, entrada: b.entrada, saida: b.saida, situacao: b.situacao,
    compra: b.compra, pedido: b.pedido, minimo: b.minimo,
  })
);

const vendas = vendidos.map((veic, i) => ({
  id: uid(),
  loja_id: 'demo',
  veiculo_id: veic.id,
  valor_venda: vendidosBase[i].valor_venda,
  data_venda: vendidosBase[i].saida,
  comprador_nome: null,
  forma_pagamento: 'avista',
}));

// Custo de preparação por código (vem da Fase 2 no sistema real; aqui é só demo).
export const demoCustos = {
  8180569: 500, 8179093: 500, 8176153: 2100, 8173736: 900, 8173719: 1400,
  8173682: 700, 8166677: 2400, 8166619: 1700,
  8150220: 2800, 8148990: 2800, 8147112: 1100,
};

export function demoVeiculos() {
  // cópia profunda para o estado poder mutar sem afetar o módulo
  return [...aVenda, ...vendidos].map((x) => ({ ...x }));
}
export function demoVendas() {
  return vendas.map((x) => ({ ...x }));
}
