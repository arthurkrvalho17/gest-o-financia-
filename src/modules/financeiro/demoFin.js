// Store de demonstração do Financeiro (despesas fixas/outras por mês, mutável).
// Cada mês mantém suas próprias planilhas — meses passados continuam editáveis.
// A preparação NÃO está aqui (vem de preparacao_gastos). Mesma ideia do schema.

const uid = () =>
  globalThis.crypto?.randomUUID?.() || 'demo-' + Math.random().toString(36).slice(2);

const d = (descricao, vencimento, valor, status, data_pgto = '', observacoes = '', lembrete = null) => ({
  id: uid(),
  descricao,
  vencimento,
  valor,
  status,
  data_pgto,
  observacoes,
  lembrete_ativo: !!lembrete,
  lembrete_dia: lembrete?.dia ?? null,
  lembrete_hora: lembrete?.hora ?? null,
});

// chave = 'YYYY-MM'
const despesasStore = {
  '2026-06': {
    fixas: [
      d('Aluguel do Ponto Comercial', 'Todo dia 15', 3000, 'pago', '15/05', '', { dia: 15, hora: '09:00' }),
      d('Energia Elétrica', 'Todo dia 14', 493.69, 'pago', '14/05'),
      d('Água', 'Todo dia 23', 1207.5, 'pago', '23/05'),
      d('Internet', 'Todo dia 7', 100, 'pago', '07/05'),
      d('Salário Funcionário Lucas', 'Todo dia 21', 821, 'pago', '21/05'),
      d('Salário Funcionário Pereira', 'Todo dia 5', 1621, 'pago', '05/05'),
      d('Pró-labore Danilo', 'Todo dia 10', 2000, 'pago', '10/05'),
      d('Gastos Tráfego Pago', '—', 0, 'pago', '', 'R$ 1.350 pago à parte'),
      d('Boleto SIAC', 'Todo dia 1', 61, 'pago', '01/05'),
      d('Mercado Livre', 'Todo dia 1', 590, 'pago', '01/05'),
      d('Prestação IA', 'Todo dia 19', 1250, 'pago', '19/05'),
      d('Prestação IPTU', 'Todo dia 19', 171, 'pendente', '', '', { dia: 19, hora: '10:00' }),
      d('Empréstimo', 'Todo dia 23', 1160, 'pago', '23/05'),
    ],
    outras: [
      d('Manutenção do letreiro', '22/05', 480, 'pago', '22/05'),
      d('Material de limpeza', '15/05', 220, 'pago', '15/05'),
      d('Cafezinho / copa', '—', 180, 'pago', '10/05'),
      d('Brinde para cliente', '—', 320, 'pendente', '', '3 kits'),
    ],
  },
  '2026-05': {
    fixas: [
      d('Aluguel do Ponto Comercial', 'Todo dia 15', 3000, 'pago', '15/05'),
      d('Energia Elétrica', 'Todo dia 14', 512.4, 'pago', '14/05'),
      d('Água', 'Todo dia 23', 1180, 'pago', '23/05'),
      d('Salários + pró-labore', '—', 4442, 'pago', '05/05', 'Lucas, Pereira, Danilo'),
      d('Prestação IA', 'Todo dia 19', 1250, 'pago', '19/05'),
      d('Empréstimo', 'Todo dia 23', 1160, 'pago', '23/05'),
    ],
    outras: [
      d('Marketing e brindes', '—', 900, 'pago', '12/05'),
      d('Manutenção predial', '—', 1000, 'pago', '18/05'),
    ],
  },
  '2026-04': {
    fixas: [
      d('Aluguel do Ponto Comercial', 'Todo dia 15', 3000, 'pago', '15/04'),
      d('Energia + Água + Internet', '—', 1820, 'pago', '14/04'),
      d('Salários + pró-labore', '—', 4442, 'pago', '05/04'),
      d('Prestação IA', 'Todo dia 19', 1250, 'pago', '19/04'),
      d('Empréstimo', 'Todo dia 23', 1160, 'pago', '23/04'),
    ],
    outras: [d('Material de escritório', '—', 600, 'pago', '09/04')],
  },
  '2026-03': {
    fixas: [
      d('Aluguel do Ponto Comercial', 'Todo dia 15', 3000, 'pago', '15/03'),
      d('Energia + Água + Internet', '—', 1760, 'pago', '14/03'),
      d('Salários + pró-labore', '—', 4442, 'pago', '05/03'),
      d('Prestação IA', 'Todo dia 19', 1250, 'pago', '19/03'),
    ],
    outras: [d('Reparo no letreiro', '—', 480, 'pago', '20/03')],
  },
};

// Resumo de faturamento/lucro de meses PASSADOS (no mês atual tudo é calculado
// ao vivo a partir das vendas reais). Espelha o histórico do protótipo.
export const mesesPassados = [
  { mes: '2026-05', nome: 'Maio', faturamento: 402000, lucroVendidos: 46800 + 12475 + 1900, vendas: 14, preparacao: 8900, carros: [['Compass Sport', 11400], ['Corolla XEI', 8700], ['Kicks SV', 6900]] },
  { mes: '2026-04', nome: 'Abril', faturamento: 318000, lucroVendidos: 38100 + 12100 + 1800, vendas: 11, preparacao: 7400, carros: [['Creta Action', 9200], ['Tracker LT', 7800], ['Argo Drive', 5100]] },
  { mes: '2026-03', nome: 'Março', faturamento: 241000, lucroVendidos: 22400 + 11900 + 1700, vendas: 8, preparacao: 6200, carros: [['HB20 Sense', 6100], ['Gol 1.0', 4300], ['Onix LT', 5500]] },
];

export function despesasDemo(mesKey, categoria) {
  if (!despesasStore[mesKey]) despesasStore[mesKey] = { fixas: [], outras: [] };
  const cat = categoria === 'fixa' ? 'fixas' : 'outras';
  return despesasStore[mesKey][cat];
}
export function setDespesasDemo(mesKey, categoria, arr) {
  if (!despesasStore[mesKey]) despesasStore[mesKey] = { fixas: [], outras: [] };
  despesasStore[mesKey][categoria === 'fixa' ? 'fixas' : 'outras'] = arr;
}
export function novaDespesaDemo() {
  return d('', '', 0, 'pendente');
}
export const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
