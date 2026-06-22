// Stores de demonstração das integrações (em memória, mutável).
// No modo real, isto vem de canal_credencial / anuncio_publicacao no Supabase.

// Status de conexão por canal (default: alguns já "conectados" para demo).
const conexoesStore = {
  mercado_livre: 'conectado',
  olx: 'desconectado',
  webmotors: 'homologacao',
  instagram: 'desconectado',
  agregador: 'desconectado',
  whatsapp: 'conectado',
};

export function getConexoes() {
  return { ...conexoesStore };
}
export function statusConexao(canal) {
  return conexoesStore[canal] || 'desconectado';
}
export function setStatusConexao(canal, status) {
  conexoesStore[canal] = status;
}

// Publicações por veículo (chave = codigo do veículo, estável no demo).
// Estrutura: { [codigo]: { [canal]: { status, link_externo } } }
const publicacoesStore = {
  '8176153': { mercado_livre: { status: 'publicado', link_externo: 'https://exemplo.mercado_livre.com/anuncio/MER-3f9a2c' } },
  '8166677': { mercado_livre: { status: 'publicado', link_externo: 'https://exemplo.mercado_livre.com/anuncio/MER-77ab10' } },
};

export function getPublicacoes(codigo) {
  return publicacoesStore[String(codigo)] || {};
}
export function setPublicacao(codigo, canal, dados) {
  const k = String(codigo);
  if (!publicacoesStore[k]) publicacoesStore[k] = {};
  publicacoesStore[k][canal] = { ...publicacoesStore[k][canal], ...dados };
}
export function removerPublicacao(codigo, canal) {
  const k = String(codigo);
  if (publicacoesStore[k]) delete publicacoesStore[k][canal];
}
