// Conector OLX Autoupload. Todas as chamadas passam pela Edge Function olx-api
// (proxy autenticado): a OLX bloqueia browser (CORS) e o access_token da loja
// nunca pode transitar pelo cliente — ele só é lido na Edge Function.
// Ref: https://developers.olx.com.br/anuncio/api/import.html
import { supabase } from '../../lib/supabase';
import { mapearParams } from './mapearCamposOlx';

const CATEGORIA_CARROS = 2020;

const MSGS_ERRO = {
  '-1': 'Erro inesperado na OLX. Tente novamente.',
  '-2': 'Limite de requisições OLX atingido. Aguarde alguns minutos.',
  '-3': 'Nenhum anúncio enviado.',
  '-4': 'Dados do anúncio rejeitados pela OLX.',
  '-6': 'Plano OLX não permite publicação via API (requer plano empresarial).',
  '-7': 'Limite de anúncios OLX atingido.',
};

// invoke devolve FunctionsHttpError em não-2xx; o body real (erro da OLX ou da
// própria função) fica em error.context — extraímos a mensagem de lá.
async function chamarOlxApi(acao, ad) {
  const { data, error } = await supabase.functions.invoke('olx-api', {
    body: { acao, ad },
  });
  if (error) {
    let msg = error.message;
    try {
      const detalhe = await error.context.json();
      msg = detalhe.erro || detalhe.statusMessage || msg;
    } catch { /* mantém a mensagem genérica */ }
    throw new Error(msg);
  }
  return data;
}

async function buscarLoja(lojaId) {
  const { data } = await supabase
    .from('lojas')
    .select('cep, telefone')
    .eq('id', lojaId)
    .maybeSingle();
  return {
    cep: data?.cep?.replace(/\D/g, '') || '',
    telefone: Number(data?.telefone?.replace(/\D/g, '') || 0) || undefined,
  };
}

function montarAdBody(anuncio, idExterno, cep, telefone) {
  const id = idExterno || anuncio.codigo || anuncio.veiculo_id.replace(/-/g, '').slice(0, 19);
  const fotos = (anuncio.fotos || []).map((f) => f.url || f).filter(Boolean).slice(0, 20);

  const ad = {
    id,
    operation: 'insert', // insert cria E edita (mesmo id); delete despublica
    category: CATEGORIA_CARROS,
    Subject: anuncio.titulo,
    Body: anuncio.descricao,
    type: 's',
    price: Math.round(anuncio.preco),
    zipcode: cep,
    images: fotos,
    params: mapearParams(anuncio),
  };

  if (telefone) ad.Phone = telefone;

  return ad;
}

function conferirResposta(json) {
  if (json.statusCode !== 0) {
    const msg = MSGS_ERRO[String(json.statusCode)] || `Erro OLX código ${json.statusCode}.`;
    const detalhe = json.errors?.length ? ' ' + JSON.stringify(json.errors) : '';
    throw new Error(msg + detalhe);
  }
  return json;
}

export const conectorOlx = {
  canal: 'olx',

  async publicar(anuncio) {
    try {
      const { cep, telefone } = await buscarLoja(anuncio.loja_id);
      const ad = montarAdBody(anuncio, null, cep, telefone);
      conferirResposta(await chamarOlxApi('publicar', ad));
      return {
        ok: true,
        id_externo: ad.id,
        link_externo: `https://www.olx.com.br/anuncio/${ad.id}`,
      };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async atualizar(anuncio, pub) {
    try {
      const { cep, telefone } = await buscarLoja(anuncio.loja_id);
      const ad = montarAdBody(anuncio, pub.id_externo, cep, telefone);
      conferirResposta(await chamarOlxApi('atualizar', ad));
      return { ok: true, id_externo: pub.id_externo, link_externo: pub.link_externo };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async despublicar(pub) {
    try {
      conferirResposta(await chamarOlxApi('despublicar', { id: pub.id_externo, operation: 'delete' }));
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async consultarStatus(pub) {
    return { status: pub.status };
  },
};
