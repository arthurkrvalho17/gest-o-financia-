// Edge Function: callback OAuth do Mercado Livre. Troca o code pelo par
// access_token + refresh_token (server-side, client_secret nunca vai ao browser)
// e salva em canal_credencial via service role.
//
// Diferenças vs OLX: o ML devolve refresh_token (uso único, renovado a cada
// refresh) e o access_token expira em 6h — guardamos expires_at para a
// função ml-api renovar automaticamente antes de cada chamada.
//
// Secrets necessários (supabase secrets set ...):
//   ML_CLIENT_ID        — APP_ID do aplicativo no devcenter ML
//   ML_CLIENT_SECRET    — Secret Key do aplicativo
//   ML_REDIRECT_URI     — URL desta função: https://<project>.supabase.co/functions/v1/ml-oauth-callback
//   FRONTEND_URL        — URL do app (compartilhado com o OLX)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — injetados automaticamente

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173';
  const redir = (sufixo: string) =>
    Response.redirect(`${frontendUrl}/configuracoes${sufixo}`, 302);

  if (errorParam) return redir(`?ml_erro=${encodeURIComponent(errorParam)}`);
  if (!code || !stateParam) return redir('?ml_erro=par%C3%A2metros+ausentes');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // state = nonce aleatório de uso único gravado em oauth_state pelo app
  // (RLS garante que o usuário só grava para a própria loja). Resolver o
  // nonce aqui — em vez de aceitar um loja_id vindo na URL — impede que um
  // state forjado vincule uma conta ML à loja de outro tenant.
  const { data: stateRow } = await supabase
    .from('oauth_state')
    .select('loja_id, expira_em')
    .eq('nonce', stateParam)
    .eq('canal', 'mercado_livre')
    .maybeSingle();

  // uso único: apaga antes de qualquer validação de expiração
  if (stateRow) {
    await supabase.from('oauth_state').delete().eq('nonce', stateParam);
  }

  if (!stateRow) return redir('?ml_erro=state+inv%C3%A1lido');
  if (new Date(stateRow.expira_em).getTime() < Date.now()) {
    return redir('?ml_erro=conex%C3%A3o+expirou+%E2%80%94+tente+de+novo');
  }

  const lojaId: string = stateRow.loja_id;

  const tokenRes = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: Deno.env.get('ML_CLIENT_ID')!,
      client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
      redirect_uri: Deno.env.get('ML_REDIRECT_URI')!,
    }),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return redir(`?ml_erro=${encodeURIComponent('Falha no token: ' + txt.slice(0, 200))}`);
  }

  const { access_token, refresh_token, expires_in, user_id } = await tokenRes.json();
  if (!access_token) return redir('?ml_erro=token+n%C3%A3o+retornado');

  const { error: dbError } = await supabase.from('canal_credencial').upsert(
    {
      loja_id: lojaId,
      canal: 'mercado_livre',
      credenciais: {
        access_token,
        refresh_token,
        ml_user_id: user_id,
        expires_at: new Date(Date.now() + (expires_in ?? 21600) * 1000).toISOString(),
      },
      status: 'conectado',
      conectado_em: new Date().toISOString(),
    },
    { onConflict: 'loja_id,canal' },
  );

  if (dbError) {
    return redir(`?ml_erro=${encodeURIComponent(dbError.message)}`);
  }

  return redir('?ml=conectado');
});
