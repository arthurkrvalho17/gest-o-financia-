// Conector Mercado Livre. Todas as chamadas passam pela Edge Function ml-api
// (proxy autenticado): a API do ML bloqueia browser (CORS) e a renovação do
// token — que expira em 6h — exige o client_secret, que só vive no servidor.
import { supabase } from '../../lib/supabase';
import { montarItemML } from './mapearCamposML';

// invoke devolve FunctionsHttpError em não-2xx; o body real (erro do ML ou da
// própria função) fica em error.context — extraímos a mensagem de lá.
async function chamarML(path, method = 'GET', body = null) {
  const { data, error } = await supabase.functions.invoke('ml-api', {
    body: { path, method, body },
  });
  if (error) {
    let msg = error.message;
    try {
      const detalhe = await error.context.json();
      msg = detalhe.erro || detalhe.message ||
        (detalhe.cause?.length ? detalhe.cause.map((c) => c.message).join('; ') : msg);
    } catch { /* mantém a mensagem genérica */ }
    throw new Error(msg);
  }
  return data;
}

async function buscarLoja(lojaId) {
  const { data } = await supabase
    .from('lojas')
    .select('nome, cep, telefone')
    .eq('id', lojaId)
    .maybeSingle();
  return data || {};
}

export const conectorML = {
  canal: 'mercado_livre',

  async publicar(anuncio) {
    try {
      const loja = await buscarLoja(anuncio.loja_id);
      const item = montarItemML(anuncio, loja);
      const criado = await chamarML('/items', 'POST', item);

      // Descrição vai num endpoint próprio; falha aqui não invalida a publicação
      if (anuncio.descricao) {
        await chamarML(`/items/${criado.id}/description`, 'POST', {
          plain_text: anuncio.descricao,
        }).catch(() => {});
      }

      return { ok: true, id_externo: criado.id, link_externo: criado.permalink };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async atualizar(anuncio, pub) {
    try {
      const fotos = (anuncio.fotos || [])
        .map((f) => f.url || f)
        .filter((u) => u && !String(u).startsWith('blob:'))
        .slice(0, 12);

      // Título não é editável em classificados com visitas; preço e fotos são.
      await chamarML(`/items/${pub.id_externo}`, 'PUT', {
        price: Math.round(anuncio.preco || 0),
        pictures: fotos.map((source) => ({ source })),
      });

      if (anuncio.descricao) {
        await chamarML(`/items/${pub.id_externo}/description`, 'PUT', {
          plain_text: anuncio.descricao,
        }).catch(() => {});
      }

      return { ok: true, id_externo: pub.id_externo, link_externo: pub.link_externo };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async despublicar(pub) {
    try {
      await chamarML(`/items/${pub.id_externo}`, 'PUT', { status: 'closed' });
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async consultarStatus(pub) {
    try {
      const item = await chamarML(`/items/${pub.id_externo}`);
      const mapa = { active: 'publicado', paused: 'pausado', closed: 'encerrado', under_review: 'em_revisao' };
      return { status: mapa[item.status] || item.status };
    } catch {
      return { status: pub.status };
    }
  },
};
