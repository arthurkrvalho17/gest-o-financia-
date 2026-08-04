// Conector OLX Autoupload. Todas as chamadas passam pela Edge Function olx-api
// (proxy autenticado): a OLX bloqueia browser (CORS) e o access_token da loja
// nunca pode transitar pelo cliente — ele só é lido na Edge Function.
// Ref: https://developers.olx.com.br/anuncio/api/import.html
import { supabase } from '../../lib/supabase';
import { mapearParams } from './mapearCamposOlx';
import { resolverCatalogoOlx } from './catalogoAutos';

const CATEGORIA_CARROS = 2020;

export const MSGS_ERRO = {
  '-1': 'Erro inesperado na OLX. Tente novamente.',
  '-2': 'Limite de requisições OLX atingido. Aguarde alguns minutos.',
  '-3': 'Nenhum anúncio enviado.',
  '-4': 'Dados do anúncio rejeitados pela OLX.',
  '-5': 'O serviço de importação da OLX está desativado no momento. Tente mais tarde.',
  '-6': 'A conta OLX da loja não permite publicar via API: planos de vendedor autônomo (Essencial/Plus) não incluem integração — é preciso o plano Empresa.',
  '-7': 'Limite de anúncios do plano OLX atingido.',
  '-8': 'Limite parcial: a OLX importou só parte dos anúncios enviados (limite do plano atingido).',
};

// Categorias do array `errors` (statusCode -4) → mensagem acionável.
// Formato real da doc: errors = [{ id, status, messages: [{ category }] }].
export const CATEGORIAS_ERRO = {
  UNDEFINED_AD_ID: 'Anúncio sem identificador — contate o suporte do sistema.',
  NO_IMAGE: 'A OLX não conseguiu baixar as fotos do anúncio. Verifique as fotos do veículo e publique de novo.',
  NO_REGION: 'CEP ausente ou inválido — corrija o CEP da loja em Configurações > Identidade da loja.',
  ERROR_FUEL_4_DEPRECATED: 'Tipo de combustível não aceito pela OLX — revise o combustível no cadastro do veículo.',
  ERROR_FINANCIAL_INVALID: 'Informação financeira do anúncio inválida para a OLX.',
  ERROR_CAR_FEATURE_2_INVALID: 'Característica do veículo não aceita pela OLX — revise os opcionais do cadastro.',
  ERROR_CAR_TYPE_1_OR_4_INVALID: 'Tipo de veículo não aceito pela OLX para esta categoria.',
  ERROR_VEHICLE_TAG_INVALID: 'Placa ausente ou inválida — confira a placa no cadastro do veículo.',
  ERROR_VEHICLE_BRAND_INVALID: 'Marca não reconhecida pelo Catálogo de Autos da OLX — ajuste o cadastro do veículo.',
  ERROR_VEHICLE_MODEL_INVALID: 'Modelo não reconhecido pelo Catálogo de Autos da OLX — ajuste o cadastro do veículo.',
  ERROR_VEHICLE_VERSION_INVALID: 'Versão não reconhecida pelo Catálogo de Autos da OLX — ajuste o cadastro do veículo.',
  ERROR_VEHICLE_BRAND_MODEL_VERSION_INVALID: 'Marca/modelo/versão não batem com o Catálogo de Autos da OLX — ajuste o cadastro do veículo.',
  INVALID_PLATE: 'A OLX não localizou esta placa (ou a validação está indisponível) — confira a placa no cadastro.',
};

const traduzirCategoria = (cat) => CATEGORIAS_ERRO[cat] || `Erro OLX: ${cat}.`;

// invoke devolve FunctionsHttpError em não-2xx; o body real (erro da OLX ou da
// própria função) fica em error.context — extraímos a mensagem de lá.
async function chamarOlxApi(body) {
  const { data, error } = await supabase.functions.invoke('olx-api', { body });
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
// catalogo = { vehicle_brand, vehicle_model, vehicle_version } resolvido pelo
// Catálogo de Autos (obrigatórios na categoria 2020).
export function montarAdBody(anuncio, idExterno, cep, telefone, catalogo = {}) {
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

  // vehicle_tag é obrigatório nos params de autos
  if (!anuncio.placa) {
    throw new Error('Cadastre a placa do veículo — a OLX exige a placa no anúncio de autos.');
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
    params: { ...mapearParams(anuncio), ...catalogo },
  };
}

// Confere a resposta do import. statusCode 0 NÃO é "publicado": significa que
// o lote passou na validação síncrona e entrou na moderação assíncrona — a
// resposta traz um `token` (7 dias) para consultar o desfecho real.
// `errors` é array de objetos { id, status, messages: [{ category }] }.
export function conferirResposta(json) {
  const codigo = json?.statusCode;
  if (codigo === 0) return json;

  const msg = MSGS_ERRO[String(codigo)] || `Erro OLX código ${codigo}.`;
  const detalhes = (json?.errors || [])
    .flatMap((e) => (e?.messages || []).map((m) => traduzirCategoria(m?.category)))
    .filter(Boolean);
  throw new Error([msg, ...detalhes].join(' '));
}

// Traduz o retorno de status_importacao (POST import/{token}) para o nosso
// modelo. ads = { [id]: { status, operation, message: [{error}], url } };
// accepted = anúncio ativo (é DAQUI que sai a URL real do anúncio).
export function interpretarStatusImportacao(resposta, idExterno) {
  const ad = resposta?.ads?.[idExterno];
  if (!ad) return { status: 'processando' };

  if (ad.status === 'accepted') {
    return ad.operation === 'delete'
      ? { status: 'despublicado' }
      : { status: 'publicado', link_externo: ad.url || null };
  }
  if (ad.status === 'refused' || ad.status === 'error') {
    const motivos = (ad.message || []).map((m) => traduzirCategoria(m?.error)).filter(Boolean);
    return {
      status: 'erro',
      mensagem_erro: motivos.length ? motivos.join(' ') : 'Anúncio recusado pela moderação da OLX.',
    };
  }
  // pending | queued → segue em processamento
  return { status: 'processando' };
}

export const conectorOlx = {
  canal: 'olx',

  async publicar(anuncio) {
    try {
      const [{ cep, telefone }, catalogo] = await Promise.all([
        buscarLoja(anuncio.loja_id),
        resolverCatalogoOlx(anuncio),
      ]);
      const ad = montarAdBody(anuncio, null, cep, telefone, catalogo);
      const resp = conferirResposta(await chamarOlxApi({ acao: 'publicar', ad }));
      // Sem link aqui de propósito: a URL real só existe quando a moderação
      // aceita o anúncio (consultarStatus) — antes disso, qualquer link seria fake.
      return { ok: true, status: 'processando', id_externo: ad.id, token: resp.token || null };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async atualizar(anuncio, pub) {
    try {
      const [{ cep, telefone }, catalogo] = await Promise.all([
        buscarLoja(anuncio.loja_id),
        resolverCatalogoOlx(anuncio),
      ]);
      const ad = montarAdBody(anuncio, pub.id_externo, cep, telefone, catalogo);
      const resp = conferirResposta(await chamarOlxApi({ acao: 'atualizar', ad }));
      // Edição também passa pela moderação assíncrona; o link já confirmado
      // segue válido enquanto isso.
      return {
        ok: true,
        status: 'processando',
        id_externo: pub.id_externo,
        link_externo: pub.link_externo,
        token: resp.token || null,
      };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  async despublicar(pub) {
    try {
      conferirResposta(await chamarOlxApi({ acao: 'despublicar', ad: { id: pub.id_externo, operation: 'delete' } }));
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  // Consulta o desfecho real da moderação. 1º pelo token de importação
  // (POST import/{token}, expira em 7 dias); se já expirou (404), cai para a
  // listagem de anúncios publicados (GET /autoupload/v1/published).
  async consultarStatus(pub) {
    if (!pub?.id_externo) return { status: pub?.status };
    try {
      if (pub.token_importacao) {
        try {
          const resp = await chamarOlxApi({ acao: 'status_importacao', token: pub.token_importacao });
          return interpretarStatusImportacao(resp, pub.id_externo);
        } catch {
          // token expirado/indisponível — tenta a listagem de publicados
        }
      }

      const MAPA_PUBLICADOS = {
        published: 'publicado',
        pending_review: 'processando',
        refused: 'erro',
        deleted: 'despublicado',
      };
      let pageToken = null;
      for (let pagina = 0; pagina < 10; pagina++) {
        const resp = await chamarOlxApi({ acao: 'status_publicados', page_token: pageToken });
        const achado = (resp?.data || []).find((a) => a.id === pub.id_externo);
        if (achado) {
          const r = { status: MAPA_PUBLICADOS[achado.status] || pub.status };
          if (r.status === 'erro') r.mensagem_erro = 'Anúncio recusado pela moderação da OLX.';
          return r;
        }
        pageToken = resp?.next_token;
        if (!pageToken) break;
      }
      return { status: pub.status };
    } catch {
      return { status: pub.status };
    }
  },
};
