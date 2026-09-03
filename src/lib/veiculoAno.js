// Deriva ano de fabricação / ano modelo a partir de `veiculos.fab_mod`
// ("2020/2021", texto livre, mantido — é o que a UI e os conectores de
// anúncio (ML/Webmotors) usam hoje). Usado pelo backfill da migration RENAVE
// (0030) e pela UI (AddVeiculoModal) — a lógica aqui espelha a da migration
// em SQL; qualquer mudança precisa ser replicada nos dois lugares.
//
// Regra: NUNCA chuta. Só aceita ano com exatamente 4 dígitos; qualquer coisa
// fora do formato "AAAA" ou "AAAA/AAAA" vira null, nunca um número inventado
// (ex.: "0km" não pode virar ano 0).
const ANO_4_DIGITOS = /^\d{4}$/;

function anoOuNull(pedaco) {
  const t = String(pedaco ?? '').trim();
  return ANO_4_DIGITOS.test(t) ? Number(t) : null;
}

export function parseFabMod(fabMod) {
  const bruto = String(fabMod ?? '').trim();
  if (!bruto) return { anoFabricacao: null, anoModelo: null };

  const partes = bruto.split('/');
  if (partes.length === 1) {
    const ano = anoOuNull(partes[0]);
    return { anoFabricacao: ano, anoModelo: ano };
  }
  if (partes.length === 2) {
    const fab = anoOuNull(partes[0]);
    const mod = anoOuNull(partes[1]);
    // Se qualquer um dos dois não for um ano válido, o par inteiro é
    // descartado — melhor null nos dois do que meio dado inventado.
    if (fab == null || mod == null) return { anoFabricacao: null, anoModelo: null };
    return { anoFabricacao: fab, anoModelo: mod };
  }
  return { anoFabricacao: null, anoModelo: null };
}
