// Testes da lógica pura da integração Spedy (payload de provisionamento,
// settings GET→altera→PUT e parsing do webhook). Tudo roda contra respostas
// SIMULADAS da Spedy — nenhum teste bate na Spedy real.
import { describe, it, expect } from 'vitest';
import {
  montarPayloadEmpresa,
  resolverInscricaoEstadual,
  resolverEnvironmentType,
  garantirAmbienteCoerente,
  prepararBlocosConfiguracao,
  montarPatchNota,
  podeAplicarStatusWebhook,
  certificadoValido,
  camposFiscaisFaltando,
  mensagemFalhaRedeSpedy,
} from './spedyConfig';

const lojaBase = {
  nome: 'Loja Exemplo',
  cnpj: '12.345.678/0001-90',
  inscricao_estadual: '123.456.789',
  telefone: '(11) 98888-7777',
  logradouro: 'Rua Exemplo',
  numero: '123',
  bairro: 'Centro',
  cep: '01310-100',
  cidade_ibge: '3550308',
  cidade: 'São Paulo',
  uf: 'SP',
  regime_tributario: 'simplesNacional',
  cnae_principal: '4511101',
};

// ── Provisionamento ───────────────────────────────────────────────────

describe('montarPayloadEmpresa', () => {
  it('monta o payload da sub-empresa a partir do cadastro da loja', () => {
    const p = montarPayloadEmpresa(lojaBase, 'dono@loja.com');
    expect(p.federalTaxNumber).toBe('12345678000190');
    expect(p.stateTaxNumber).toBe('123456789'); // só dígitos
    expect(p.email).toBe('dono@loja.com');
    expect(p.phone).toBe('11988887777');
    expect(p.address.postalCode).toBe('01310100');
    expect(p.address.city).toEqual({ code: '3550308', name: 'São Paulo', state: 'SP' });
    expect(p.taxRegime).toBe('simplesNacional');
    expect(p.economicActivities).toEqual([{ code: '4511101', isMain: true }]);
  });

  it('loja isenta envia o literal ISENTO (qualquer caixa no cadastro)', () => {
    for (const declarado of ['ISENTO', 'isento', 'Isento']) {
      const p = montarPayloadEmpresa({ ...lojaBase, inscricao_estadual: declarado });
      expect(p.stateTaxNumber).toBe('ISENTO');
    }
  });

  it('bloqueia quando a IE não foi definida de forma nenhuma (sem default silencioso)', () => {
    for (const vazio of [null, undefined, '', '   ']) {
      expect(() => montarPayloadEmpresa({ ...lojaBase, inscricao_estadual: vazio })).toThrow(
        /Inscrição Estadual.*ISENTO/s,
      );
    }
  });

  it('bloqueia IE sem nenhum dígito (valor inválido, não silencia)', () => {
    expect(() => resolverInscricaoEstadual('abc')).toThrow(/inválida/);
  });

  it('bloqueia quando falta o CNPJ', () => {
    expect(() => montarPayloadEmpresa({ ...lojaBase, cnpj: null })).toThrow(/CNPJ/);
  });
});

// ── Settings: environmentType seguro por ambiente ─────────────────────

describe('resolverEnvironmentType', () => {
  it('sandbox default = development (NUNCA production); produção default = production', () => {
    expect(resolverEnvironmentType(true)).toBe('development');
    expect(resolverEnvironmentType(false)).toBe('production');
  });

  it('override explícito válido é respeitado; inválido cai no default seguro', () => {
    expect(resolverEnvironmentType(true, 'simulation')).toBe('simulation');
    expect(resolverEnvironmentType(false, 'development')).toBe('development');
    expect(resolverEnvironmentType(true, 'homologacao')).toBe('development'); // não é do enum
    expect(resolverEnvironmentType(true, '')).toBe('development');

    // TRAVA: 'production' dentro do sandbox e recusado, mesmo sendo do enum.
    // A doc da Spedy avisa que essa combinacao emite nota com validade
    // fiscal REAL a partir do ambiente de testes.
    expect(() => resolverEnvironmentType(true, 'production')).toThrow(/sandbox/i);
  });

  it('em producao, production continua valido', () => {
    expect(resolverEnvironmentType(false, 'production')).toBe('production');
  });
});

// ── Settings: GET → altera → PUT sem vazar campos ─────────────────────

describe('prepararBlocosConfiguracao', () => {
  const settingsAtuais = {
    general: {
      decimalPrecision: 2,
      allowDuplicateFederalTaxNumbers: false,
      technicalResponsible: { federalTaxNumber: '11111111000111', contactName: 'Já Configurado' },
    },
    productInvoice: {
      environmentType: 'production',
      series: '7',
      nextNumber: 42,
      danfePrintLayout: 'simplified',
    },
    consumerInvoice: { series: '1', nextNumber: 1 },
  };

  it('preserva os campos existentes de productInvoice e altera só o necessário', () => {
    const blocos = prepararBlocosConfiguracao(settingsAtuais, { environmentType: 'development' });
    expect(blocos.productInvoice).toEqual({
      environmentType: 'development', // alterado
      series: '7', // preservados — o PUT substitui o bloco; perdê-los quebraria a numeração
      nextNumber: 42,
      danfePrintLayout: 'simplified',
    });
  });

  it('só envia o bloco productInvoice quando não há responsável técnico (general fica intacto na Spedy)', () => {
    const blocos = prepararBlocosConfiguracao(settingsAtuais, { environmentType: 'development' });
    expect(Object.keys(blocos)).toEqual(['productInvoice']);
    expect(blocos.general).toBeUndefined();
  });

  it('empresa recém-criada (settings vazias) ganha série/numeração do exemplo da doc', () => {
    const blocos = prepararBlocosConfiguracao({}, { environmentType: 'development' });
    expect(blocos.productInvoice).toEqual({
      environmentType: 'development',
      series: '1',
      nextNumber: 1,
    });
  });

  it('com responsável técnico, envia general completo preservando os demais campos', () => {
    const respTec = { federalTaxNumber: '22222222000122', contactName: 'Financia+', email: 'ti@financia.com', phone: '11999990000' };
    const blocos = prepararBlocosConfiguracao(settingsAtuais, {
      environmentType: 'development',
      technicalResponsible: respTec,
    });
    expect(blocos.general).toEqual({
      decimalPrecision: 2, // preservado — omitir num PUT de general reverteria a default
      allowDuplicateFederalTaxNumbers: false,
      technicalResponsible: respTec, // substituído pelo novo, nunca omitido
    });
  });
});

// ── Webhook: invoice.status_changed → patch de nota_fiscal ────────────

describe('montarPatchNota', () => {
  const evento = {
    event: 'invoice.status_changed',
    data: {
      id: 'inv-abc-123',
      status: 'authorized',
      number: 42,
      company: { federalTaxNumber: '12345678000190' },
      authorization: { protocol: '135240000000001' },
      processingDetail: { status: 'ok', message: 'Autorizada', code: '100' },
    },
  };

  it('extrai o spedy_invoice_id (chave do update em nota_fiscal) e o patch completo', () => {
    const { invoiceId, patch } = montarPatchNota(evento);
    expect(invoiceId).toBe('inv-abc-123');
    expect(patch).toMatchObject({
      status: 'authorized',
      number: '42', // sempre string na nossa tabela
      protocolo: '135240000000001',
      processing_status: 'ok',
      processing_message: 'Autorizada',
      processing_code: '100',
    });
    expect(typeof patch?.atualizado_em).toBe('string');
  });

  it('campos ausentes não entram no patch (não sobrescreve com undefined)', () => {
    const { patch } = montarPatchNota({ data: { id: 'inv-1', status: 'rejected' } });
    expect(patch).not.toHaveProperty('number');
    expect(patch).not.toHaveProperty('protocolo');
    expect(patch).not.toHaveProperty('processing_status');
    expect(patch?.status).toBe('rejected');
  });

  it('caso REJEITADA completo — o patch que o webhook grava em nota_fiscal', () => {
    const eventoRejeitado = {
      event: 'invoice.status_changed',
      data: {
        id: 'inv-abc-123',
        status: 'rejected',
        company: { federalTaxNumber: '12345678000190' },
        processingDetail: { status: 'failed', message: 'Rejeicao: IE do emitente invalida', code: '209' },
      },
    };
    const { invoiceId, patch } = montarPatchNota(eventoRejeitado);
    expect(invoiceId).toBe('inv-abc-123');
    expect(patch).toMatchObject({
      status: 'rejected',
      processing_status: 'failed',
      processing_message: 'Rejeicao: IE do emitente invalida',
      processing_code: '209',
    });
    // Sem authorization.protocol no evento — não pode aparecer no patch.
    expect(patch).not.toHaveProperty('protocolo');
  });

  it('evento sem data.id não gera patch (o webhook registra o erro e não atualiza nada)', () => {
    expect(montarPatchNota({ data: { status: 'authorized' } })).toEqual({ invoiceId: '', patch: null });
    expect(montarPatchNota(null)).toEqual({ invoiceId: '', patch: null });
  });
});


describe('garantirAmbienteCoerente (trava sandbox x production)', () => {
  it('recusa production quando a URL aponta para o sandbox', () => {
    expect(() => garantirAmbienteCoerente(true, 'production', 'teste')).toThrow(/SANDBOX/);
  });

  it('menciona a origem no erro, para saber de onde veio o valor', () => {
    expect(() => garantirAmbienteCoerente(true, 'production', 'resposta da Spedy'))
      .toThrow(/resposta da Spedy/);
  });

  it('deixa passar as combinacoes legitimas', () => {
    expect(() => garantirAmbienteCoerente(true, 'development', 'teste')).not.toThrow();
    expect(() => garantirAmbienteCoerente(true, 'simulation', 'teste')).not.toThrow();
    expect(() => garantirAmbienteCoerente(false, 'production', 'teste')).not.toThrow();
    expect(() => garantirAmbienteCoerente(false, 'development', 'teste')).not.toThrow();
  });
});

// ── Webhook: trava de evento fora de ordem ─────────────────────────────

describe('podeAplicarStatusWebhook (trava de evento fora de ordem)', () => {
  it('permite a progressão normal do pipeline', () => {
    expect(podeAplicarStatusWebhook('created', 'enqueued')).toBe(true);
    expect(podeAplicarStatusWebhook('enqueued', 'received')).toBe(true);
    expect(podeAplicarStatusWebhook('received', 'authorized')).toBe(true);
    expect(podeAplicarStatusWebhook('received', 'rejected')).toBe(true);
  });

  it('bloqueia rejeitada chegando depois de autorizada — o caso do pedido', () => {
    expect(podeAplicarStatusWebhook('authorized', 'rejected')).toBe(false);
  });

  it('bloqueia autorizada chegando depois de rejeitada (mesma contradição, direção oposta)', () => {
    expect(podeAplicarStatusWebhook('rejected', 'authorized')).toBe(false);
  });

  it('bloqueia um estágio anterior do pipeline chegando depois de um terminal (retry atrasado)', () => {
    expect(podeAplicarStatusWebhook('authorized', 'enqueued')).toBe(false);
    expect(podeAplicarStatusWebhook('authorized', 'received')).toBe(false);
    expect(podeAplicarStatusWebhook('rejected', 'created')).toBe(false);
  });

  it('permite reenvio do mesmo status (idempotência — mesmo evento duas vezes)', () => {
    expect(podeAplicarStatusWebhook('authorized', 'authorized')).toBe(true);
    expect(podeAplicarStatusWebhook('rejected', 'rejected')).toBe(true);
  });

  it('permite transição administrativa legítima pós-autorização (cancelamento)', () => {
    expect(podeAplicarStatusWebhook('authorized', 'canceled')).toBe(true);
    expect(podeAplicarStatusWebhook('authorized', 'denied')).toBe(true);
  });

  it('sem status atual (nota nova / CNPJ sem loja correspondente) sempre aplica', () => {
    expect(podeAplicarStatusWebhook(null, 'authorized')).toBe(true);
    expect(podeAplicarStatusWebhook(undefined, 'enqueued')).toBe(true);
  });

  it('status desconhecido (fora do enum) nunca é bloqueado por excesso de zelo', () => {
    expect(podeAplicarStatusWebhook('authorized', 'algum_status_novo_da_spedy')).toBe(true);
  });
});

// ── Emissão: guardas de emitir() ────────────────────────────────────────

describe('certificadoValido', () => {
  it('bloqueia quando a loja nunca enviou certificado (credencial sem a marca de validade)', () => {
    const r = certificadoValido({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/ainda não foi enviado/);
  });

  it('bloqueia quando o certificado enviado está vencido', () => {
    const r = certificadoValido({ certificado_expira_em: '2020-01-01T00:00:00Z' }, '2026-08-31T00:00:00Z');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/vencido/);
  });

  it('passa quando o certificado está dentro da validade', () => {
    const r = certificadoValido({ certificado_expira_em: '2027-01-01T00:00:00Z' }, '2026-08-31T00:00:00Z');
    expect(r.ok).toBe(true);
  });
});

describe('camposFiscaisFaltando', () => {
  it('lista os três campos quando config_fiscal está ausente', () => {
    expect(camposFiscaisFaltando(null)).toEqual(['ncm', 'cfop', 'icms']);
    expect(camposFiscaisFaltando(undefined)).toEqual(['ncm', 'cfop', 'icms']);
  });

  it('lista só o que falta quando parcialmente preenchido', () => {
    expect(camposFiscaisFaltando({ ncm: '87032310', cfop: 5102 })).toEqual(['icms']);
    expect(camposFiscaisFaltando({ cfop: 5102, icms: { origin: 0, csosn: 400 } })).toEqual(['ncm']);
  });

  it('icms vazio ({}) conta como faltando, não como presente', () => {
    expect(camposFiscaisFaltando({ ncm: '87032310', cfop: 5102, icms: {} })).toEqual(['icms']);
  });

  it('completo não lista nada', () => {
    expect(camposFiscaisFaltando({ ncm: '87032310', cfop: 5102, icms: { origin: 0, csosn: 400 } })).toEqual([]);
  });
});

describe('mensagemFalhaRedeSpedy', () => {
  it('inclui o texto do erro original, sem inventar motivo', () => {
    const msg = mensagemFalhaRedeSpedy(new Error('fetch failed: ECONNREFUSED'));
    expect(msg).toMatch(/ECONNREFUSED/);
    expect(msg).toMatch(/venda foi registrada normalmente/);
  });

  it('não quebra com um valor que não é Error', () => {
    expect(() => mensagemFalhaRedeSpedy('timeout')).not.toThrow();
    expect(mensagemFalhaRedeSpedy('timeout')).toMatch(/timeout/);
  });
});
