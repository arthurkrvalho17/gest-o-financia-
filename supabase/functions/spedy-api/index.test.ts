// Testa os guards de emitir() (Parte 2 — falhas que não podem derrubar a
// venda) com um admin em memória (testFakeAdmin) e o `fetch` global
// controlado. Nenhum teste aqui bate na Spedy real; `emitir()` é a MESMA
// função chamada em produção.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { emitir, certificado, configurarEmissao } from './index.ts';
import { criarAdminFake } from '../_shared/testFakeAdmin.ts';

const LOJA_ID = 'loja-1';
const VENDA_ID = 'venda-1';

// Rede sempre travada por padrão: um teste de guard que deveria bloquear
// ANTES de chamar a Spedy, mas que por bug não bloqueia, precisa quebrar
// alto e local — nunca vazar uma chamada de verdade para a internet.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('TESTE NÃO MOCKOU fetch — nenhuma chamada de rede é esperada aqui.');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as any).__SPEDY_TEST_ENV__;
});

function montarBase(overrides: {
  cred?: Record<string, unknown> | null;
  inscricao_estadual?: string | null;
  config_fiscal?: Record<string, unknown> | null;
  venda?: Record<string, unknown>;
} = {}) {
  const credPadrao = {
    id: 'cred-1',
    loja_id: LOJA_ID,
    canal: 'spedy',
    status: 'conectado',
    credenciais: {
      company_id: 'company-1',
      api_key: 'chave-da-loja',
      environment_type: 'development',
      certificado_expira_em: '2027-01-01T00:00:00Z', // certificado válido por padrão
    },
  };

  return criarAdminFake({
    vendas: [{
      id: VENDA_ID,
      loja_id: LOJA_ID,
      veiculo_id: 'veic-1',
      valor_venda: 62000,
      comprador_cpf: '52844196772',
      comprador_nome: 'Maria Souza',
      comprador_cep: '70000000',
      comprador_numero: '123',
      comprador_cidade_ibge: '5300108',
      forma_pagamento: 'financiamento',
      ...overrides.venda,
    }],
    veiculos: [{ id: 'veic-1', modelo: 'Onix', fab_mod: '2019/2020', placa: 'RLSTEST1' }],
    lojas: [{ id: LOJA_ID, inscricao_estadual: 'inscricao_estadual' in overrides ? overrides.inscricao_estadual : '1234567890' }],
    loja_config: [{
      loja_id: LOJA_ID,
      config_fiscal: 'config_fiscal' in overrides ? overrides.config_fiscal : { ncm: '87032310', cfop: 5102, icms: { origin: 0, csosn: 400 } },
    }],
    canal_credencial: overrides.cred === null ? [] : [{ ...credPadrao, ...overrides.cred }],
    nota_fiscal: [],
  });
}

function ultimaNota(admin: ReturnType<typeof criarAdminFake>) {
  return admin._db.nota_fiscal.find((n: any) => n.venda_id === VENDA_ID);
}

describe('emitir() — guards que bloqueiam ANTES de chamar a Spedy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loja sem certificado enviado: bloqueia com mensagem clara, nunca chama a Spedy', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase({ cred: { credenciais: { company_id: 'c1', api_key: 'k', environment_type: 'development' } } });

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(body.erro).toBe('certificado_invalido');
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(ultimaNota(admin).processing_message).toMatch(/ainda não foi enviado/);
  });

  it('loja com certificado VENCIDO: bloqueia com mensagem clara, nunca chama a Spedy', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase({
      cred: { credenciais: { company_id: 'c1', api_key: 'k', environment_type: 'development', certificado_expira_em: '2020-01-01T00:00:00Z' } },
    });

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(body.erro).toBe('certificado_invalido');
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(ultimaNota(admin).processing_message).toMatch(/vencido/);
  });

  it('loja sem Inscrição Estadual: bloqueia antes da chamada (o incidente real de 31/08)', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase({ inscricao_estadual: null });

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(body.erro).toBe('inscricao_estadual_ausente');
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(ultimaNota(admin).processing_message).toMatch(/Inscrição Estadual/);
  });

  it('config_fiscal ausente: bloqueia listando os campos que faltam', async () => {
    const admin = montarBase({ config_fiscal: null });

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(body.erro).toBe('config_fiscal_incompleto');
    expect(body.campos_faltando).toEqual(['ncm', 'cfop', 'icms']);
    expect(ultimaNota(admin).processing_message).toMatch(/faltam: ncm, cfop, icms/);
  });

  it('config_fiscal parcial: lista só o campo que falta (não trata o que já está certo)', async () => {
    const admin = montarBase({ config_fiscal: { cfop: 5102, icms: { origin: 0, csosn: 400 } } }); // sem ncm

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(body.campos_faltando).toEqual(['ncm']);
  });
});

describe('emitir() — Spedy fora do ar / timeout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetch rejeitado (rede fora do ar): venda permanece intacta, nota_fiscal grava a falha com motivo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED')));
    const admin = montarBase();

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(resp.status).toBe(200); // nunca propaga erro 500 pro chamador fire-and-forget
    expect(body.erro).toBe('spedy_indisponivel');
    const nota = ultimaNota(admin);
    expect(nota.processing_status).toBe('failed');
    expect(nota.processing_message).toMatch(/ECONNREFUSED/);
    expect(nota.processing_message).toMatch(/venda foi registrada normalmente/);
    // A venda em si nunca é tocada por emitir() — nenhuma tabela `vendas` é escrita aqui.
    expect(admin._db.vendas[0].id).toBe(VENDA_ID);
  });
});

describe('emitir() — idempotência (mesma venda emitindo duas vezes)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('duas chamadas de emitir() para a mesma venda resultam em UMA única nota_fiscal', async () => {
    let chamadas = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      chamadas += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'inv-xyz', status: 'enqueued', number: chamadas, processingDetail: { status: 'processing' } }),
      };
    }));
    const admin = montarBase();

    await emitir(admin as any, LOJA_ID, VENDA_ID);
    await emitir(admin as any, LOJA_ID, VENDA_ID);

    const notas = admin._db.nota_fiscal.filter((n: any) => n.venda_id === VENDA_ID);
    expect(notas).toHaveLength(1); // upsert por venda_id (unique constraint em nota_fiscal.venda_id)
    expect(notas[0].spedy_invoice_id).toBe('inv-xyz');
    expect(chamadas).toBe(2); // a Spedy foi chamada duas vezes — é ELA quem dedup por integrationId
  });
});

describe('certificado() — persistência da validade (sem guardar arquivo/senha)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sucesso: grava certificado_expira_em na credencial, nunca o arquivo nem a senha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ expirationAt: '2027-06-01T00:00:00Z', subject: 'FINANCIA MAIS VEICULOS', isActive: true }),
    }));
    (globalThis as any).__SPEDY_TEST_ENV__ = { SPEDY_OWNER_API_KEY: 'fake-owner-key' };
    const admin = criarAdminFake({
      canal_credencial: [{ id: 'cred-1', loja_id: LOJA_ID, canal: 'spedy', credenciais: { company_id: 'company-1', api_key: 'k' } }],
    });

    const resp = await certificado(admin as any, LOJA_ID, {
      fileBase64: btoa('conteudo-fake-do-pfx'),
      filename: 'cert.pfx',
      password: 'segredo123',
    });
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(body.expiraEm).toBe('2027-06-01T00:00:00Z');

    const credAtual = admin._db.canal_credencial[0].credenciais;
    expect(credAtual.certificado_expira_em).toBe('2027-06-01T00:00:00Z');
    expect(credAtual.certificado_titular).toBe('FINANCIA MAIS VEICULOS');
    expect(JSON.stringify(credAtual)).not.toMatch(/segredo123/);
    expect(JSON.stringify(credAtual)).not.toMatch(/conteudo-fake-do-pfx/);
  });
});

// ── Trava de ambiente: 'production' dentro do sandbox emite nota com
// validade fiscal REAL (o certificado A1 em uso é do CNPJ do próprio
// Arthur). Cobre as DUAS actions pedidas: 'configurar' e 'emitir'.
describe('trava de ambiente sandbox×production — action emitir', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('recusa emitir quando o ambiente é sandbox e a credencial diz production — nunca chama a Spedy', async () => {
    (globalThis as any).__SPEDY_TEST_ENV__ = { SPEDY_API_URL: 'https://sandbox-api.spedy.com.br/v1' };
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase({ cred: { credenciais: { company_id: 'c1', api_key: 'k', environment_type: 'production', certificado_expira_em: '2027-01-01T00:00:00Z' } } });

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(resp.status).toBe(409);
    expect(body.erro).toMatch(/SANDBOX/i);
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(ultimaNota(admin).processing_message).toMatch(/SANDBOX/i);
  });

  it('deixa passar quando o ambiente é sandbox e a credencial diz development (combinação coerente)', async () => {
    (globalThis as any).__SPEDY_TEST_ENV__ = { SPEDY_API_URL: 'https://sandbox-api.spedy.com.br/v1' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'inv-1', status: 'enqueued', processingDetail: { status: 'processing' } }),
    }));
    const admin = montarBase(); // environment_type: 'development' por padrão

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(body.ok).toBe(true);
  });

  it('achado 02/09/2026 — falha FECHADA quando environment_type nunca foi confirmado (loja conectada por fora de "configurar")', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    // Sem environment_type na credencial — cenário real que já aconteceu (ver cérebro/Gestão, 31/08).
    const admin = montarBase({ cred: { credenciais: { company_id: 'c1', api_key: 'k', certificado_expira_em: '2027-01-01T00:00:00Z' } } });

    const resp = await emitir(admin as any, LOJA_ID, VENDA_ID);
    const body = await resp.json();

    expect(body.erro).toBe('ambiente_nao_confirmado');
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(ultimaNota(admin).processing_message).toMatch(/rode a action "configurar"/);
  });
});

describe('trava de ambiente sandbox×production — action configurar', () => {
  afterEach(() => vi.unstubAllGlobals());

  function montarBaseConfigurar() {
    return criarAdminFake({
      canal_credencial: [{ id: 'cred-1', loja_id: LOJA_ID, canal: 'spedy', credenciais: { company_id: 'company-1' } }],
    });
  }

  it('recusa ANTES do PUT quando SPEDY_ENVIRONMENT_TYPE força production dentro do sandbox', async () => {
    (globalThis as any).__SPEDY_TEST_ENV__ = {
      SPEDY_OWNER_API_KEY: 'owner-key',
      SPEDY_API_URL: 'https://sandbox-api.spedy.com.br/v1',
      SPEDY_ENVIRONMENT_TYPE: 'production',
    };
    const fetchEspiao = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ productInvoice: {} }) });
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBaseConfigurar();

    const resultado = await configurarEmissao(admin as any, LOJA_ID);

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toMatch(/SANDBOX/i);
    // Só o GET inicial (lê as settings atuais) — o PUT que gravaria 'production' nunca roda.
    expect(fetchEspiao).toHaveBeenCalledTimes(1);
  });

  it('recusa quando a SPEDY CONFIRMA production no sandbox, mesmo pedindo development (2ª trava, pós-PUT)', async () => {
    (globalThis as any).__SPEDY_TEST_ENV__ = {
      SPEDY_OWNER_API_KEY: 'owner-key',
      SPEDY_API_URL: 'https://sandbox-api.spedy.com.br/v1',
    };
    // GET/PUT/GET de confirmação sempre devolvem 'production' — simula a Spedy
    // ignorando o 'development' pedido (ou um default dela fora do nosso controle).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ productInvoice: { environmentType: 'production', series: '1', nextNumber: 1 } }),
    }));
    const admin = montarBaseConfigurar();

    const resultado = await configurarEmissao(admin as any, LOJA_ID);

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toMatch(/SANDBOX/i);
    expect(resultado.erro).toMatch(/resposta da Spedy/i);
  });

  it('deixa passar quando o ambiente confirmado é coerente (sandbox → development)', async () => {
    (globalThis as any).__SPEDY_TEST_ENV__ = {
      SPEDY_OWNER_API_KEY: 'owner-key',
      SPEDY_API_URL: 'https://sandbox-api.spedy.com.br/v1',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ productInvoice: { environmentType: 'development', series: '1', nextNumber: 1 } }),
    }));
    const admin = montarBaseConfigurar();

    const resultado = await configurarEmissao(admin as any, LOJA_ID);

    expect(resultado.ok).toBe(true);
    expect(resultado.environmentType).toBe('development');
  });
});
