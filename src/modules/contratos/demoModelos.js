// Store de demonstração dos modelos da loja. Sempre existem DUAS versões:
// "Padrão FINANCIA+" (intacto, do sistema) e "Seu modelo (editado)" — o lojista
// alterna entre elas. Isso preserva o padrão original para fins de responsabilidade.
import { MODELOS_PADRAO } from './modelosPadrao';

const store = {}; // tipo -> { conteudoEditado, arquivoEnviado, origem }

export function getModeloLoja(tipo) {
  return store[tipo] || { conteudoEditado: null, arquivoEnviado: null, origem: 'padrao' };
}
export function conteudoPadrao(tipo) {
  return MODELOS_PADRAO[tipo] || '';
}
export function conteudoAtivo(tipo) {
  const m = getModeloLoja(tipo);
  return m.origem === 'editado' && m.conteudoEditado ? m.conteudoEditado : conteudoPadrao(tipo);
}
export function salvarEditadoDemo(tipo, conteudo) {
  store[tipo] = { ...getModeloLoja(tipo), conteudoEditado: conteudo, origem: 'editado' };
}
export function definirOrigemDemo(tipo, origem) {
  store[tipo] = { ...getModeloLoja(tipo), origem };
}
export function voltarPadraoDemo(tipo) {
  // descarta a edição e o arquivo enviado, voltando ao padrão do sistema
  store[tipo] = { conteudoEditado: null, arquivoEnviado: null, origem: 'padrao' };
}
export function enviarProprioDemo(tipo, nome) {
  store[tipo] = { ...getModeloLoja(tipo), arquivoEnviado: { nome }, origem: 'enviado' };
}
