// Consulta de CEP via ViaCEP (viacep.com.br) — pública, sem chave, CORS liberado.
// Usada pra preencher o endereço do comprador na venda (exigido pela Spedy
// para emitir NF-e — receiver.address precisa de city.code = código IBGE).
export async function buscarCep(cepBruto) {
  const cep = String(cepBruto || '').replace(/\D/g, '');
  if (cep.length !== 8) return { erro: 'CEP precisa ter 8 dígitos.' };

  let resposta;
  try {
    resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  } catch {
    return { erro: 'Não foi possível consultar o CEP agora — confira a conexão.' };
  }
  if (!resposta.ok) return { erro: 'Falha ao consultar o CEP.' };

  const dados = await resposta.json().catch(() => null);
  if (!dados || dados.erro) return { erro: 'CEP não encontrado.' };

  return {
    cep,
    logradouro: dados.logradouro || '',
    bairro: dados.bairro || '',
    cidade: dados.localidade || '',
    uf: dados.uf || '',
    cidadeIbge: dados.ibge || '',
  };
}
