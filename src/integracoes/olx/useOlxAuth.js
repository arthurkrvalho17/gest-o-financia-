import { useState, useEffect } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';

const OLX_AUTH_URL = 'https://auth.olx.com.br/oauth';
// Mesma janela do authorization code da OLX (10 min)
const STATE_TTL_MS = 10 * 60 * 1000;

function getRedirectUri() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/olx-oauth-callback`;
}

const gerarNonce = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');

export function useOlxAuth() {
  const { loja } = useAuth();
  const lojaId = loja?.id;

  // O callback devolve o navegador com ?olx=conectado ou ?olx_erro=... —
  // lidos no estado inicial (lazy) para não precisar de setState no effect.
  const [status, setStatus] = useState(() =>
    new URLSearchParams(window.location.search).get('olx') === 'conectado'
      ? 'conectado'
      : 'carregando',
  );
  const [erroConexao, setErroConexao] = useState(() => {
    const erro = new URLSearchParams(window.location.search).get('olx_erro');
    return erro ? decodeURIComponent(erro) : '';
  });

  useEffect(() => {
    if (!supabaseConfigurado || !lojaId) return;

    const params = new URLSearchParams(window.location.search);
    const veioDoCallback = params.get('olx') === 'conectado' || params.get('olx_erro');
    if (veioDoCallback) {
      window.history.replaceState({}, '', window.location.pathname);
      if (params.get('olx') === 'conectado') return; // status já veio da URL
    }

    let ativo = true;
    supabase
      .from('canal_credencial')
      .select('status')
      .eq('loja_id', lojaId)
      .eq('canal', 'olx')
      .maybeSingle()
      .then(({ data }) => {
        if (ativo) setStatus(data?.status || 'desconectado');
      });
    return () => { ativo = false; };
  }, [lojaId]);

  // O state do OAuth é um nonce aleatório de uso único persistido em
  // oauth_state (RLS: só para a própria loja) e validado no callback —
  // um state forjado não vincula conta OLX à loja de outro tenant.
  async function conectar() {
    if (!lojaId) return;
    const clientId = import.meta.env.VITE_OLX_CLIENT_ID;
    if (!clientId) {
      setErroConexao('VITE_OLX_CLIENT_ID não configurado no .env.local');
      return;
    }

    const nonce = gerarNonce();
    const { error } = await supabase.from('oauth_state').insert({
      nonce,
      loja_id: lojaId,
      canal: 'olx',
      expira_em: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    });
    if (error) {
      setErroConexao(`Não foi possível iniciar a conexão OLX: ${error.message}`);
      return;
    }

    const qs = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'autoupload',
      redirect_uri: getRedirectUri(),
      state: nonce,
    });
    window.location.href = `${OLX_AUTH_URL}?${qs}`;
  }

  async function desconectar() {
    if (!lojaId) return;
    await supabase
      .from('canal_credencial')
      .delete()
      .eq('loja_id', lojaId)
      .eq('canal', 'olx');
    setStatus('desconectado');
  }

  return { status, erroConexao, conectar, desconectar };
}
