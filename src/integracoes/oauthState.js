// State do OAuth como nonce de uso único — compartilhado por TODOS os canais
// com redirect (OLX, Mercado Livre e os próximos).
//
// Por que existe: o state precisa amarrar o retorno do provedor à loja que
// iniciou a conexão. Codificar o loja_id no próprio state (base64) não amarra
// nada — é dado do cliente, forjável: bastava montar um state com o loja_id
// da vítima e completar o fluxo com a própria conta do portal para vincular
// essa conta à loja alheia (ver migration 0021).
//
// Aqui o state é um valor aleatório gravado em `oauth_state`, onde o RLS só
// deixa a loja gravar para si mesma. O callback (service role) resolve
// nonce → loja_id, exige que não tenha expirado e apaga o registro.
//
// Este módulo é compartilhado de propósito: quando o padrão vivia solto
// dentro de um hook, a correção foi aplicada na OLX e o Mercado Livre ficou
// para trás por meses, com o furo aberto.

import { supabase } from '../lib/supabase';

// Mesma janela do authorization code dos portais (10 min).
export const STATE_TTL_MS = 10 * 60 * 1000;

export function gerarNonce() {
  return globalThis.crypto?.randomUUID
    ? crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
}

// Cria e persiste o state da loja para um canal. Devolve { nonce } ou { error }.
export async function criarOauthState(lojaId, canal) {
  const nonce = gerarNonce();
  const { error } = await supabase.from('oauth_state').insert({
    nonce,
    loja_id: lojaId,
    canal,
    expira_em: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });
  if (error) return { error };
  return { nonce };
}
