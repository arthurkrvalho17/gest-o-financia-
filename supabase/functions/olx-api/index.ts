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
// Body esperado: { acao: 'publicar' | 'atualizar' | 'despublicar', ad: {...} }
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
const MAX_PAYLOAD_BYTES = 1024 * 1024; // limite documentado da OLX: 1MB

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
  const { acao, ad } = await req.json().catch(() => ({}));
  if (!['publicar', 'atualizar', 'despublicar'].includes(acao)) {
    return json(400, { erro: 'Ação não permitida.' });
  }
  if (!ad || typeof ad !== 'object' || !ad.id) {
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

  // 4. Chama o import da OLX e repassa a resposta.
  // publicar e atualizar são a MESMA operação na OLX ("insert" cria ou edita
  // pelo id); despublicar manda só { id, operation: 'delete' }.
  const payload = JSON.stringify({
    access_token: cred.credenciais.access_token,
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
