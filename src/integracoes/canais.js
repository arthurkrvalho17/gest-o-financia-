// Catálogo de canais (frontend). A "realidade" de cada canal é heterogênea —
// o catálogo carrega as observações para a UI sinalizar o que cada um exige.

export const CANAIS_ANUNCIO = [
  { chave: 'mercado_livre', nome: 'Mercado Livre', cor: '#FFE600', corTexto: '#2D3277',
    nota: 'API pública de anúncios (veículos). Caminho mais fácil para o 1º conector real.' },
  { chave: 'olx', nome: 'OLX', cor: '#6E0AD6', corTexto: '#fff',
    nota: 'Integração via API/feed, geralmente pelo mesmo ecossistema dos classificados.' },
  { chave: 'webmotors', nome: 'Webmotors', cor: '#E4002B', corTexto: '#fff',
    nota: 'Exige homologação (Sensedia): OAuth, ambiente que expira ~90 dias. Pode atuar como hub para outros portais.' },
  { chave: 'instagram', nome: 'Instagram', cor: '#E1306C', corTexto: '#fff',
    nota: 'Graph API (post/carrossel no feed). Precisa conta Business + app review (2–4 semanas). Marketplace orgânico NÃO tem API aberta.' },
  { chave: 'agregador', nome: 'Agregador (multi-portais)', cor: '#0F766E', corTexto: '#fff',
    nota: 'Uma única API conecta Webmotors, ML, OLX, iCarros etc. de uma vez. É só mais um conector aqui.' },
];

export const CANAIS_MENSAGERIA = [
  { chave: 'whatsapp', nome: 'WhatsApp Business', cor: '#25D366', corTexto: '#fff',
    nota: 'Cloud API (Meta direto ou via BSP). Cada loja usa o próprio WABA e número.' },
];

export const TODOS_CANAIS = [...CANAIS_ANUNCIO, ...CANAIS_MENSAGERIA];
export const canalPorChave = (chave) => TODOS_CANAIS.find((c) => c.chave === chave);
