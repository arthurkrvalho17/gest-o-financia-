// Edge Function: proxy autenticado para a API da Webmotors (gateway Sensedia).
//
// Por que existe: o token do gateway é obtido por client_credentials com o
// client_secret do APP Financia+ — que só pode viver no servidor. A credencial
// por loja (usuário "Integrador de API" do Cockpit) vai no body, lida pelo
// conector da própria canal_credencial da loja.
//
// Fluxo por requisição:
//   1. Valida o JWT do usuário (Authorization) e resolve a loja dele
//   2. Confere que a loja tem a Webmotors conectada em canal_credencial
//   3. Garante um access_token do gateway (client_credentials, cache em memória)
//   4. Chama {WEBMOTORS_API_URL}{path} e devolve a resposta
//
// Body esperado: { path: '/api/estoque/veiculos', method: 'POST', body: {...} }
// Somente paths com o prefixo da allowlist são aceitos.
//
// Secrets: WEBMOTORS_CLIENT_ID, WEBMOTORS_CLIENT_SECRET e, opcionalmente,
// WEBMOTORS_API_URL (troque para a URL de homologação durante os testes).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WM_API = Deno.env.get('WEBMOTORS_API_URL') || 'https://api.webmotors.com.br';
// Sensedia: token de app via client_credentials. Confirmar o path exato do
// token na homologação (padrão Sensedia: /oauth/access-token).
const WM_TOKEN_URL = Deno.env.get('WEBMOTORS_TOKEN_URL') || `${WM_API}/oauth/access-token`;
// Estreitar para os paths exatos do swagger assim que a homologação liberar.
const PREFIXOS_PERMITIDOS = ['/api/'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// Cache do token do gateway (por instância da função; expira com folga de 60s)
let tokenCache: { token: string; expiraEm: number } | null = null;

async function tokenGateway(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiraEm) return tokenCache.token;

  const clientId = Deno.env.get('WEBMOTORS_CLIENT_ID');
  const clientSecret = Deno.env.get('WEBMOTORS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Secrets WEBMOTORS_CLIENT_ID/WEBMOTORS_CLIENT_SECRET não configurados.');
  }

  const res = await fetch(WM_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Falha ao obter token do gateway Webmotors (HTTP ${res.status}).`);

  const dados = await res.json();
  const expiresIn = Number(dados.expires_in) || 3600;
  tokenCache = {
    token: dados.access_token,
    expiraEm: Date.now() + (expiresIn - 60) * 1000,
  };
  return tokenCache.token;
}

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
  if (!path || !PREFIXOS_PERMITIDOS.some((p) => String(path).startsWith(p))) {
    return json(400, { erro: 'Path não permitido.' });
  }

  // 3. A loja precisa estar conectada (a credencial do Integrador vai no body)
  const { data: cred } = await admin
    .from('canal_credencial')
    .select('status')
    .eq('loja_id', usuario.loja_id)
    .eq('canal', 'webmotors')
    .maybeSingle();
  if (!cred || cred.status !== 'conectado') {
    return json(409, { erro: 'Webmotors não conectada. Conecte em Configurações.' });
  }

  // 4. Token do gateway + chamada à API
  let token: string;
  try {
    token = await tokenGateway();
  } catch (e) {
    return json(502, { erro: (e as Error).message });
  }

  const wmRes = await fetch(`${WM_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      client_id: Deno.env.get('WEBMOTORS_CLIENT_ID')!, // Sensedia pede o client_id em header
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  const wmBody = await wmRes.json().catch(() => ({}));
  return json(wmRes.status, wmBody);
});
