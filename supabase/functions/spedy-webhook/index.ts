// Edge Function: recebe webhooks da Spedy (invoice.status_changed e afins).
// Deploy OBRIGATORIAMENTE com --no-verify-jwt (a Spedy não manda Authorization).
//
// Verificação de origem: não há confirmação de que a Spedy assine o payload
// (sem HMAC documentado até hoje) — sem segredo, qualquer POST forjado com um
// CNPJ real de loja grava status arbitrário em nota_fiscal (ex.: marcar uma
// nota como 'authorized' sem ela ter sido emitida de verdade). Corrigido com
// um token fixo na query string: registre a URL do webhook na Spedy já com
// `?token=...` e configure `supabase secrets set SPEDY_WEBHOOK_TOKEN=<valor
// aleatório>` com o MESMO valor. Sem o secret configurado, a função segue
// aceitando qualquer chamada (comportamento anterior).
//
// Escopo do webhook é DE CONTA (Owner), não por empresa — um único webhook
// registrado uma vez (ver INTEGRACOES.md) recebe eventos de todas as lojas.
// O payload.data.company.federalTaxNumber identifica de qual loja é o evento.
//
// Todo evento é salvo BRUTO em integracao_evento antes de processar (mesmo
// padrão do ml-webhook): se o processamento falhar, nada se perde.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { montarPatchNota, podeAplicarStatusWebhook } from '../_shared/spedyConfig.ts';

export async function processar(evento: Record<string, unknown>, admin: ReturnType<typeof createClient>) {
  const data = (evento.data || {}) as Record<string, any>;
  // Parsing puro (testável) do evento → chave de busca + patch da nota
  const { invoiceId, patch } = montarPatchNota(evento);
  const cnpjEmissor = String(data.company?.federalTaxNumber || '');

  // Resolve a loja pelo CNPJ da empresa emissora (sub-empresa criada no provisionamento).
  // Só para o registro de auditoria (loja_id em integracao_evento) — o update
  // em nota_fiscal abaixo usa spedy_invoice_id, que já identifica a nota
  // certa mesmo se o CNPJ não bater com loja nenhuma cadastrada aqui.
  let lojaId: string | null = null;
  if (cnpjEmissor) {
    const { data: loja } = await admin
      .from('lojas')
      .select('id')
      .eq('cnpj', cnpjEmissor)
      .maybeSingle();
    lojaId = loja?.id || null;
  }

  const { data: registro } = await admin
    .from('integracao_evento')
    .insert({
      canal: 'spedy',
      topico: String(evento.event || ''),
      resource: invoiceId,
      loja_id: lojaId,
      payload: evento,
      processado: false,
    })
    .select('id')
    .single();

  const marcarEvento = (campos: Record<string, unknown>) =>
    registro?.id
      ? admin.from('integracao_evento').update(campos).eq('id', registro.id)
      : Promise.resolve();

  if (!invoiceId || !patch) {
    await marcarEvento({ erro_processamento: 'evento sem data.id' });
    return;
  }

  // Trava de evento fora de ordem: lê o status ATUAL da nota antes de
  // decidir se este evento pode sobrescrever (ver podeAplicarStatusWebhook).
  const { data: notaAtual } = await admin
    .from('nota_fiscal')
    .select('status')
    .eq('spedy_invoice_id', invoiceId)
    .maybeSingle();

  if (!podeAplicarStatusWebhook(notaAtual?.status, patch.status as string | undefined)) {
    await marcarEvento({
      processado: true,
      erro_processamento: `ignorado: evento fora de ordem (nota já está '${notaAtual?.status}', recebido '${patch.status}' depois)`,
    });
    return;
  }

  const { error } = await admin.from('nota_fiscal').update(patch).eq('spedy_invoice_id', invoiceId);
  await marcarEvento({ processado: !error, erro_processamento: error ? error.message : null });
}

// Guarda de import: este módulo é importado direto pelos testes vitest (para
// testar `processar` com um admin fake, sem tocar o Supabase real) — sem
// isso, `Deno.serve` executaria na hora do import e quebraria fora do Deno.
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return new Response('ok', { status: 200 });

    const tokenEsperado = Deno.env.get('SPEDY_WEBHOOK_TOKEN');
    if (tokenEsperado && new URL(req.url).searchParams.get('token') !== tokenEsperado) {
      return new Response('token inválido', { status: 401 });
    }

    const evento = await req.json().catch(() => null);
    if (evento?.data) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      EdgeRuntime.waitUntil(processar(evento, admin));
    }
    return new Response('ok', { status: 200 });
  });
}
