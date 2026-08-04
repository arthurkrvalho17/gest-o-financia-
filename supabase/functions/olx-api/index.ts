// Edge Function: proxy autenticado para a API Autoupload da OLX.
//
// Por que existe: a OLX bloqueia chamadas de browser (CORS) e o access_token
// da loja NUNCA pode transitar pelo cliente — ele vive em canal_credencial e
// só é lido aqui, com service role.
//
// Fluxo por requisição (mesmo padrão do ml-api):
//   1. Valida o JWT do usuário (Authorization) e resolve a loja dele
//   2. Carrega canal_credencial (olx) da loja
//   3. Executa a ação contra https://apps.olx.com.br e devolve a resposta
//
// Body esperado:
//   { acao: 'publicar' | 'atualizar' | 'despublicar', ad: {...} }
//   { acao: 'catalogo', caminho: [] | [id_marca] | [id_marca, id_modelo] }
//   { acao: 'status_importacao', token: '<token do import, válido 7 dias>' }
//   { acao: 'status_publicados', page_token?: '<paginação>' }
// (loja_id NÃO é aceito do cliente: a loja é sempre a do JWT — evita que um
// tenant publique/despublique usando credencial de outro.)
//
// A OLX não devolve refresh_token nem expires_in: o token expira em ~12h e a
// ÚNICA renovação possível é o lojista refazer o OAuth. Não existe renovação
// automática silenciosa aqui de propósito.
//
// Secrets: nenhum próprio (usa SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY injetados).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OLX_IMPORT_URL = 'https://apps.olx.com.br/autoupload/import';
const OLX_CAR_INFO_URL = 'https://apps.olx.com.br/autoupload/car_info';
const MAX_PAYLOAD_BYTES = 1024 * 1024; // limite documentado da OLX: 1MB

// Cache do Catálogo de Autos (marcas/modelos/versões mudam raramente; os IDs
// foram trocados em 25/09/2025 — TTL de 24h evita servir catálogo velho por
// muito tempo sem rebater na OLX a cada publicação).
const CATALOGO_TTL_MS = 24 * 60 * 60 * 1000;
const cacheCatalogo = new Map<string, { corpo: unknown; expira: number }>();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Identifica o usuário pelo JWT enviado pelo supabase.functions.invoke
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: userData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !userData?.user) return json(401, { erro: 'Não autenticado.' });

  const { data: usuario } = await admin
    .from('usuarios')
    .select('loja_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!usuario?.loja_id) return json(403, { erro: 'Usuário sem loja vinculada.' });

  // 2. Valida a requisição
  const { acao, ad, caminho, token, page_token } = await req.json().catch(() => ({}));
  const ACOES_IMPORT = ['publicar', 'atualizar', 'despublicar'];
  const ACOES = [...ACOES_IMPORT, 'catalogo', 'status_importacao', 'status_publicados'];
  if (!ACOES.includes(acao)) {
    return json(400, { erro: 'Ação não permitida.' });
  }
  if (ACOES_IMPORT.includes(acao) && (!ad || typeof ad !== 'object' || !ad.id)) {
    return json(400, { erro: 'Anúncio (ad) ausente ou sem id.' });
  }

  // 3. Carrega a credencial OLX da loja
  const { data: cred } = await admin
    .from('canal_credencial')
    .select('credenciais, status')
    .eq('loja_id', usuario.loja_id)
    .eq('canal', 'olx')
    .maybeSingle();

  if (!cred || cred.status !== 'conectado' || !cred.credenciais?.access_token) {
    return json(409, { erro: 'OLX não conectada. Conecte em Configurações > Conexões.' });
  }

  const accessToken = cred.credenciais.access_token;

  // 4a. Catálogo de Autos: POST autenticado em /car_info[/{marca}[/{modelo}]],
  // resposta { status, data: { "NOME": id } }. Cacheada por 24h — o catálogo é
  // grande e estável, e cada publicação faria 3 consultas.
  if (acao === 'catalogo') {
    const segmentos = Array.isArray(caminho) ? caminho.map(String) : [];
    if (segmentos.length > 2 || segmentos.some((s) => !/^\d+$/.test(s))) {
      return json(400, { erro: 'Caminho de catálogo inválido.' });
    }
    const url = [OLX_CAR_INFO_URL, ...segmentos].join('/');

    const emCache = cacheCatalogo.get(url);
    if (emCache && emCache.expira > Date.now()) return json(200, emCache.corpo);

    const catRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });
    const catBody = await catRes.json().catch(() => ({}));
    if (catRes.ok && catBody?.status === 'ok') {
      cacheCatalogo.set(url, { corpo: catBody, expira: Date.now() + CATALOGO_TTL_MS });
    }
    return json(catRes.status, catBody);
  }

  // 4b. Status da importação: POST /autoupload/import/{token} — o token vem
  // da resposta do import e expira em 7 dias (a OLX devolve 404 depois disso).
  if (acao === 'status_importacao') {
    if (!token || !/^[A-Za-z0-9._-]+$/.test(String(token))) {
      return json(400, { erro: 'Token de importação ausente ou inválido.' });
    }
    const stRes = await fetch(`${OLX_IMPORT_URL}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });
    const stBody = await stRes.json().catch(() => ({}));
    return json(stRes.status, stBody);
  }

  // 4c. Anúncios publicados: GET /autoupload/v1/published (Bearer). Fallback
  // de consulta quando o token de importação já expirou.
  if (acao === 'status_publicados') {
    const qs = page_token ? `?page_token=${encodeURIComponent(String(page_token))}` : '';
    const pubRes = await fetch(`https://apps.olx.com.br/autoupload/v1/published${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const pubBody = await pubRes.json().catch(() => ({}));
    return json(pubRes.status, pubBody);
  }

  // 4d. Chama o import da OLX e repassa a resposta.
  // publicar e atualizar são a MESMA operação na OLX ("insert" cria ou edita
  // pelo id); despublicar manda só { id, operation: 'delete' }.
  const payload = JSON.stringify({
    access_token: accessToken,
    ad_list: [ad],
  });
  if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
    return json(400, { erro: 'Payload acima de 1MB — reduza a quantidade/tamanho das fotos.' });
  }

  const olxRes = await fetch(OLX_IMPORT_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  const olxBody = await olxRes.json().catch(() => ({}));
  return json(olxRes.status, olxBody);
});
