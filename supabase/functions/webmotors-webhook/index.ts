// Edge Function: recebe os callbacks da Webmotors (portal Sensedia).
// Deploy OBRIGATORIAMENTE com --no-verify-jwt (a Webmotors não manda Authorization).
//
// Verificação de origem: o formato/assinatura do callback não é público antes
// da homologação (comentário abaixo) — sem segredo, qualquer POST forjado com
// um `usuario` de integrador real injeta lead falso no CRM daquela loja.
// Corrigido com um token fixo na query string, junto do `topico` que a
// Webmotors já ecoa de volta: registre as Callback URLs no Cockpit já com
// `&token=...` e configure `supabase secrets set WEBMOTORS_WEBHOOK_TOKEN=
// <valor aleatório>` com o MESMO valor. Sem o secret configurado, a função
// segue aceitando qualquer chamada (comportamento anterior).
//
// O cadastro do app no portal pede DUAS Callback URLs — apontamos as duas para
// esta função, distinguidas pela query string:
//   Callback URL Leads   → .../webmotors-webhook?topico=leads
//   Callback URL Estoque → .../webmotors-webhook?topico=estoque
//
// O formato do payload NÃO é público antes da homologação. Por isso esta função
// faz o mínimo indestrutível: responde 200 rápido e guarda o evento BRUTO em
// integracao_evento (processado=false) — nada se perde e dá pra (re)processar
// quando o contrato estiver confirmado. A extração de lead é defensiva: só
// insere no CRM se conseguir resolver a loja e um nome no payload.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function processar(topico: string, payload: Record<string, unknown>) {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Tenta resolver a loja pelo usuário Integrador de API, se o payload trouxer.
  // Campo exato a confirmar na homologação — até lá, eventos sem correspondência
  // ficam com loja_id null e são reprocessados depois.
  const usuarioExterno = String(
    payload.usuario || payload.login || payload.user || payload.integrador || '',
  );
  let lojaId: string | null = null;
  if (usuarioExterno) {
    const { data: cred } = await admin
      .from('canal_credencial')
      .select('loja_id')
      .eq('canal', 'webmotors')
      .filter('credenciais->>usuario', 'eq', usuarioExterno)
      .maybeSingle();
    lojaId = cred?.loja_id || null;
  }

  const { data: evento } = await admin
    .from('integracao_evento')
    .insert({
      canal: 'webmotors',
      topico,
      resource: String(payload.id || payload.codigoAnuncio || payload.leadId || ''),
      usuario_externo: usuarioExterno || null,
      loja_id: lojaId,
      payload,
      processado: false,
    })
    .select('id')
    .single();

  const marcarEvento = (campos: Record<string, unknown>) =>
    evento?.id
      ? admin.from('integracao_evento').update(campos).eq('id', evento.id)
      : Promise.resolve();

  if (!lojaId) {
    await marcarEvento({
      erro_processamento: 'loja não resolvida — confirmar campo do integrador na homologação',
    });
    return;
  }

  try {
    if (topico === 'leads') {
      // Extração defensiva de nome/telefone; o bruto fica em integracao_evento.
      const nome = String(payload.nome || payload.name || payload.cliente || '') || null;
      const telefone = String(payload.telefone || payload.phone || payload.celular || '') || null;
      if (nome) {
        await admin.from('leads').insert({
          loja_id: lojaId,
          nome,
          telefone,
          canal_origem: 'webmotors',
          etapa: 'novo',
          veiculo_id: null, // amarrar via anuncio_publicacao.id_externo pós-homologação
        });
        await marcarEvento({ processado: true });
        return;
      }
      await marcarEvento({ erro_processamento: 'lead sem nome no payload — reprocessar' });
      return;
    }
    // estoque e demais tópicos: só o registro bruto até o contrato ser confirmado
    await marcarEvento({ processado: true });
  } catch (e) {
    await marcarEvento({ erro_processamento: String((e as Error)?.message || e).slice(0, 500) });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const params = new URL(req.url).searchParams;
  const tokenEsperado = Deno.env.get('WEBMOTORS_WEBHOOK_TOKEN');
  if (tokenEsperado && params.get('token') !== tokenEsperado) {
    return new Response('token inválido', { status: 401 });
  }

  const topico = params.get('topico') || 'desconhecido';
  const payload = await req.json().catch(() => null);
  if (payload && typeof payload === 'object') {
    // Responde já; o processamento continua depois da resposta
    EdgeRuntime.waitUntil(processar(topico, payload as Record<string, unknown>));
  }
  return new Response('ok', { status: 200 });
});
