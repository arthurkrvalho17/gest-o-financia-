// Anúncio canônico: a representação ÚNICA do carro pronta para virar anúncio,
// independente de canal. É a fonte da verdade que todos os conectores consomem.
import { fmt } from '../lib/format';

export function montarAnuncio(veiculo, config = {}) {
  if (!veiculo) return null;
  const titulo = [veiculo.modelo, veiculo.fab_mod].filter(Boolean).join(' ');
  const descricaoBase = veiculo.descricao || '';
  return {
    veiculo_id: veiculo.id,
    titulo,
    preco: veiculo.pedido || 0,
    ano: veiculo.fab_mod || '',
    cor: veiculo.cor || '',
    placa: veiculo.placa || '',
    renavam: veiculo.renavam || '',
    descricao:
      descricaoBase ||
      `${titulo} ${veiculo.cor ? '· ' + veiculo.cor : ''} · ${fmt(veiculo.pedido)}. Fale com a ${config.assinatura_nome || 'loja'}.`,
    fotos: veiculo.fotos || [],
  };
}
