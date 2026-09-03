// Edge Function: recebe notificações (webhooks) do Mercado Livre.
// Deploy OBRIGATORIAMENTE com --no-verify-jwt (o ML não manda Authorization).
//
// Verificação de origem: o ML não assina o payload (sem HMAC documentado) —
// a notificação em si é só um ponteiro (topic/resource/user_id), nunca dado
// de negócio direto, e a função sempre busca o recurso de volta na API do ML
// com o token da própria loja antes de gravar qualquer coisa. Ainda assim,
// SEM segredo na URL, qualquer um pode forjar essa notificação e forçar a
// função a fazer, com o token real de uma loja, um GET autenticado em
// QUALQUER `resource` que o atacante escolher — um proxy autenticado que
// grava o que vier em `leads`/`anuncio_publicacao`. Corrigido com um token
// fixo na query string, do mesmo jeito que o ASAAS_WEBHOOK_TOKEN já previsto
// para o futuro asaas-webhook (INTEGRACOES.md §9): registre a notification
// URL no devcenter do ML já com `?token=...` e configure o secret
// ML_WEBHOOK_TOKEN com o MESMO valor — `supabase secrets set
// ML_WEBHOOK_TOKEN=<valor aleatório>`. Sem o secret configurado, a função
// segue aceitando qualquer chamada (comportamento anterior) — não quebra o
// que já está no ar; configurar o secret é o que liga a proteção.
//
// O ML exige resposta 200 em <500ms, senão reenvia — então:
//   1. responde 200 na hora
//   2. processa em background (EdgeRuntime.waitUntil)
//
// Processamento por tópico:
//   vis_leads → busca o lead na API e insere em leads (cai no funil do CRM,
//               amarrado ao veículo via anuncio_publicacao.id_externo)
//   questions → pergunta de interessado num anúncio vira lead no CRM
//   items     → busca o item e sincroniza o status em anuncio_publicacao
//   demais    → só ficam guardados em integracao_evento para uso futuro
//
// Todo evento é salvo BRUTO em integracao_evento antes de processar:
// se algo falhar, nada se perde e dá pra reprocessar.
//
// Notificação ML: { resource, user_id, topic, application_id, attempts, sent, received }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { tokenValidoML, type CredencialML } from '../_shared/mlToken.ts';

const ML_API = 'https://api.mercadolibre.com';

const STATUS_PUBLICACAO: Record<string, string> = {
  active: 'publicado',
  paused: 'pausado',
  closed: 'despublicado',
  under_review: 'pendente',
};

// Insere um lead no funil do CRM, amarrado ao veículo quando o item_id do ML
// corresponde a uma publicação nossa.
async function inserirLead(
  admin: ReturnType<typeof createClient>,
  lojaId: string,
  { nome, telefone, itemId }: { nome: string; telefone: string | null; itemId: string | null },
) {
  let veiculoId: string | null = null;
  if (itemId) {
    const { data: pub } = await admin
      .from('anuncio_publicacao')
      .select('veiculo_id')
      .eq('canal', 'mercado_livre')
      .eq('id_externo', itemId)
      .eq('loja_id', lojaId)
      .maybeSingle();
    veiculoId = pub?.veiculo_id || null;
  }

  await admin.from('leads').insert({
    loja_id: lojaId,
    nome,
    telefone,
    canal_origem: 'mercado_livre',
    etapa: 'novo',
    veiculo_id: veiculoId,
  });
}

async function processar(notif: Record<string, unknown>) {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const topico = String(notif.topic || '');
  const resource = String(notif.resource || '');
  const mlUserId = String(notif.user_id || '');

  // Dedup: o ML reenvia notificações; se este resource+tópico já foi processado, ignora.
  const { data: jaProcessado } = await admin
    .from('integracao_evento')
    .select('id')
    .eq('canal', 'mercado_livre')
    .eq('resource', resource)
    .eq('topico', topico)
    .eq('processado', true)
    .limit(1)
    .maybeSingle();

  // Resolve a loja pelo ml_user_id salvo na conexão OAuth
  const { data: cred } = await admin
    .from('canal_credencial')
    .select('loja_id, credenciais')
    .eq('canal', 'mercado_livre')
    .filter('credenciais->>ml_user_id', 'eq', mlUserId)
    .maybeSingle();

  const { data: evento } = await admin
    .from('integracao_evento')
    .insert({
      canal: 'mercado_livre',
      topico,
      resource,
      usuario_externo: mlUserId,
      loja_id: cred?.loja_id || null,
      payload: notif,
      processado: false,
    })
    .select('id')
    .single();

  const marcarEvento = (campos: Record<string, unknown>) =>
    evento?.id
      ? admin.from('integracao_evento').update(campos).eq('id', evento.id)
      : Promise.resolve();

  if (jaProcessado) {
    await marcarEvento({ processado: true, erro_processamento: 'duplicado — ignorado' });
    return;
  }
  if (!cred?.loja_id) {
    await marcarEvento({ erro_processamento: 'loja não encontrada para este ml_user_id' });
    return;
  }

  try {
    const { token, erro } = await tokenValidoML(admin, cred.loja_id, cred.credenciais as CredencialML);
    if (erro) throw new Error(erro);

    const res = await fetch(`${ML_API}${resource}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`GET ${resource} → HTTP ${res.status}`);
    const dado = await res.json();

    if (topico === 'items') {
      const novoStatus = STATUS_PUBLICACAO[dado.status];
      if (novoStatus && dado.id) {
        await admin
          .from('anuncio_publicacao')
          .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
          .eq('canal', 'mercado_livre')
          .eq('id_externo', dado.id)
          .eq('loja_id', cred.loja_id);
      }
    } else if (topico === 'vis_leads' || topico.startsWith('vis')) {
      // Formato do lead VIS varia por tipo de contato — extração defensiva;
      // o payload bruto fica em integracao_evento se precisarmos de mais campos.
      await inserirLead(admin, cred.loja_id, {
        nome: dado.buyer?.name || dado.contact?.name || dado.name || 'Lead Mercado Livre',
        telefone: dado.buyer?.phone?.number || dado.contact?.phone || dado.phone?.number || null,
        itemId: dado.item_id || dado.item?.id || null,
      });
    } else if (topico === 'questions') {
      // Pergunta num anúncio = interessado. O payload traz só o id do autor;
      // buscamos o apelido público para o card do CRM ter um nome.
      let nome = 'Interessado ML';
      if (dado.from?.id) {
        const uRes = await fetch(`${ML_API}/users/${dado.from.id}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (uRes.ok) nome = (await uRes.json()).nickname || nome;
      }
      await inserirLead(admin, cred.loja_id, {
        nome,
        telefone: null,
        itemId: dado.item_id || null,
      });
    }
    // messages e demais tópicos: só o registro em integracao_evento por ora

    await marcarEvento({ processado: true });
  } catch (e) {
    await marcarEvento({ erro_processamento: String(e?.message || e).slice(0, 500) });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const tokenEsperado = Deno.env.get('ML_WEBHOOK_TOKEN');
  if (tokenEsperado && new URL(req.url).searchParams.get('token') !== tokenEsperado) {
    return new Response('token inválido', { status: 401 });
  }

  const notif = await req.json().catch(() => null);
  if (notif?.resource) {
    // Responde já; o processamento continua depois da resposta
    EdgeRuntime.waitUntil(processar(notif));
  }
  return new Response('ok', { status: 200 });
});
