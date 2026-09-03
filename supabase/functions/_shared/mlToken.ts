// Helper compartilhado: devolve um access_token válido do Mercado Livre
// para uma credencial de canal_credencial, renovando quando necessário.
//
// O access_token do ML expira em 6h e o refresh_token é de USO ÚNICO —
// cada renovação devolve um par novo, que precisa ser persistido na hora.
//
// Corrida entre requisições concorrentes (2 usuários da mesma loja com o
// token expirado): as duas tentam renovar, mas o ML aceita só a primeira —
// a segunda receberia invalid_grant e, na versão ingênua, derrubava a
// conexão da loja inteira. Estratégia aqui (sem lock de banco):
//   1. antes de renovar, RELÊ a credencial — outra requisição pode já ter
//      renovado (caminho comum da corrida)
//   2. se a renovação falhar, espera curta + relê de novo — se o vencedor
//      salvou um par novo, usa o dele em vez de marcar erro
//   3. só marca status 'erro' (pede reconexão na UI) se após a recuperação
//      ainda não houver token válido
//
// Usado por ml-api (proxy do frontend) e ml-webhook (notificações).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// typeof Deno !== 'undefined': este módulo é importado direto pelos testes
// vitest (renovação de token, sem tocar o ML real) — fora do Deno, os
// testes injetam ML_CLIENT_ID/SECRET via globalThis.__ML_TOKEN_TEST_ENV__.
const temDeno = typeof Deno !== 'undefined';
function envGet(nome: string): string | undefined {
  return temDeno ? Deno.env.get(nome) : (globalThis as any).__ML_TOKEN_TEST_ENV__?.[nome];
}

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const MARGEM_MS = 5 * 60 * 1000; // renova se faltar <5min

// Log com prefixo fixo para dar grep em `supabase functions logs`.
// NUNCA loga access_token nem refresh_token — só quando expira(va), que é
// o suficiente para provar que a renovação aconteceu. Log de token é
// vazamento de credencial com outro nome: fica no histórico do painel,
// legível por quem tiver acesso aos logs do projeto.
function log(evento: string, dados: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ tag: '[mlToken]', evento, ...dados }));
}

export interface CredencialML {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  ml_user_id?: number;
}

const valida = (c?: CredencialML | null) =>
  !!c?.access_token && new Date(c.expires_at || 0).getTime() - Date.now() >= MARGEM_MS;

async function lerCredencial(admin: SupabaseClient, lojaId: string): Promise<CredencialML | null> {
  const { data } = await admin
    .from('canal_credencial')
    .select('credenciais')
    .eq('loja_id', lojaId)
    .eq('canal', 'mercado_livre')
    .maybeSingle();
  return (data?.credenciais as CredencialML) || null;
}

export async function tokenValidoML(
  admin: SupabaseClient,
  lojaId: string,
  cred: CredencialML,
): Promise<{ token?: string; erro?: string }> {
  if (valida(cred)) {
    log('token_valido', { loja_id: lojaId, expires_at: cred.expires_at });
    return { token: cred.access_token };
  }

  log('renovacao_necessaria', { loja_id: lojaId, expires_at: cred.expires_at });

  // 1. Relê antes de renovar: outra requisição pode ter renovado agora mesmo.
  const atual = (await lerCredencial(admin, lojaId)) || cred;
  if (valida(atual)) {
    log('corrida_ja_renovada', { loja_id: lojaId, expires_at: atual.expires_at });
    return { token: atual.access_token };
  }

  // Sem refresh_token não há o que renovar. Acontece quando o OAuth foi feito
  // sem o scope 'offline_access' — o ML devolve só o access_token de 6h.
  // Mensagem explícita em vez de mandar refresh_token=undefined ao ML e
  // receber de volta um invalid_grant que não explica nada.
  if (!atual.refresh_token) {
    log('sem_refresh_token', { loja_id: lojaId, motivo: 'conexao feita sem scope offline_access' });
    await admin
      .from('canal_credencial')
      .update({ status: 'erro' })
      .eq('loja_id', lojaId)
      .eq('canal', 'mercado_livre');
    return {
      erro:
        'A conexão com o Mercado Livre foi feita sem permissão de acesso contínuo (offline_access), ' +
        'então o token não pode ser renovado. Reconecte em Configurações → Conexões.',
    };
  }

  const res = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: envGet('ML_CLIENT_ID')!,
      client_secret: envGet('ML_CLIENT_SECRET')!,
      refresh_token: atual.refresh_token,
    }),
  });

  if (!res.ok) {
    log('refresh_recusado', { loja_id: lojaId, http_status: res.status });

    // 2. Pode ser corrida: o vencedor invalidou nosso refresh_token mas ainda
    // não tinha salvo o par novo quando relemos. Espera curta e tenta o dele.
    await new Promise((r) => setTimeout(r, 1500));
    const doVencedor = await lerCredencial(admin, lojaId);
    if (valida(doVencedor)) {
      log('corrida_recuperada', { loja_id: lojaId, expires_at: doVencedor!.expires_at });
      return { token: doVencedor!.access_token };
    }

    // 3. Não era corrida — refresh_token realmente inválido/expirado.
    // Achado (02/09/2026): aqui era gravado 'erro', não 'expirado' — a UI
    // (ConfiguracoesPage.jsx, STATUS_CX) já tem um badge específico para
    // isso ("Expirada — reconecte"), no mesmo padrão usado pela OLX
    // (commit e9de48b). Usar 'erro' mostrava o badge genérico "Erro" em vez
    // da mensagem acionável que já existe pronta na UI.
    log('conexao_marcada_expirada', { loja_id: lojaId, motivo: 'refresh_token invalido ou expirado' });
    await admin
      .from('canal_credencial')
      .update({ status: 'expirado' })
      .eq('loja_id', lojaId)
      .eq('canal', 'mercado_livre');
    return { erro: 'Sessão Mercado Livre expirou. Reconecte em Configurações.' };
  }

  // Renovação OK — quem teve sucesso no ML detém o par mais novo; salva direto.
  const novo = await res.json();
  const credenciais: CredencialML = {
    access_token: novo.access_token,
    refresh_token: novo.refresh_token, // o antigo foi invalidado
    expires_at: new Date(Date.now() + (novo.expires_in ?? 21600) * 1000).toISOString(),
    ml_user_id: atual.ml_user_id,
  };

  const { error: erroGravacao } = await admin
    .from('canal_credencial')
    .update({ credenciais })
    .eq('loja_id', lojaId)
    .eq('canal', 'mercado_livre');

  // A gravação é a parte que NAO pode falhar em silencio: se o par novo nao
  // for persistido, o refresh_token antigo ja foi invalidado pelo ML e a
  // proxima renovacao derruba a conexao da loja.
  if (erroGravacao) {
    log('falha_ao_gravar_credencial', { loja_id: lojaId, erro: erroGravacao.message });
  } else {
    log('renovado', {
      loja_id: lojaId,
      expires_at_anterior: atual.expires_at,
      expires_at_novo: credenciais.expires_at,
    });
  }

  return { token: credenciais.access_token };
}
