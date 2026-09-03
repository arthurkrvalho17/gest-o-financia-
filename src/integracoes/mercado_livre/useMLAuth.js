import { useState, useEffect } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { criarOauthState } from '../oauthState';

const ML_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';

function getRedirectUri() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ml-oauth-callback`;
}

export function useMLAuth() {
  const { loja } = useAuth();
  const [status, setStatus] = useState('carregando');
  const [erroConexao, setErroConexao] = useState('');

  useEffect(() => {
    if (!supabaseConfigurado || !loja?.id) return;

    const params = new URLSearchParams(window.location.search);

    if (params.get('ml') === 'conectado') {
      window.history.replaceState({}, '', window.location.pathname);
      setStatus('conectado');
      return;
    }

    const erro = params.get('ml_erro');
    if (erro) {
      setErroConexao(decodeURIComponent(erro));
      window.history.replaceState({}, '', window.location.pathname);
    }

    carregarStatus();
  }, [loja?.id]);

  async function carregarStatus() {
    const { data } = await supabase
      .from('canal_credencial')
      .select('status')
      .eq('loja_id', loja.id)
      .eq('canal', 'mercado_livre')
      .maybeSingle();
    setStatus(data?.status || 'desconectado');
  }

  // O state é um nonce de uso único persistido em oauth_state (RLS: só para
  // a própria loja) e resolvido no callback — um state forjado não vincula
  // conta ML à loja de outro tenant. Ver src/integracoes/oauthState.js.
  async function conectar() {
    if (!loja?.id) return;
    const clientId = import.meta.env.VITE_ML_APP_ID;
    if (!clientId) {
      setErroConexao('VITE_ML_APP_ID não configurado no .env.local');
      return;
    }

    const { nonce, error } = await criarOauthState(loja.id, 'mercado_livre');
    if (error) {
      setErroConexao(`Não foi possível iniciar a conexão com o Mercado Livre: ${error.message}`);
      return;
    }

    // scope offline_access é o que faz o ML devolver refresh_token. Sem ele o
    // fluxo "funciona" — conecta e grava um access_token válido — mas em 6h a
    // conexão morre sem possibilidade de renovar, e o lojista precisa
    // reconectar na mão. Foi exatamente o que aconteceu na 1ª conexão real
    // (27/08): credencial gravada, ml_user_id certo, refresh_token ausente.
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: getRedirectUri(),
      scope: 'offline_access read write',
      state: nonce,
    });
    window.location.href = `${ML_AUTH_URL}?${qs}`;
  }

  async function desconectar() {
    if (!loja?.id) return;
    await supabase
      .from('canal_credencial')
      .delete()
      .eq('loja_id', loja.id)
      .eq('canal', 'mercado_livre');
    setStatus('desconectado');
  }

  return { status, erroConexao, conectar, desconectar };
}
