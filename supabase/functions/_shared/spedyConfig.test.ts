// Testes da lógica pura da integração Spedy (payload de provisionamento,
// settings GET→altera→PUT e parsing do webhook). Tudo roda contra respostas
// SIMULADAS da Spedy — nenhum teste bate na Spedy real.
import { describe, it, expect } from 'vitest';
import {
  montarPayloadEmpresa,
  resolverInscricaoEstadual,
  resolverEnvironmentType,
  prepararBlocosConfiguracao,
  montarPatchNota,
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

  it('evento sem data.id não gera patch (o webhook registra o erro e não atualiza nada)', () => {
    expect(montarPatchNota({ data: { status: 'authorized' } })).toEqual({ invoiceId: '', patch: null });
    expect(montarPatchNota(null)).toEqual({ invoiceId: '', patch: null });
  });
});
