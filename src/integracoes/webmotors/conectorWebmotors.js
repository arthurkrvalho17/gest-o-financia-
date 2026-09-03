// Conector Webmotors. Todas as chamadas passam pela Edge Function webmotors-api
// (proxy autenticado): o token do gateway Sensedia exige o client_secret do app,
// que só vive no servidor. A credencial POR LOJA é o usuário "Integrador de API"
// criado no Cockpit da própria loja (princípio: as contas são da loja).
import { supabase } from '../../lib/supabase';
import { montarVeiculoWM } from './mapearCamposWebmotors';

// Paths da API (gateway Sensedia). O contrato definitivo é liberado na
// homologação — ajustar somente aqui se os paths divergirem do swagger.
const PATHS = {
  publicar: '/api/estoque/veiculos',
  atualizar: (id) => `/api/estoque/veiculos/${id}`,
  desativar: (id) => `/api/estoque/veiculos/${id}/desativar`,
  status: (id) => `/api/estoque/veiculos/${id}`,
};

// invoke devolve FunctionsHttpError em não-2xx; o body real fica em
// error.context — extraímos a mensagem de lá (mesmo padrão do conector ML).
async function chamarWM(path, method = 'GET', body = null) {
  const { data, error } = await supabase.functions.invoke('webmotors-api', {
    body: { path, method, body },
  });
  if (error) {
    let msg = error.message;
    try {
      const detalhe = await error.context.json();
      msg = detalhe.erro || detalhe.message || msg;
    } catch { /* mantém a mensagem genérica */ }
    throw new Error(msg);
  }
  return data;
}

async function buscarDadosWM(lojaId) {
  const [credRes, lojaRes] = await Promise.all([
    supabase
      .from('canal_credencial')
      .select('credenciais, status')
      .eq('loja_id', lojaId)
      .eq('canal', 'webmotors')
      .maybeSingle(),
    supabase
      .from('lojas')
      .select('cep, telefone')
      .eq('id', lojaId)
      .maybeSingle(),
  ]);

  const cred = credRes.data;
  if (!cred) throw new Error('Webmotors não conectada. Configure em Configurações > Conexões.');
  if (cred.status === 'homologacao') throw new Error('Webmotors em homologação — publicação libera quando a Sensedia aprovar o acesso.');
  if (cred.status !== 'conectado') throw new Error('Webmotors desconectada. Reconecte em Configurações > Conexões.');
  if (!cred.credenciais?.usuario || !cred.credenciais?.senha) {
    throw new Error('Credencial do Integrador de API não encontrada. Reconecte a Webmotors.');
  }

  return { integrador: cred.credenciais, loja: lojaRes.data || {} };
}

export const conectorWebmotors = {
  canal: 'webmotors',

  async publicar(anuncio) {
    try {
      const { integrador, loja } = await buscarDadosWM(anuncio.loja_id);
      const veiculo = montarVeiculoWM(anuncio, loja);
      const criado = await chamarWM(PATHS.publicar, 'POST', { ...veiculo, integrador });
      return {
        ok: true,
        id_externo: criado?.id || criado?.codigoAnuncio || veiculo.codigoInterno,
        link_externo: criado?.url || criado?.link || null,
      };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async atualizar(anuncio, pub) {
    try {
      const { integrador, loja } = await buscarDadosWM(anuncio.loja_id);
      const veiculo = montarVeiculoWM(anuncio, loja);
      await chamarWM(PATHS.atualizar(pub.id_externo), 'PUT', { ...veiculo, integrador });
      return { ok: true, id_externo: pub.id_externo, link_externo: pub.link_externo };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async despublicar(pub) {
    try {
      const { integrador } = await buscarDadosWM(pub.loja_id);
      await chamarWM(PATHS.desativar(pub.id_externo), 'POST', { integrador });
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async consultarStatus(pub) {
    try {
      const anuncio = await chamarWM(PATHS.status(pub.id_externo));
      const mapa = { ativo: 'publicado', pausado: 'pausado', desativado: 'despublicado' };
      const chave = String(anuncio?.status || '').toLowerCase();
      return { status: mapa[chave] || pub.status };
    } catch {
      return { status: pub.status };
    }
  },
};
