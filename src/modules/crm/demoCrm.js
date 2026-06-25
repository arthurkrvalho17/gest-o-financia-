// Dados de demonstração do CRM (leads em memória, mutável) + histórico + distribuição.
import { getEquipeDemo } from '../estoque/demoData';

const uid = () =>
  globalThis.crypto?.randomUUID?.() || 'demo-' + Math.random().toString(36).slice(2);

// Colunas do funil: novo|conversa|negociacao|agendado|ficha|posvenda
export const ETAPAS = [
  { key: 'novo', label: 'Novo lead', accent: '#94A3B8' },
  { key: 'conversa', label: 'Em conversa', accent: '#185FA5' },
  { key: 'negociacao', label: 'Negociação', accent: '#7C3AED' },
  { key: 'agendado', label: 'Agendado', accent: '#0EA5E9' },
  { key: 'ficha', label: 'Ficha aprovada', accent: '#15803D' },
  { key: 'posvenda', label: 'Pós-venda', accent: '#0A1628' },
];

// Canais/origens de lead (também as opções de origem na venda e na distribuição)
export const ORIGENS = {
  traf_pago: { label: 'Tráfego pago', cls: 'bg-[#FCF6E3] text-[#A07908]' },
  mercado_livre: { label: 'Mercado Livre', cls: 'bg-[#FCF6E3] text-[#A07908]' },
  olx: { label: 'OLX', cls: 'bg-[#F1ECFB] text-[#6E0AD6]' },
  webmotors: { label: 'Webmotors', cls: 'bg-[#FBEAEA] text-[#B91C1C]' },
  instagram: { label: 'Instagram', cls: 'bg-[#FBEAF3] text-[#A21670]' },
  whatsapp: { label: 'WhatsApp', cls: 'bg-[#E7F6EC] text-[#15803D]' },
  indicacao: { label: 'Indicação', cls: 'bg-[#EAF0FB] text-[#185FA5]' },
  balcao: { label: 'Balcão', cls: 'bg-[#EEF2F7] text-[#475569]' },
  outro: { label: 'Outro', cls: 'bg-[#EEF2F7] text-[#475569]' },
};
// Canais que recebem regra de distribuição por portal
export const CANAIS_DISTRIBUICAO = ['traf_pago', 'mercado_livre', 'olx', 'webmotors', 'instagram', 'whatsapp'];

const l = (nome, telefone, canal, etapa, carLabel, valor, diaJunho, vendedor_id = null) => ({
  id: uid(),
  nome,
  telefone,
  canal_origem: canal,
  vendedor_id,
  etapa,
  car_label: carLabel, // conveniência do demo (no real vem de veiculo_id)
  valor,
  criado_em: `2026-06-${String(diaJunho).padStart(2, '0')}`,
});

let leadsStore = [
  l('Marcos Vinícius', '(11) 90000-0001', 'whatsapp', 'novo', 'Onix 1.0 LT', 67900, 14, 'u-lucas'),
  l('Patrícia Gomes', '(11) 90000-0002', 'olx', 'novo', 'HB20 Comfort', 61500, 13, 'u-pereira'),
  l('Roberto Dias', '(11) 90000-0003', 'webmotors', 'conversa', 'Corolla XEI', 104900, 12, 'u-lucas'),
  l('Juliana Reis', '(11) 90000-0004', 'indicacao', 'conversa', 'Nivus', 112000, 11),
  l('Anderson Luz', '(11) 90000-0005', 'instagram', 'negociacao', 'Renegade Sport', 92900, 10, 'u-pereira'),
  l('Camila Souza', '(11) 90000-0006', 'balcao', 'agendado', 'Duster Iconic', 84500, 9),
  l('Felipe Antunes', '(11) 90000-0007', 'mercado_livre', 'ficha', 'Pulse Drive', 81900, 8, 'u-lucas'),
  l('Sandra Mello', '(11) 90000-0008', 'traf_pago', 'posvenda', 'Civic Touring', 139900, 6, 'u-pereira'),
  l('Bruno Carvalho', '(11) 90000-0009', 'whatsapp', 'novo', 'Tracker Premier', 114900, 15),
  l('Tatiane Lopes', '(11) 90000-0010', 'indicacao', 'agendado', 'Creta Action', 118500, 9, 'u-lucas'),
  l('Ricardo Penha', '(11) 90000-0011', 'olx', 'negociacao', 'Golf Highline', 64900, 5, 'u-pereira'),
  l('Aline Ferraz', '(11) 90000-0012', 'instagram', 'posvenda', 'HB20 Comfort', 61500, 2, 'u-lucas'),
];

export function leadsDemo() {
  return leadsStore;
}
export function setLeadsDemo(arr) {
  leadsStore = arr;
}

// ---- Distribuição automática de leads por canal → vendedor ----
// regra: { [canal]: { tipo: 'fixo'|'rodizio', vendedores: [id...], _rr: 0 } }
const regrasStore = {
  olx: { tipo: 'fixo', vendedores: ['u-lucas'], _rr: 0 },
  instagram: { tipo: 'fixo', vendedores: ['u-pereira'], _rr: 0 },
  mercado_livre: { tipo: 'rodizio', vendedores: ['u-lucas', 'u-pereira'], _rr: 0 },
};
export function getRegras() { return regrasStore; }
export function setRegra(canal, regra) {
  if (!regra || !regra.vendedores?.length) delete regrasStore[canal];
  else regrasStore[canal] = { ...regra, _rr: regrasStore[canal]?._rr || 0 };
}
export function distribuir(canal) {
  const r = regrasStore[canal];
  if (!r || !r.vendedores.length) return null;
  if (r.tipo === 'fixo') return r.vendedores[0];
  const v = r.vendedores[r._rr % r.vendedores.length]; // rodízio
  r._rr = (r._rr + 1) % r.vendedores.length;
  return v;
}
export function nomeVendedor(id) {
  return getEquipeDemo().find((u) => u.id === id)?.nome || null;
}

// Novo lead já distribuído (entra em "Novo lead" com o vendedor da regra do canal).
export function novoLeadDistribuido({ nome, telefone, canal, carLabel, valor }) {
  return l(nome, telefone, canal, 'novo', carLabel || '', valor || 0, new Date().getDate(), distribuir(canal));
}
// compat: usado pelo modal "Novo lead" manual
export function novoLeadDemo({ nome, telefone, origem, carLabel, valor }) {
  return l(nome, telefone, origem || 'outro', 'novo', carLabel || '', valor || 0, new Date().getDate(), distribuir(origem));
}

// Pós-venda (derivado das vendas no sistema real; aqui é seed do protótipo).
export const posVendaDemo = [
  { nome: 'Sandra Mello', carro: 'Civic Touring · 08/06', steps: [['Entrega', 'ok'], ['Transferência', 'pend'], ['Avaliação', 'none'], ['Indicação', 'none']] },
  { nome: 'Eduardo Pinto', carro: 'Tracker Premier · 28/05', steps: [['Entrega', 'ok'], ['Transferência', 'ok'], ['Avaliação', 'ok'], ['Indicação', 'pend']] },
  { nome: 'Larissa Costa', carro: 'Creta Action · 19/05', steps: [['Entrega', 'ok'], ['Transferência', 'ok'], ['Avaliação', 'ok'], ['Indicação', 'ok']] },
];

// Conversas (WhatsApp) — inbox demo, cada uma amarrada a um lead pelo nome.
// Desenhado omnichannel: 'canal' é whatsapp hoje, mas pode ser outro depois.
const mkMsg = (dir, txt, hora) => ({ id: uid(), dir, txt, hora });
let conversasStore = [
  {
    id: uid(), leadNome: 'Roberto Dias', telefone: '(11) 90000-0003', canal: 'whatsapp',
    janelaAberta: true, ultima: '10:42',
    mensagens: [
      mkMsg('in', 'Boa tarde! O Corolla XEI ainda está disponível?', '10:30'),
      mkMsg('out', 'Olá Roberto! Está sim 👍 Quer agendar um test drive?', '10:35'),
      mkMsg('in', 'Quero. Consigo amanhã de manhã?', '10:42'),
    ],
  },
  {
    id: uid(), leadNome: 'Juliana Reis', telefone: '(11) 90000-0004', canal: 'whatsapp',
    janelaAberta: true, ultima: '09:15',
    mensagens: [
      mkMsg('in', 'Vi o Nivus no anúncio, qual o valor à vista?', '09:10'),
      mkMsg('out', 'Bom dia Juliana! Faço por R$ 112.000 à vista.', '09:15'),
    ],
  },
  {
    id: uid(), leadNome: 'Anderson Luz', telefone: '(11) 90000-0005', canal: 'whatsapp',
    janelaAberta: false, ultima: 'ontem',
    mensagens: [
      mkMsg('in', 'Mandei meus documentos pra simulação', 'ontem'),
      mkMsg('out', 'Recebido! Já te retorno com as parcelas.', 'ontem'),
    ],
  },
];
export const TEMPLATES_HSM = [
  'Olá! Passando para retomar nossa conversa sobre o veículo. Posso ajudar?',
  'Sua simulação de financiamento está pronta. Quando posso te ligar?',
  'O veículo que você viu ainda está disponível. Quer agendar uma visita?',
];
export function conversasDemo() {
  return conversasStore;
}
export function enviarMensagemDemo(conversaId, txt, tipo = 'texto') {
  conversasStore = conversasStore.map((c) =>
    c.id === conversaId
      ? { ...c, mensagens: [...c.mensagens, { id: uid(), dir: 'out', txt, hora: 'agora', tipo }], ultima: 'agora' }
      : c
  );
}

// Histórico mês a mês (seed do protótipo).
export const historicoCrm = [
  { mes: 'Junho (parcial)', leads: 47, vendas: 9, conversao: '19%', ticket: 62400 },
  { mes: 'Maio', leads: 62, vendas: 14, conversao: '23%', ticket: 58900 },
  { mes: 'Abril', leads: 55, vendas: 11, conversao: '20%', ticket: 61200 },
  { mes: 'Março', leads: 48, vendas: 8, conversao: '17%', ticket: 55300 },
  { mes: 'Fevereiro', leads: 41, vendas: 7, conversao: '17%', ticket: 57800 },
  { mes: 'Janeiro', leads: 38, vendas: 6, conversao: '16%', ticket: 53100 },
];
