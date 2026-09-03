// Edge Function: proxy autenticado para a API do Mercado Livre.
//
// Por que existe: a API do ML bloqueia chamadas de browser (CORS) e o
// access_token expira em 6h com refresh_token de USO ÚNICO — a renovação
// precisa do client_secret e de escrita atômica no banco, ambos server-side.
//
// Fluxo por requisição:
//   1. Valida o JWT do usuário (Authorization) e resolve a loja dele
//   2. Carrega canal_credencial (mercado_livre) da loja
//   3. Se o token expira em <5min, renova e persiste o novo par de tokens
//   4. Chama https://api.mercadolibre.com{path} e devolve a resposta
//
// Body esperado: { path: '/items', method: 'POST', body: {...} }
// Somente paths da allowlist são aceitos.
//
// Secrets: ML_CLIENT_ID, ML_CLIENT_SECRET (os mesmos do ml-oauth-callback).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { tokenValidoML } from '../_shared/mlToken.ts';

const ML_API = 'https://api.mercadolibre.com';
const PATHS_PERMITIDOS = ['/items', '/users/me', '/sites/MLB'];

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
  const { path, method = 'GET', body } = await req.json().catch(() => ({}));
  if (!path || !PATHS_PERMITIDOS.some((p) => path.startsWith(p))) {
    return json(400, { erro: 'Path não permitido.' });
  }

  // 3. Carrega credenciais e renova o token se necessário
  const { data: cred } = await admin
    .from('canal_credencial')
    .select('credenciais, status')
    .eq('loja_id', usuario.loja_id)
    .eq('canal', 'mercado_livre')
    .maybeSingle();

  if (!cred || cred.status !== 'conectado' || !cred.credenciais?.access_token) {
    return json(409, { erro: 'Mercado Livre não conectado. Conecte em Configurações.' });
  }

  const { token, erro } = await tokenValidoML(admin, usuario.loja_id, cred.credenciais);
  if (erro) return json(409, { erro });

  // 4. Chama a API do ML e repassa a resposta
  const mlRes = await fetch(`${ML_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  const mlBody = await mlRes.json().catch(() => ({}));
  return json(mlRes.status, mlBody);
});
