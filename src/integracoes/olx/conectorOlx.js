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
    telefone: data?.telefone?.replace(/\D/g, '') || '',
  };
}

// Validações ANTES de chamar a API: os erros da OLX são genéricos (NO_REGION,
// statusCode -4...); aqui o lojista recebe a causa real e onde corrigir.
export function montarAdBody(anuncio, idExterno, cep, telefone) {
  // Phone é obrigatório: inteiro de 10–11 dígitos (DDD + número, sem máscara)
  if (!/^\d{10,11}$/.test(telefone)) {
    throw new Error('Cadastre o telefone da loja em Configurações > Identidade da loja (DDD + número).');
  }

  // zipcode obrigatório — sem ele a OLX rejeita com NO_REGION
  if (!/^\d{8}$/.test(cep)) {
    throw new Error('Cadastre o CEP da loja em Configurações > Identidade da loja — a OLX exige o CEP para posicionar o anúncio.');
  }

  // images é obrigatório (desde 05/08/2025); a OLX rejeita URLs repetidas
  const fotos = [...new Set((anuncio.fotos || []).map((f) => f.url || f).filter(Boolean))].slice(0, 20);
  if (!fotos.length) {
    throw new Error('O anúncio precisa de pelo menos 1 foto — adicione fotos ao veículo antes de publicar na OLX.');
  }

  // price: inteiro, sem centavos
  const price = Math.round(anuncio.preco || 0);
  if (price <= 0) {
    throw new Error('Informe o valor pedido do veículo antes de publicar na OLX.');
  }

  // Body: 2 a 6000 caracteres
  const body = (anuncio.descricao || '').trim();
  if (body.length < 2 || body.length > 6000) {
    throw new Error('A descrição do anúncio precisa ter entre 2 e 6000 caracteres — ajuste a descrição do veículo.');
  }

  // id aceito pela OLX: [A-Za-z0-9_{}-]{1,19}
  const id = (idExterno || anuncio.codigo || anuncio.veiculo_id.replace(/-/g, ''))
    .replace(/[^A-Za-z0-9_{}-]/g, '')
    .slice(0, 19);
  if (!id) throw new Error('Veículo sem código utilizável como id do anúncio OLX.');

  return {
    id,
    operation: 'insert', // insert cria E edita (mesmo id); delete despublica
    category: CATEGORIA_CARROS,
    // Para a categoria 2020 (autos) a OLX SOBRESCREVE o Subject com o valor do
    // Catálogo de Autos (nota da doc de importação) — enviamos mesmo assim.
    Subject: anuncio.titulo,
    Body: body,
    type: 's',
    price,
    zipcode: cep,
    images: fotos,
    Phone: Number(telefone),
    params: mapearParams(anuncio),
  };
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
