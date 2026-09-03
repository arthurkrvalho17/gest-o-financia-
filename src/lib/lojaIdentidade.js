// Identidade da loja (nome, CNPJ, logo) usada no cabeçalho dos documentos.
// A LOGO DA LOJA é a marca principal nos documentos; "Financia+" entra pequeno
// ("feito com"). No real, vem de loja_config (Configurações → identidade da loja).
let identidade = {
  nome: 'Auto Mendes Veículos',
  cnpj: '00.000.000/0001-00',
  endereco: 'Av. das Nações, 1500 — Centro',
  cidade_uf: 'São Paulo/SP',
  logoDataUrl: null, // imagem da logo (dataURL) — quando enviada pela loja
};

export function getIdentidade() {
  return identidade;
}
export function setIdentidade(patch) {
  identidade = { ...identidade, ...patch };
}
