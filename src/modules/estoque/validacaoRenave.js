// Validação CONDICIONAL dos campos exigidos pela Renave Fácil (ADR-16) para
// cadastrar um veículo — só entra em vigor quando a loja tem o canal RENAVE
// conectado. Nunca vira constraint no banco (README §2: um funcionário sem
// RENAVE nunca pode ser bloqueado por um requisito de outra loja/plano) —
// só validação no front, chamada por AddVeiculoModal.
//
// Campos exigidos (auditoria da API — POST/PUT /dms/{cnpjEstab}/vehicle):
// chassi, placa, renavam, anoFabricacao, anoModelo. `codigoFipe` é opcional
// na própria API. `chave_nfe_compra` e o bloco "origem do veículo" (vendedor)
// alimentam endpoints SEPARADOS (nfe/purchase e client) — não bloqueiam o
// cadastro do veículo em si, ficam como campos opcionais preenchíveis aqui
// ou depois.
export function camposRenaveFaltando(veiculo) {
  const v = veiculo || {};
  const faltando = [];
  if (!String(v.chassi || '').trim()) faltando.push('Chassi');
  if (!String(v.placa || '').trim()) faltando.push('Placa');
  if (!String(v.renavam || '').trim()) faltando.push('RENAVAM');
  if (!v.ano_fabricacao) faltando.push('Ano de fabricação');
  if (!v.ano_modelo) faltando.push('Ano modelo');
  return faltando;
}

// `renaveAtivo` = a loja tem canal_credencial conectado pra 'renave'
// (mesmo dado já usado pelas checkboxes de publicação — ver EstoquePage.jsx
// canaisConectados). Sem RENAVE ativo, não valida nada — mensagem null.
export function validarCamposRenave(veiculo, renaveAtivo) {
  if (!renaveAtivo) return null;
  const faltando = camposRenaveFaltando(veiculo);
  if (!faltando.length) return null;
  return `Com o RENAVE ativo, faltam campos obrigatórios: ${faltando.join(', ')}.`;
}
