// Anúncio canônico → payload Webmotors (Integração Revendedor / Cockpit Estoque).
//
// ATENÇÃO: o contrato final dos campos só é liberado na área logada do portal
// Sensedia (portal-webmotors.sensedia.com) após a homologação. Este mapeamento
// cobre os campos do anúncio canônico com nomes prováveis — confirmar/ajustar
// AQUI (e só aqui) quando o swagger da homologação estiver acessível.

// fab_mod vem como "2015/2016" → { anoFabricacao: 2015, anoModelo: 2016 }
function separarAnos(fabMod) {
  const [fab, mod] = String(fabMod || '').split('/');
  const anoFabricacao = parseInt(fab, 10) || null;
  const anoModelo = parseInt(mod, 10) || anoFabricacao;
  return { anoFabricacao, anoModelo };
}

export function montarVeiculoWM(anuncio, loja = {}) {
  const { anoFabricacao, anoModelo } = separarAnos(anuncio.ano);
  const fotos = (anuncio.fotos || [])
    .map((f) => f.url || f)
    .filter((u) => u && !String(u).startsWith('blob:'));

  return {
    // Identificação do veículo na loja (idempotência entre tentativas)
    codigoInterno: anuncio.codigo || anuncio.veiculo_id,
    titulo: anuncio.titulo,
    descricao: anuncio.descricao,
    preco: Math.round(anuncio.preco || 0),
    anoFabricacao,
    anoModelo,
    km: Number(anuncio.km) || 0,
    cor: anuncio.cor || undefined,
    combustivel: anuncio.combustivel || undefined,
    placa: anuncio.placa || undefined,
    fotos,
    // Contato do anúncio = dados da loja (mesma fonte dos outros canais)
    telefone: loja.telefone || undefined,
    cep: loja.cep?.replace(/\D/g, '') || undefined,
  };
}
