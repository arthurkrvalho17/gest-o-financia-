// Simula POSTs reais de invoice.status_changed no spedy-webhook e confirma
// o EFEITO em nota_fiscal — com um admin em memória (testFakeAdmin), sem
// tocar o Supabase real nem o Deno. `processar` é a mesma função que o
// handler HTTP chama em produção (só o `admin` é trocado pelo fake).
import { describe, it, expect } from 'vitest';
import { processar } from './index.ts';
import { criarAdminFake } from '../_shared/testFakeAdmin.ts';

const CNPJ_LOJA = '66146269000199';

function montarBase() {
  return criarAdminFake({
    lojas: [{ id: 'loja-1', cnpj: CNPJ_LOJA }],
    nota_fiscal: [{ id: 'nota-1', loja_id: 'loja-1', venda_id: 'venda-1', spedy_invoice_id: 'inv-abc-123', status: 'enqueued' }],
    integracao_evento: [],
  });
}

function eventoStatus(status: string, extra: Record<string, unknown> = {}) {
  return {
    event: 'invoice.status_changed',
    data: {
      id: 'inv-abc-123',
      status,
      company: { federalTaxNumber: CNPJ_LOJA },
      processingDetail: { status: status === 'authorized' ? 'ok' : 'failed', message: 'msg', code: '100' },
      ...extra,
    },
  };
}

describe('spedy-webhook processar() — efeito em nota_fiscal', () => {
  it('AUTORIZADA: grava status authorized e os campos do processingDetail', async () => {
    const admin = montarBase();
    await processar(eventoStatus('authorized', { number: 7, authorization: { protocol: '135240000000001' } }), admin as any);

    const nota = admin._db.nota_fiscal.find((n: any) => n.id === 'nota-1');
    expect(nota.status).toBe('authorized');
    expect(nota.number).toBe('7');
    expect(nota.protocolo).toBe('135240000000001');
    expect(nota.processing_status).toBe('ok');

    const evento = admin._db.integracao_evento[0];
    expect(evento.loja_id).toBe('loja-1');
    expect(evento.processado).toBe(true);
  });

  it('REJEITADA: grava status rejected e a mensagem/code da SEFAZ', async () => {
    const admin = montarBase();
    await processar(eventoStatus('rejected'), admin as any);

    const nota = admin._db.nota_fiscal.find((n: any) => n.id === 'nota-1');
    expect(nota.status).toBe('rejected');
    expect(nota.processing_status).toBe('failed');
    expect(nota.processing_code).toBe('100');
  });

  it('CNPJ sem loja correspondente: evento registrado com loja_id nulo, mas nota_fiscal ainda é atualizada (spedy_invoice_id já identifica a nota certa)', async () => {
    const admin = criarAdminFake({
      lojas: [{ id: 'loja-1', cnpj: CNPJ_LOJA }],
      nota_fiscal: [{ id: 'nota-1', loja_id: 'loja-1', venda_id: 'venda-1', spedy_invoice_id: 'inv-abc-123', status: 'enqueued' }],
      integracao_evento: [],
    });
    const evento = eventoStatus('authorized', { company: { federalTaxNumber: '00000000000000' } });
    await processar(evento, admin as any);

    expect(admin._db.integracao_evento[0].loja_id).toBeNull();
    expect(admin._db.nota_fiscal[0].status).toBe('authorized');
  });

  it('mesmo evento chegando duas vezes (retry da Spedy): nota_fiscal converge para o mesmo estado final', async () => {
    const admin = montarBase();
    const evento = eventoStatus('authorized', { number: 7 });
    await processar(evento, admin as any);
    await processar(evento, admin as any);

    expect(admin._db.nota_fiscal[0].status).toBe('authorized');
    // Duas entregas geram duas linhas de auditoria — não corrompe nota_fiscal.
    expect(admin._db.integracao_evento).toHaveLength(2);
    expect(admin._db.integracao_evento.every((e: any) => e.processado)).toBe(true);
  });

  it('evento FORA DE ORDEM (rejeitada chegando depois de autorizada): nota_fiscal mantém authorized', async () => {
    const admin = montarBase();
    await processar(eventoStatus('authorized', { number: 7 }), admin as any);
    await processar(eventoStatus('rejected'), admin as any); // retry atrasado de uma tentativa antiga

    const nota = admin._db.nota_fiscal[0];
    expect(nota.status).toBe('authorized'); // não regrediu
    const ultimoEvento = admin._db.integracao_evento.at(-1);
    expect(ultimoEvento.erro_processamento).toMatch(/fora de ordem/);
    expect(ultimoEvento.processado).toBe(true); // registrado, não é uma falha do webhook
  });

  it('evento sem data.id: registra o erro e não toca nota_fiscal', async () => {
    const admin = montarBase();
    await processar({ event: 'invoice.status_changed', data: { status: 'authorized' } }, admin as any);

    expect(admin._db.nota_fiscal[0].status).toBe('enqueued'); // intocado
    expect(admin._db.integracao_evento[0].erro_processamento).toMatch(/sem data\.id/);
  });
});
