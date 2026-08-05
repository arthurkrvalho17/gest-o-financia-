// Testes do conector OLX — payload, rejeição antecipada e parsing do retorno.
// A Edge Function olx-api é MOCKADA (supabase.functions.invoke): nenhum teste
// bate na OLX de verdade.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
  },
  supabaseConfigurado: true,
}));

import { supabase } from '../../lib/supabase';
import {
  conectorOlx,
  montarAdBody,
  conferirResposta,
  interpretarStatusImportacao,
} from './conectorOlx';
import { mapearParams } from './mapearCamposOlx';

const CEP = '01310100';
const TELEFONE = '11988887777';

const anuncioValido = () => ({
  veiculo_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  loja_id: 'loja-1',
  codigo: 'V-123',
  titulo: 'Onix LT 1.0',
  preco: 45900.75,
  ano: '2020/2021',
  cor: 'preto',
  placa: 'ABC-1234',
  km: 35000,
  combustivel: 'flex',
  descricao: 'Carro impecável, único dono, revisões em dia.',
  fotos: [
    { url: 'https://cdn.exemplo.com/1.jpg' },
    { url: 'https://cdn.exemplo.com/2.jpg' },
    { url: 'https://cdn.exemplo.com/1.jpg' }, // duplicada de propósito
  ],
});

// ── Montagem do payload ───────────────────────────────────────────────

describe('montarAdBody', () => {
  it('monta o ad com todos os obrigatórios no formato da doc', () => {
    const ad = montarAdBody(anuncioValido(), null, CEP, TELEFONE, {
      vehicle_brand: '1',
      vehicle_model: '10',
      vehicle_version: '100',
    });

    expect(ad.id).toBe('V-123');
    expect(ad.operation).toBe('insert');
    expect(ad.category).toBe(2020);
    expect(ad.type).toBe('s');
    expect(ad.price).toBe(45901); // inteiro, sem centavos
    expect(ad.zipcode).toBe(CEP);
    expect(ad.Phone).toBe(11988887777); // int, DDD+número
    expect(ad.images).toEqual([
      'https://cdn.exemplo.com/1.jpg',
      'https://cdn.exemplo.com/2.jpg', // deduplicadas, ordem preservada
    ]);
    // params é OBJETO com códigos string (exceto mileage, inteiro)
    expect(ad.params).toEqual({
      regdate: '2020',
      mileage: 35000,
      vehicle_tag: 'ABC1234',
      fuel: '3', // flex
      carcolor: '1', // preto
      vehicle_brand: '1',
      vehicle_model: '10',
      vehicle_version: '100',
    });
  });

  it('rejeita antes da API quando falta telefone da loja', () => {
    expect(() => montarAdBody(anuncioValido(), null, CEP, '')).toThrow(/telefone da loja/i);
    expect(() => montarAdBody(anuncioValido(), null, CEP, '119888')).toThrow(/telefone da loja/i);
  });

  it('rejeita antes da API quando falta CEP da loja', () => {
    expect(() => montarAdBody(anuncioValido(), null, '', TELEFONE)).toThrow(/CEP/);
    expect(() => montarAdBody(anuncioValido(), null, '013', TELEFONE)).toThrow(/CEP/);
  });

  it('rejeita antes da API quando não há fotos', () => {
    const semFotos = { ...anuncioValido(), fotos: [] };
    expect(() => montarAdBody(semFotos, null, CEP, TELEFONE)).toThrow(/foto/i);
  });

  it('rejeita preço zerado e descrição fora de 2..6000', () => {
    expect(() => montarAdBody({ ...anuncioValido(), preco: 0 }, null, CEP, TELEFONE)).toThrow(/valor pedido/i);
    expect(() => montarAdBody({ ...anuncioValido(), descricao: 'x' }, null, CEP, TELEFONE)).toThrow(/2 e 6000/);
    expect(() => montarAdBody({ ...anuncioValido(), descricao: 'x'.repeat(6001) }, null, CEP, TELEFONE)).toThrow(/2 e 6000/);
  });

  it('rejeita veículo sem placa (vehicle_tag é obrigatório)', () => {
    expect(() => montarAdBody({ ...anuncioValido(), placa: '' }, null, CEP, TELEFONE)).toThrow(/placa/i);
  });

  it('limita as fotos a 20', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => ({ url: `https://cdn.exemplo.com/${i}.jpg` }));
    const ad = montarAdBody({ ...anuncioValido(), fotos: muitas }, null, CEP, TELEFONE);
    expect(ad.images).toHaveLength(20);
  });
});

describe('mapearParams', () => {
  it('usa códigos string da doc e "10" (Outra) para cor desconhecida', () => {
    const params = mapearParams({ ano: '2019/2020', km: 1000, placa: 'abc 1d23', combustivel: 'Diesel', cor: 'Bordô' });
    expect(params).toEqual({
      regdate: '2019',
      mileage: 1000,
      vehicle_tag: 'ABC1D23',
      fuel: '5',
      carcolor: '10',
    });
  });
});

// ── Parsing do retorno do import ──────────────────────────────────────

describe('conferirResposta', () => {
  it('statusCode 0 passa adiante (com o token da importação)', () => {
    const resp = { statusCode: 0, statusMessage: 'ok', token: 'tok-123', errors: [] };
    expect(conferirResposta(resp)).toBe(resp);
  });

  it('-4 traduz o formato real de errors ({id, status, messages:[{category}]})', () => {
    const resp = {
      statusCode: -4,
      statusMessage: 'An ad had problems on import',
      errors: [
        {
          id: 'V-123',
          status: 'error',
          messages: [{ category: 'NO_IMAGE' }, { category: 'ERROR_VEHICLE_MODEL_INVALID' }],
        },
      ],
    };
    expect(() => conferirResposta(resp)).toThrow(/baixar as fotos.*Modelo não reconhecido/s);
  });

  it('-6 explica que plano de autônomo não tem API (precisa plano Empresa)', () => {
    expect(() => conferirResposta({ statusCode: -6 })).toThrow(/Essencial\/Plus.*plano Empresa/s);
  });

  it('-8 explica o limite parcial', () => {
    expect(() => conferirResposta({ statusCode: -8 })).toThrow(/parte dos anúncios/i);
  });
});

describe('interpretarStatusImportacao', () => {
  it('accepted vira publicado com a URL REAL da OLX', () => {
    const resp = {
      autoupload_status: 'done',
      ads: { 'V-123': { status: 'accepted', operation: 'insert', message: [], url: 'http://www.olx.com.br/vi/8000005.htm' } },
    };
    expect(interpretarStatusImportacao(resp, 'V-123')).toEqual({
      status: 'publicado',
      link_externo: 'http://www.olx.com.br/vi/8000005.htm',
    });
  });

  it('refused vira erro com o motivo', () => {
    const resp = {
      autoupload_status: 'done',
      ads: { 'V-123': { status: 'refused', operation: 'insert', message: [{ error: 'REFUSED_SUSPECT_PRICE' }] } },
    };
    const r = interpretarStatusImportacao(resp, 'V-123');
    expect(r.status).toBe('erro');
    expect(r.mensagem_erro).toMatch(/REFUSED_SUSPECT_PRICE/);
  });

  it('pending/queued seguem em processando', () => {
    const resp = { autoupload_status: 'pending', ads: { 'V-123': { status: 'queued', operation: 'insert', message: [] } } };
    expect(interpretarStatusImportacao(resp, 'V-123')).toEqual({ status: 'processando' });
  });
});

// ── Fluxo completo com a Edge Function mockada ────────────────────────

const CATALOGO = {
  '': { status: 'ok', data: { CHEVROLET: 1, FIAT: 2 } },
  '1': { status: 'ok', data: { ONIX: 10, PRISMA: 11 } },
  '1/10': { status: 'ok', data: { 'ONIX HATCH LT 1.0 8V FLEX 5P MEC': 100, 'ONIX HATCH LTZ 1.4 8V FLEX 5P AUT': 101 } },
};

function mockLojas(dados = { cep: '01310-100', telefone: '(11) 98888-7777' }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: dados }),
  };
  supabase.from.mockReturnValue(chain);
}

function mockInvoke(respostaImport) {
  supabase.functions.invoke.mockImplementation(async (_fn, { body }) => {
    if (body.acao === 'catalogo') {
      return { data: CATALOGO[(body.caminho || []).join('/')], error: null };
    }
    return { data: respostaImport, error: null };
  });
}

describe('conectorOlx.publicar (Edge Function mockada)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('statusCode 0 vira processando com token — sem link fake', async () => {
    mockLojas();
    mockInvoke({ statusCode: 0, statusMessage: 'The ads were imported and will be processed', token: 'tok-abc' });

    const res = await conectorOlx.publicar(anuncioValido());

    expect(res).toEqual({ ok: true, status: 'processando', id_externo: 'V-123', token: 'tok-abc' });
    expect(res.link_externo).toBeUndefined();

    // o ad enviado tem os IDs do catálogo resolvidos
    const chamadaPublicar = supabase.functions.invoke.mock.calls.find(([, { body }]) => body.acao === 'publicar');
    expect(chamadaPublicar[1].body.ad.params).toMatchObject({
      vehicle_brand: '1',
      vehicle_model: '10',
      vehicle_version: '100',
    });
  });

  it('bloqueia antes da API quando o modelo não existe no catálogo', async () => {
    mockLojas();
    mockInvoke({ statusCode: 0, token: 'nunca-usado' });

    const res = await conectorOlx.publicar({ ...anuncioValido(), titulo: 'Fusca Itamar 1.6' });

    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/não encontrad[oa] no catálogo da OLX/i);
    // nenhuma chamada de publicação chegou a sair
    const publicou = supabase.functions.invoke.mock.calls.some(([, { body }]) => body.acao === 'publicar');
    expect(publicou).toBe(false);
  });

  it('bloqueia antes da API quando falta telefone da loja', async () => {
    mockLojas({ cep: '01310-100', telefone: '' });
    mockInvoke({ statusCode: 0, token: 'nunca-usado' });

    const res = await conectorOlx.publicar(anuncioValido());

    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/telefone da loja/i);
    const publicou = supabase.functions.invoke.mock.calls.some(([, { body }]) => body.acao === 'publicar');
    expect(publicou).toBe(false);
  });

  it('statusCode -4 devolve erro traduzido por categoria', async () => {
    mockLojas();
    mockInvoke({
      statusCode: -4,
      statusMessage: 'An ad had problems on import',
      errors: [{ id: 'V-123', status: 'error', messages: [{ category: 'NO_REGION' }] }],
    });

    const res = await conectorOlx.publicar(anuncioValido());
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/CEP/);
  });

  it('statusCode -6 devolve o erro de plano', async () => {
    mockLojas();
    mockInvoke({ statusCode: -6, statusMessage: 'Without permission' });

    const res = await conectorOlx.publicar(anuncioValido());
    expect(res.ok).toBe(false);
    expect(res.erro).toMatch(/plano Empresa/);
  });
});

describe('conectorOlx.consultarStatus (Edge Function mockada)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirma publicado pelo token de importação e grava a URL real', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        autoupload_status: 'done',
        ads: { 'V-123': { status: 'accepted', operation: 'insert', message: [], url: 'http://www.olx.com.br/vi/123.htm' } },
      },
      error: null,
    });

    const r = await conectorOlx.consultarStatus({ id_externo: 'V-123', token_importacao: 'tok-abc', status: 'processando' });
    expect(r).toEqual({ status: 'publicado', link_externo: 'http://www.olx.com.br/vi/123.htm' });
  });

  it('cai para a listagem de publicados quando o token expirou (404)', async () => {
    supabase.functions.invoke.mockImplementation(async (_fn, { body }) => {
      if (body.acao === 'status_importacao') {
        return { data: null, error: Object.assign(new Error('404'), { context: { json: async () => ({ erro: 'não encontrado' }) } }) };
      }
      return {
        data: { data: [{ id: 'V-123', list_id: '129989', status: 'published' }], next_token: null },
        error: null,
      };
    });

    const r = await conectorOlx.consultarStatus({ id_externo: 'V-123', token_importacao: 'tok-velho', status: 'processando' });
    expect(r.status).toBe('publicado');
  });
});
