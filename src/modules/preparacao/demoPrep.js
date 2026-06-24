// Store de demonstração da preparação (em memória, mutável).
// É a FONTE ÚNICA do custo de preparação no modo demo: o Estoque lê daqui
// para calcular o lucro de cada carro (custo = soma dos gastos do veículo).
// Chaveado por "codigo" do veículo (estável entre re-renders).

const uid = () =>
  globalThis.crypto?.randomUUID?.() || 'demo-' + Math.random().toString(36).slice(2);

const g = (descricao, data, forma_pgto, valor, status, observacoes = '') => ({
  id: uid(),
  descricao,
  data,
  forma_pgto,
  valor,
  status,
  observacoes,
});

// Seed espelhando o protótipo (datas em ISO).
const prepStore = {
  '8180569': [g('Troca de óleo e relação', '2026-06-12', 'Dinheiro', 280, 'pago')],
  '8176153': [
    g('Retífica parcial do motor', '', 'Boleto', 1800, 'pendente', 'Oficina do Zé'),
    g('Higienização interna', '2026-06-03', 'PIX', 300, 'pago'),
  ],
  '8173736': [
    g('Funilaria porta dianteira', '', '', 1200, 'pendente'),
    g('Troca de bateria', '2026-06-06', 'Cartão', 500, 'pago'),
  ],
  '8166619': [
    g('Polimento técnico', '2026-06-09', 'PIX', 350, 'pago'),
    g('Revisão de suspensão', '', '', 600, 'pendente'),
  ],
  '8150220': [
    g('Revisão completa', '2026-05-22', 'Boleto', 1900, 'pago'),
    g('4 pneus novos', '2026-05-24', 'Cartão', 700, 'pago'),
  ],
  '8148990': [
    g('Reparo ar-condicionado', '2026-05-18', 'PIX', 900, 'pago'),
    g('Polimento premium', '2026-05-20', 'Dinheiro', 600, 'pago'),
  ],
};

export const FORMAS_PGTO = ['PIX', 'Dinheiro', 'Cartão', 'Boleto', 'Transferência'];

export function gastosDemo(codigo) {
  const k = String(codigo);
  if (!prepStore[k]) prepStore[k] = [];
  return prepStore[k];
}

export function setGastosDemo(codigo, arr) {
  prepStore[String(codigo)] = arr;
}

export function totalPrepDemo(codigo) {
  return gastosDemo(codigo).reduce((s, x) => s + (Number(x.valor) || 0), 0);
}

export function novoGastoDemo() {
  return g('', '', '', 0, 'pendente');
}

// Adiciona um gasto preenchido (vindo do formulário) ao carro. É o ponto de
// fonte única: o mesmo registro aparece na Preparação e no Financeiro.
export function addGastoPreparacao(codigo, { descricao, valor, status = 'pendente', observacao = '', data }) {
  gastosDemo(codigo).push(
    g(descricao || '', data || new Date().toISOString().slice(0, 10), '', Number(valor) || 0, status, observacao || '')
  );
}

// Todos os gastos de preparação (achatados, com o código do carro) — usado
// pelo Financeiro para consolidar a preparação do mês pela data de cada gasto.
export function allGastosDemo() {
  return Object.entries(prepStore).flatMap(([codigo, arr]) =>
    arr.map((x) => ({ ...x, codigo }))
  );
}
