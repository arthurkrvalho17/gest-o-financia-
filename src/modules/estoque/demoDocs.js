// Ficha de documentos por carro (demo, em memória). No real: tabela
// veiculo_documento + arquivos no Supabase Storage. Chaveado por codigo do veículo.
const uid = () => globalThis.crypto?.randomUUID?.() || 'doc-' + Math.random().toString(36).slice(2);

export const TIPOS_DOC = [
  { chave: 'atpv_e', label: 'ATPV-e' },
  { chave: 'crlv_e', label: 'CRLV-e' },
  { chave: 'crv', label: 'CRV' },
  { chave: 'compra_venda', label: 'Contrato de compra e venda' },
  { chave: 'recibo_sinal', label: 'Recibo de sinal' },
  { chave: 'procuracao', label: 'Procuração' },
  { chave: 'cnh_comprador', label: 'CNH do comprador' },
  { chave: 'comprovante_pgto', label: 'Comprovante de pagamento' },
  { chave: 'outro', label: 'Outro' },
];
export const labelTipoDoc = (chave) => TIPOS_DOC.find((t) => t.chave === chave)?.label || chave;

const store = {
  // carro à venda: já tem os documentos do veículo guardados
  '8176153': [
    { id: uid(), tipo: 'crlv_e', nome_arquivo: 'crlv-jke2297.pdf', status: 'anexado', data: '2026-06-11' },
  ],
  // carro vendido: documentos da negociação + cliente
  '8150220': [
    { id: uid(), tipo: 'compra_venda', nome_arquivo: 'contrato-hb20.pdf', status: 'assinado', data: '2026-06-02' },
    { id: uid(), tipo: 'cnh_comprador', nome_arquivo: 'cnh-cliente.jpg', status: 'anexado', data: '2026-06-02' },
    { id: uid(), tipo: 'atpv_e', nome_arquivo: '', status: 'pendente', data: '2026-06-02' },
  ],
};

export function getDocs(codigo) {
  return store[String(codigo)] || [];
}
export function addDoc(codigo, { tipo, nome_arquivo, status = 'anexado' }) {
  const k = String(codigo);
  if (!store[k]) store[k] = [];
  store[k].push({ id: uid(), tipo, nome_arquivo, status, data: new Date().toISOString().slice(0, 10) });
}
export function removeDoc(codigo, id) {
  const k = String(codigo);
  if (store[k]) store[k] = store[k].filter((d) => d.id !== id);
}
export function countDocs(codigo) {
  return getDocs(codigo).length;
}
