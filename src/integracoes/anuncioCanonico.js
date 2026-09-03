// Anúncio canônico: a representação ÚNICA do carro pronta para virar anúncio,
// independente de canal. É a fonte da verdade que todos os conectores consomem.
import { fmt } from '../lib/format';

export function montarAnuncio(veiculo, config = {}) {
  if (!veiculo) return null;
  const titulo = [veiculo.modelo, veiculo.fab_mod].filter(Boolean).join(' ');
  const descricaoBase = veiculo.descricao || '';
  return {
    veiculo_id: veiculo.id,
    loja_id: veiculo.loja_id || '',
    codigo: veiculo.codigo || '',
    titulo,
    preco: veiculo.pedido || 0,
    ano: veiculo.fab_mod || '',
    cor: veiculo.cor || '',
    placa: veiculo.placa || '',
    renavam: veiculo.renavam || '',
    km: veiculo.km || 0,
    combustivel: veiculo.combustivel || '',
    versao: veiculo.versao || '',
    portas: veiculo.portas || null,
    descricao:
      descricaoBase ||
      `${titulo} ${veiculo.cor ? '· ' + veiculo.cor : ''} · ${fmt(veiculo.pedido)}. Fale com a ${config.assinatura_nome || 'loja'}.`,
    fotos: veiculo.fotos || [],
  };
}
