// Edge Function: recebe o callback OAuth da OLX, valida o state (nonce de uso
// único em oauth_state — migration 0021), troca o code pelo access_token
// (server-side para o client_secret nunca ficar exposto no browser) e salva
// a credencial em canal_credencial via service role key (bypassa RLS).
//
// Atenção: a OLX NÃO devolve refresh_token nem expires_in — o access_token
// expira em ~12h e a única renovação é o lojista refazer este fluxo.
//
// Secrets necessários (supabase secrets set ...):
//   OLX_CLIENT_ID       — fornecido pela OLX após registro da aplicação
//   OLX_CLIENT_SECRET   — fornecido pela OLX após registro da aplicação
//   OLX_REDIRECT_URI    — URL desta função: https://<project>.supabase.co/functions/v1/olx-oauth-callback
//   FRONTEND_URL        — URL do app (ex: https://app.financiagestao.com.br)
//   SUPABASE_URL        — injetado automaticamente pelo Supabase
//   SUPABASE_SERVICE_ROLE_KEY — injetado automaticamente pelo Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OLX_TOKEN_URL = 'https://auth.olx.com.br/oauth/token';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
  const redir = (sufixo: string) =>
    Response.redirect(`${frontendUrl}/configuracoes${sufixo}`, 302);

  if (errorParam) return redir(`?olx_erro=${encodeURIComponent(errorParam)}`);
  if (!code || !stateParam) return redir('?olx_erro=par%C3%A2metros+ausentes');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // state = nonce aleatório de uso único gravado em oauth_state pelo app
  // (RLS garante que o usuário só grava para a própria loja). Resolver o
  // nonce aqui — em vez de aceitar um loja_id vindo na URL — impede que um
  // state forjado vincule uma conta OLX à loja de outro tenant.
  const { data: stateRow } = await supabase
    .from('oauth_state')
    .select('loja_id, expira_em')
    .eq('nonce', stateParam)
    .eq('canal', 'olx')
    .maybeSingle();

  // uso único: apaga antes de qualquer validação de expiração
  if (stateRow) {
    await supabase.from('oauth_state').delete().eq('nonce', stateParam);
  }

  if (!stateRow) return redir('?olx_erro=state+inv%C3%A1lido');
  if (new Date(stateRow.expira_em).getTime() < Date.now()) {
    return redir('?olx_erro=conex%C3%A3o+expirou+%E2%80%94+tente+de+novo');
  }

  const lojaId: string = stateRow.loja_id;

  // Troca o code pelo access_token
  const tokenRes = await fetch(OLX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get('OLX_CLIENT_ID')!,
      client_secret: Deno.env.get('OLX_CLIENT_SECRET')!,
      redirect_uri: Deno.env.get('OLX_REDIRECT_URI')!,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return redir(`?olx_erro=${encodeURIComponent('Falha no token: ' + txt)}`);
  }

  const { access_token } = await tokenRes.json();
  if (!access_token) return redir('?olx_erro=token+n%C3%A3o+retornado');

  // Salva em canal_credencial (service role bypassa RLS)
  const { error: dbError } = await supabase.from('canal_credencial').upsert(
    {
      loja_id: lojaId,
      canal: 'olx',
      credenciais: { access_token },
      status: 'conectado',
      conectado_em: new Date().toISOString(),
    },
    { onConflict: 'loja_id,canal' },
  );

  if (dbError) {
    return redir(`?olx_erro=${encodeURIComponent(dbError.message)}`);
  }

  return redir('?olx=conectado');
});
