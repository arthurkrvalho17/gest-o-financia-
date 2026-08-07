// Edge Function: recebe webhooks da Spedy (invoice.status_changed e afins).
// Deploy OBRIGATORIAMENTE com --no-verify-jwt (a Spedy não manda Authorization).
//
// Escopo do webhook é DE CONTA (Owner), não por empresa — um único webhook
// registrado uma vez (ver INTEGRACOES.md) recebe eventos de todas as lojas.
// O payload.data.company.federalTaxNumber identifica de qual loja é o evento.
//
// Todo evento é salvo BRUTO em integracao_evento antes de processar (mesmo
// padrão do ml-webhook): se o processamento falhar, nada se perde.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { montarPatchNota } from '../_shared/spedyConfig.ts';

async function processar(evento: Record<string, unknown>) {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const data = (evento.data || {}) as Record<string, any>;
  // Parsing puro (testável) do evento → chave de busca + patch da nota
  const { invoiceId, patch } = montarPatchNota(evento);
  const cnpjEmissor = String(data.company?.federalTaxNumber || '');

  // Resolve a loja pelo CNPJ da empresa emissora (sub-empresa criada no provisionamento).
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

  if (!invoiceId) {
    await marcarEvento({ erro_processamento: 'evento sem data.id' });
    return;
  }

  const { error } = await admin.from('nota_fiscal').update(patch!).eq('spedy_invoice_id', invoiceId);
  await marcarEvento({ processado: !error, erro_processamento: error ? error.message : null });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  const evento = await req.json().catch(() => null);
  if (evento?.data) {
    EdgeRuntime.waitUntil(processar(evento));
  }
  return new Response('ok', { status: 200 });
});
