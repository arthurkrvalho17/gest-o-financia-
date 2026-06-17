// Dados de demonstração do CRM (leads em memória, mutável) + histórico e pós-venda.

const uid = () =>
  globalThis.crypto?.randomUUID?.() || 'demo-' + Math.random().toString(36).slice(2);

// Etapas do funil (alinhadas ao schema: novo|contato|proposta|fechado|perdido)
export const ETAPAS = [
  { key: 'novo', label: 'Novo lead', accent: '#94A3B8' },
  { key: 'contato', label: 'Em conversa', accent: '#185FA5' },
  { key: 'proposta', label: 'Proposta enviada', accent: '#7C3AED' },
  { key: 'fechado', label: 'Fechado', accent: '#15803D' },
  { key: 'perdido', label: 'Perdido', accent: '#B91C1C' },
];

export const ORIGENS = {
  whatsapp: { label: 'WhatsApp', cls: 'bg-[#E7F6EC] text-[#15803D]' },
  portal: { label: 'Portal', cls: 'bg-[#EAF0FB] text-[#185FA5]' },
  indicacao: { label: 'Indicação', cls: 'bg-[#FBEAF3] text-[#A21670]' },
  balcao: { label: 'Balcão', cls: 'bg-[#EEF2F7] text-[#475569]' },
};

const l = (nome, telefone, origem, etapa, carLabel, valor, diaJunho) => ({
  id: uid(),
  nome,
  telefone,
  origem,
  etapa,
  car_label: carLabel, // conveniência do demo (no real vem de veiculo_id)
  valor,
  criado_em: `2026-06-${String(diaJunho).padStart(2, '0')}`,
});

let leadsStore = [
  l('Marcos Vinícius', '(11) 90000-0001', 'whatsapp', 'novo', 'Onix 1.0 LT', 67900, 14),
  l('Patrícia Gomes', '(11) 90000-0002', 'portal', 'novo', 'HB20 Comfort', 61500, 13),
  l('Roberto Dias', '(11) 90000-0003', 'portal', 'contato', 'Corolla XEI', 104900, 12),
  l('Juliana Reis', '(11) 90000-0004', 'indicacao', 'contato', 'Nivus', 112000, 11),
  l('Anderson Luz', '(11) 90000-0005', 'whatsapp', 'proposta', 'Renegade Sport', 92900, 10),
  l('Camila Souza', '(11) 90000-0006', 'balcao', 'proposta', 'Duster Iconic', 84500, 9),
  l('Felipe Antunes', '(11) 90000-0007', 'whatsapp', 'proposta', 'Pulse Drive', 81900, 8),
  l('Sandra Mello', '(11) 90000-0008', 'portal', 'fechado', 'Civic Touring', 139900, 6),
  l('Bruno Carvalho', '(11) 90000-0009', 'whatsapp', 'novo', 'Tracker Premier', 114900, 15),
  l('Tatiane Lopes', '(11) 90000-0010', 'indicacao', 'contato', 'Creta Action', 118500, 9),
  l('Ricardo Penha', '(11) 90000-0011', 'balcao', 'perdido', 'Golf Highline', 64900, 5),
  l('Aline Ferraz', '(11) 90000-0012', 'whatsapp', 'fechado', 'HB20 Comfort', 61500, 2),
];

export function leadsDemo() {
  return leadsStore;
}
export function setLeadsDemo(arr) {
  leadsStore = arr;
}
export function novoLeadDemo({ nome, telefone, origem, carLabel, valor }) {
  return l(nome, telefone, origem, 'novo', carLabel || '', valor || 0, new Date().getDate());
}

// Pós-venda (derivado das vendas no sistema real; aqui é seed do protótipo).
export const posVendaDemo = [
  { nome: 'Sandra Mello', carro: 'Civic Touring · 08/06', steps: [['Entrega', 'ok'], ['Transferência', 'pend'], ['Avaliação', 'none'], ['Indicação', 'none']] },
  { nome: 'Eduardo Pinto', carro: 'Tracker Premier · 28/05', steps: [['Entrega', 'ok'], ['Transferência', 'ok'], ['Avaliação', 'ok'], ['Indicação', 'pend']] },
  { nome: 'Larissa Costa', carro: 'Creta Action · 19/05', steps: [['Entrega', 'ok'], ['Transferência', 'ok'], ['Avaliação', 'ok'], ['Indicação', 'ok']] },
];

// Histórico mês a mês (seed do protótipo).
export const historicoCrm = [
  { mes: 'Junho (parcial)', leads: 47, vendas: 9, conversao: '19%', ticket: 62400 },
  { mes: 'Maio', leads: 62, vendas: 14, conversao: '23%', ticket: 58900 },
  { mes: 'Abril', leads: 55, vendas: 11, conversao: '20%', ticket: 61200 },
  { mes: 'Março', leads: 48, vendas: 8, conversao: '17%', ticket: 55300 },
  { mes: 'Fevereiro', leads: 41, vendas: 7, conversao: '17%', ticket: 57800 },
  { mes: 'Janeiro', leads: 38, vendas: 6, conversao: '16%', ticket: 53100 },
];
