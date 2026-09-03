// Testes do handler `renave-api` com um admin em memória (testFakeAdmin) e o
// `fetch` global controlado. As funções exercitadas são as MESMAS chamadas em
// produção.
//
// ⚠️ NENHUM teste aqui faz request de verdade — e não é só disciplina: a
// Renave Fácil não tem sandbox, então uma chamada vazada daqui seria um envio
// REAL de dado cadastral. Por isso o `fetch` padrão de cada teste EXPLODE: um
// guard que deveria bloquear e não bloqueia quebra alto e local.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  baixarDocumento,
  consultarStatus,
  despachar,
  enviarNfe,
  sincronizarCliente,
  sincronizarVeiculo,
} from './index.ts';
import { criarAdminFake } from '../_shared/testFakeAdmin.ts';

const LOJA_ID = 'loja-1';
const OUTRA_LOJA = 'loja-2';
const VEICULO_ID = 'veic-1';
const VEICULO_DE_OUTRA_LOJA = 'veic-2';
const CNPJ_DA_LOJA = '12345678000199';
const CHAVE_PARCEIRO = 'chave-de-parceiro-fake';

beforeEach(() => {
  (globalThis as any).__RENAVE_TEST_ENV__ = { RENAVE_PARTNER_API_KEY: CHAVE_PARCEIRO };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('TESTE NÃO MOCKOU fetch — nenhuma chamada de rede é esperada aqui.');
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as any).__RENAVE_TEST_ENV__;
});

function respostaFake(status: number, corpo: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(corpo),
  };
}

// Mocka o fetch e devolve a lista de chamadas [url, init] para inspeção.
function mockarFetch(responder: (url: string, init: any) => any) {
  const chamadas: Array<{ url: string; init: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: any) => {
      chamadas.push({ url: String(url), init });
      return responder(String(url), init);
    }),
  );
  return chamadas;
}

const VEICULO_COMPLETO = {
  id: VEICULO_ID,
  loja_id: LOJA_ID,
  modelo: 'Onix',
  descricao: 'Onix LT 1.0',
  chassi: '9BWZZZ377VT004251',
  renavam: '12345678901',
  placa: 'ABC1D23',
  ano_fabricacao: 2019,
  ano_modelo: 2020,
  codigo_fipe: '004445-0',
  chave_nfe_compra: '35260866146269000000000000000000000000000001',
  vendedor_origem_nome: 'João da Silva',
  vendedor_origem_cpf_cnpj: '52844196772',
  vendedor_origem_cep: '70000000',
  vendedor_origem_logradouro: 'Rua das Flores',
  vendedor_origem_numero: '123',
  vendedor_origem_bairro: 'Centro',
  vendedor_origem_cidade: 'Brasília',
  vendedor_origem_uf: 'DF',
};

function montarBase(overrides: { veiculo?: Record<string, unknown>; extras?: Record<string, any[]> } = {}) {
  return criarAdminFake({
    lojas: [
      { id: LOJA_ID, cnpj: '12.345.678/0001-99' },
      { id: OUTRA_LOJA, cnpj: '99.999.999/0001-99' },
    ],
    veiculos: [
      { ...VEICULO_COMPLETO, ...overrides.veiculo },
      { id: VEICULO_DE_OUTRA_LOJA, loja_id: OUTRA_LOJA, modelo: 'Gol', chassi: '9BWAAA377VT000002' },
    ],
    veiculo_valor_compra: [{ veiculo_id: VEICULO_ID, loja_id: LOJA_ID, compra: 62000 }],
    renave_registro: [],
    ...overrides.extras,
  });
}

function registro(admin: ReturnType<typeof criarAdminFake>, evento = 'entrada') {
  return admin._db.renave_registro.find((r: any) => r.veiculo_id === VEICULO_ID && r.evento === evento);
}

// ── Guard anti-envio-em-massa (a doc proíbe envio em massa) ───────────────

describe('guard anti-envio-em-massa: nada acontece sem veiculo_id', () => {
  const ACOES = [
    'sincronizar_cliente',
    'sincronizar_veiculo',
    'enviar_nfe_compra',
    'enviar_nfe_venda',
    'enviar_nfe_transferencia',
    'consultar_status',
    'baixar_documento',
  ];

  it.each(ACOES)('%s sem veiculo_id devolve 400 e NUNCA chama a Renave Fácil', async (action) => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase();

    const resp = await despachar(admin as any, LOJA_ID, { action, tipo: 'crlve' });
    const body = await resp.json();

    expect(resp.status).toBe(400);
    expect(body.erro).toMatch(/veiculo_id/);
    expect(body.mensagem).toMatch(/envio em massa/);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('não existe forma de pedir "o estoque inteiro": sem veiculo_id não há caminho nenhum', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase();

    // Tentativas plausíveis de contornar o guard.
    for (const body of [
      { action: 'sincronizar_veiculo', todos: true },
      { action: 'sincronizar_veiculo', veiculo_id: '' },
      { action: 'sincronizar_veiculo', veiculo_id: null },
      { action: 'consultar_status', placa: 'ABC1D23' }, // placa no body não substitui o veiculo_id
    ]) {
      const resp = await despachar(admin as any, LOJA_ID, body);
      expect(resp.status).toBe(400);
    }
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});

// ── Regra 1: loja_id do JWT, nunca do body ────────────────────────────────

describe('loja_id vem do JWT — o body não tem voz sobre isso', () => {
  it('veículo de OUTRA loja não existe para esta chamada (404), mesmo com service role', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase();

    const resp = await despachar(admin as any, LOJA_ID, {
      action: 'sincronizar_veiculo',
      veiculo_id: VEICULO_DE_OUTRA_LOJA,
    });

    expect(resp.status).toBe(404);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('loja_id enviado no body é ignorado: não muda o veículo alcançável nem o CNPJ usado', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = montarBase();

    // Body tentando operar como a outra loja, com o CNPJ dela junto.
    const resp = await despachar(admin as any, LOJA_ID, {
      action: 'sincronizar_veiculo',
      veiculo_id: VEICULO_ID,
      loja_id: OUTRA_LOJA,
      cnpj: '99999999000199',
      cnpjEstabelecimento: '99999999000199',
    });

    expect(resp.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toContain(`/dms/${CNPJ_DA_LOJA}/vehicle`);
    expect(chamadas[0].url).not.toContain('99999999000199');
    expect(registro(admin)!.loja_id).toBe(LOJA_ID);
  });
});

// ── Regra 2: cnpjEstabelecimento sai de `lojas` ───────────────────────────

describe('cnpjEstabelecimento vem da tabela lojas', () => {
  it('usa o CNPJ da loja do JWT, só com dígitos, em todas as rotas', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { situacaoEstoqueRenave: 'C', documentosDisponiveis: {} }));
    const admin = montarBase();

    await consultarStatus(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });

    expect(chamadas[0].url).toContain(`/renave/${CNPJ_DA_LOJA}/docs/status`);
  });

  it('loja sem CNPJ cadastrado: 409 com mensagem acionável, sem chamar a integradora', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = criarAdminFake({
      lojas: [{ id: LOJA_ID, cnpj: null }],
      veiculos: [VEICULO_COMPLETO],
      renave_registro: [],
    });

    const resp = await sincronizarVeiculo(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(409);
    expect(body.erro).toMatch(/CNPJ/);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});

// ── Regra 3: apiKey só do secret ──────────────────────────────────────────

describe('credencial: só do secret RENAVE_PARTNER_API_KEY', () => {
  it('manda Authorization: Bearer <apiKey do secret>', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = montarBase();

    await sincronizarVeiculo(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });

    expect(chamadas[0].init.headers.Authorization).toBe(`Bearer ${CHAVE_PARCEIRO}`);
  });

  it('secret ausente: 500 e nenhuma chamada (não cai para chave do body nem de canal_credencial)', async () => {
    (globalThis as any).__RENAVE_TEST_ENV__ = {};
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = criarAdminFake({
      lojas: [{ id: LOJA_ID, cnpj: '12.345.678/0001-99' }],
      veiculos: [VEICULO_COMPLETO],
      // Chave plantada onde ela NUNCA pode ser lida (canal_credencial é
      // legível pelo browser via RLS).
      canal_credencial: [{ loja_id: LOJA_ID, canal: 'renave', credenciais: { api_key: 'chave-que-nao-pode-ser-usada' } }],
      renave_registro: [],
    });

    const resp = await sincronizarVeiculo(admin as any, LOJA_ID, {
      veiculo_id: VEICULO_ID,
      apiKey: 'chave-vinda-do-front',
    });
    const body = await resp.json();

    expect(resp.status).toBe(500);
    expect(body.erro).toMatch(/RENAVE_PARTNER_API_KEY/);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});

// ── Regra 4: validação antes de enviar a NF-e de compra ───────────────────

describe('enviar_nfe_compra — valida tudo antes, nomeando o que falta', () => {
  it('faltando chassi/renavam/anos e vendedor de origem: 400 nomeando os campos, sem chamar a Renave Fácil', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase({
      veiculo: {
        renavam: null,
        ano_fabricacao: null,
        vendedor_origem_cpf_cnpj: null,
        vendedor_origem_cep: null,
      },
    });

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(400);
    expect(body.erro).toBe('campos_obrigatorios_faltando');
    expect(body.campos_faltando).toEqual(
      expect.arrayContaining(['renavam', 'ano_fabricacao', 'vendedor_origem_cpf_cnpj', 'vendedor_origem_cep']),
    );
    expect(body.mensagem).toMatch(/RENAVAM/);
    expect(body.mensagem).toMatch(/ano de fabricação/);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('sem valor de compra registrado: também bloqueia (nota de compra sem valor não existe)', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = criarAdminFake({
      lojas: [{ id: LOJA_ID, cnpj: '12.345.678/0001-99' }],
      veiculos: [VEICULO_COMPLETO],
      veiculo_valor_compra: [], // valor nunca preenchido
      renave_registro: [],
    });

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(body.campos_faltando).toContain('valor_compra');
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('cadastro completo: envia o payload certo e grava a auditoria', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { protocolo: 'PROTO-123', mensagem: 'ok' }));
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe(
      `https://api.renavefacil.net/v2/integration/dms/${CNPJ_DA_LOJA}/vehicle/nfe/purchase`,
    );

    const enviado = JSON.parse(chamadas[0].init.body);
    expect(enviado.chassi).toBe('9BWZZZ377VT004251');
    expect(enviado.chaveNfe).toBe(VEICULO_COMPLETO.chave_nfe_compra);
    expect(enviado.cpfCnpj).toBe('52844196772'); // do VENDEDOR de origem
    expect(enviado.valor).toBe(62000); // de veiculo_valor_compra (0026)
    expect(enviado.tipoVeiculo).toBe('U');

    // Regra 2: dtHrProcesso é o momento do envio, não a entrada no estoque.
    expect(enviado.dtHrProcesso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(body.dt_hr_processo).toBe(enviado.dtHrProcesso);

    // Regra 5: resposta bruta da integradora em renave_registro.dados.
    const reg = registro(admin)!;
    expect(reg.dados.enviar_nfe_compra.resposta).toEqual({ protocolo: 'PROTO-123', mensagem: 'ok' });
    expect(reg.dados.enviar_nfe_compra.status_http).toBe(200);
    expect(reg.chave_nfe).toBe(VEICULO_COMPLETO.chave_nfe_compra);
    expect(reg.protocolo).toBe('PROTO-123');
    expect(reg.evento).toBe('entrada');
  });

  it('dtHrProcesso NÃO é a data de entrada do veículo no estoque', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, {}));
    const admin = montarBase({ veiculo: { entrada: '2024-01-15' } });

    await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });

    const enviado = JSON.parse(chamadas[0].init.body);
    expect(enviado.dtHrProcesso).not.toContain('2024-01-15');
    expect(enviado.dtHrProcesso.slice(0, 4)).toBe(String(new Date().getFullYear()));
  });
});

// ── Regra 1 do comportamento: 404 = veículo não cadastrado lá ─────────────

describe('404 no envio da chave: cadastra o veículo e refaz UMA vez', () => {
  it('sucesso na segunda tentativa — exatamente 3 chamadas, na ordem certa', async () => {
    let nfe = 0;
    const chamadas = mockarFetch((url) => {
      if (url.includes('/vehicle/nfe/')) {
        nfe += 1;
        return nfe === 1 ? respostaFake(404, { erro: 'vehicle not found' }) : respostaFake(200, { ok: true });
      }
      return respostaFake(200, { ok: true }); // cadastro do veículo
    });
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.recadastrou_veiculo).toBe(true);
    expect(chamadas).toHaveLength(3);
    expect(chamadas[0].url).toContain('/vehicle/nfe/purchase');
    expect(chamadas[1].url).toBe(`https://api.renavefacil.net/v2/integration/dms/${CNPJ_DA_LOJA}/vehicle`);
    expect(chamadas[2].url).toContain('/vehicle/nfe/purchase');

    // As duas respostas ficam na auditoria — o cadastro e o reenvio.
    const reg = registro(admin)!;
    expect(reg.dados).toHaveProperty('sincronizar_veiculo');
    expect(reg.dados).toHaveProperty('enviar_nfe_compra');
  });

  it('404 DE NOVO depois de cadastrar: para com erro claro, NUNCA uma terceira tentativa', async () => {
    const chamadas = mockarFetch((url) =>
      url.includes('/vehicle/nfe/') ? respostaFake(404, { erro: 'vehicle not found' }) : respostaFake(200, { ok: true }),
    );
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(409);
    expect(body.erro).toBe('veiculo_nao_cadastrado');
    expect(body.mensagem).toMatch(/mesmo depois de cadastrá-lo/);
    expect(body.mensagem).toMatch(/9BWZZZ377VT004251/);
    expect(chamadas).toHaveLength(3); // nfe → vehicle → nfe. E para.
    expect(registro(admin)!.status).toBe('erro');
  });

  it('se o CADASTRO falhar no meio do caminho, o erro diz isso e a chave não é reenviada', async () => {
    const chamadas = mockarFetch((url) =>
      url.includes('/vehicle/nfe/')
        ? respostaFake(404, { erro: 'vehicle not found' })
        : respostaFake(422, { mensagem: 'chassi inválido' }),
    );
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(chamadas).toHaveLength(2); // nfe → vehicle (falhou). Sem reenvio.
    expect(body.erro).toMatch(/cadastro automático falhou/);
    expect(body.erro).toMatch(/chassi inválido/);
  });

  it('erro que NÃO é 404 não dispara recadastro — só reporta', async () => {
    const chamadas = mockarFetch(() => respostaFake(500, { mensagem: 'falha interna' }));
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(chamadas).toHaveLength(1);
    expect(body.erro).toMatch(/falha interna/);
    expect(body.recadastrou_veiculo).toBe(false);
  });
});

// ── enviar_nfe_venda ──────────────────────────────────────────────────────

describe('enviar_nfe_venda — a chave vem da nota que a Spedy já autorizou', () => {
  function baseComVenda(extras: { nota?: Record<string, unknown> | null; vendas?: any[] } = {}) {
    return montarBase({
      extras: {
        vendas: extras.vendas ?? [
          {
            id: 'venda-1',
            loja_id: LOJA_ID,
            veiculo_id: VEICULO_ID,
            valor_venda: 71000,
            data_venda: '2026-09-01',
            comprador_cpf: '52844196772',
          },
        ],
        nota_fiscal:
          extras.nota === null
            ? []
            : [{ id: 'nf-1', loja_id: LOJA_ID, venda_id: 'venda-1', access_key: '3'.repeat(44), status: 'authorized', ...extras.nota }],
      },
    });
  }

  it('usa access_key da nota_fiscal, CPF do comprador e valor da venda', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = baseComVenda();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_venda', { veiculo_id: VEICULO_ID });

    expect(resp.status).toBe(200);
    expect(chamadas[0].url).toContain('/vehicle/nfe/sales');
    const enviado = JSON.parse(chamadas[0].init.body);
    expect(enviado.chaveNfe).toBe('3'.repeat(44));
    expect(enviado.cpfCnpj).toBe('52844196772');
    expect(enviado.valor).toBe(71000);
    // Venda grava no eixo de SAÍDA, não no de entrada.
    expect(registro(admin, 'saida')).toBeTruthy();
    expect(registro(admin, 'entrada')).toBeUndefined();
  });

  it('nota ainda não autorizada (sem access_key): 400 dizendo qual campo falta, sem chamada', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = baseComVenda({ nota: { access_key: null } });

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_venda', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(400);
    expect(body.campos_faltando).toContain('chave da NF-e de venda (a nota ainda não foi autorizada)');
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('veículo vendido duas vezes (voltou ao estoque): usa a venda MAIS RECENTE, não estoura', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = montarBase({
      extras: {
        vendas: [
          { id: 'venda-antiga', loja_id: LOJA_ID, veiculo_id: VEICULO_ID, valor_venda: 60000, data_venda: '2025-01-10', comprador_cpf: '11111111111' },
          { id: 'venda-1', loja_id: LOJA_ID, veiculo_id: VEICULO_ID, valor_venda: 71000, data_venda: '2026-09-01', comprador_cpf: '52844196772' },
        ],
        nota_fiscal: [{ id: 'nf-1', loja_id: LOJA_ID, venda_id: 'venda-1', access_key: '3'.repeat(44), status: 'authorized' }],
      },
    });

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_venda', { veiculo_id: VEICULO_ID });

    expect(resp.status).toBe(200);
    expect(JSON.parse(chamadas[0].init.body).valor).toBe(71000);
  });
});

// ── enviar_nfe_transferencia ──────────────────────────────────────────────

describe('enviar_nfe_transferencia — sem modelo no banco, os dados vêm do body e são validados', () => {
  it('body incompleto: 400 nomeando o que falta, sem chamada', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_transferencia', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(400);
    expect(body.campos_faltando).toEqual(
      expect.arrayContaining(['chave da NF-e de transferência', 'CPF/CNPJ do estabelecimento de destino', 'valor da transferência']),
    );
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('body completo: envia para a rota transfer', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_transferencia', {
      veiculo_id: VEICULO_ID,
      chaveNfe: '4'.repeat(44),
      cpfCnpj: '99999999000199',
      valor: 55000,
    });

    expect(resp.status).toBe(200);
    expect(chamadas[0].url).toContain('/vehicle/nfe/transfer');
  });
});

// ── consultar_status ──────────────────────────────────────────────────────

describe('consultar_status', () => {
  it('grava situacao, documentos_disponiveis e consultado_em em renave_registro', async () => {
    const chamadas = mockarFetch(() =>
      respostaFake(200, {
        situacaoEstoqueRenave: 'C',
        documentosDisponiveis: { crlv: true, atpvEntrada: false },
        chassi: '9BWZZZ377VT004251',
      }),
    );
    const admin = montarBase();

    const resp = await consultarStatus(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    // placa e renavam saem do BANCO, não do body.
    expect(chamadas[0].url).toContain('placa=ABC1D23');
    expect(chamadas[0].url).toContain('renavam=12345678901');

    expect(body.situacaoEstoqueRenave).toBe('C');
    const reg = registro(admin)!;
    expect(reg.situacao).toBe('C');
    expect(reg.documentos_disponiveis).toEqual({ crlv: true, atpvEntrada: false });
    expect(reg.consultado_em).toBeTruthy();
    expect(reg.dados.consultar_status.resposta.situacaoEstoqueRenave).toBe('C');
  });

  it("situação vazia ('' = sem processo aberto) é gravada como '', não vira erro", async () => {
    mockarFetch(() => respostaFake(200, { situacaoEstoqueRenave: '', documentosDisponiveis: {} }));
    const admin = montarBase();

    const resp = await consultarStatus(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(body.situacaoEstoqueRenave).toBe('');
    expect(registro(admin)!.situacao).toBe('');
  });

  it('código não documentado não é gravado em `situacao` (o CHECK da 0029 recusaria) mas fica na auditoria', async () => {
    mockarFetch(() => respostaFake(200, { situacaoEstoqueRenave: 'Z', documentosDisponiveis: {} }));
    const admin = montarBase();

    await consultarStatus(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });

    const reg = registro(admin)!;
    expect(reg.situacao).toBeUndefined();
    expect(reg.dados.consultar_status.resposta.situacaoEstoqueRenave).toBe('Z');
  });

  it('veículo sem placa e sem renavam: 400 antes de qualquer chamada', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase({ veiculo: { placa: null, renavam: null } });

    const resp = await consultarStatus(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(400);
    expect(body.campos_faltando).toEqual(['placa', 'renavam']);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});

// ── baixar_documento ──────────────────────────────────────────────────────

describe('baixar_documento', () => {
  it('tipo desconhecido: 400 sem montar URL inventada', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase();

    const resp = await baixarDocumento(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID, tipo: 'crv_papel' });

    expect(resp.status).toBe(400);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('ATPV-e de entrada: chama a rota certa e espelha a URL em atpv_e_url', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { url: 'https://docs.renavefacil.net/atpve/abc.pdf' }));
    const admin = montarBase();

    const resp = await baixarDocumento(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID, tipo: 'atpve_entrada' });
    const body = await resp.json();

    expect(chamadas[0].url).toContain(`/renave/${CNPJ_DA_LOJA}/docs/atpve/entrada`);
    expect(body.url).toBe('https://docs.renavefacil.net/atpve/abc.pdf');
    expect(registro(admin, 'entrada')!.atpv_e_url).toBe('https://docs.renavefacil.net/atpve/abc.pdf');
  });

  it('ATPV-e de saída grava no evento de saída (renave_registro é único por veiculo × evento)', async () => {
    mockarFetch(() => respostaFake(200, { url: 'https://docs.renavefacil.net/atpve/saida.pdf' }));
    const admin = montarBase();

    await baixarDocumento(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID, tipo: 'atpve_saida' });

    expect(registro(admin, 'saida')).toBeTruthy();
    expect(registro(admin, 'entrada')).toBeUndefined();
  });

  it('CRLV-e não é ATPV-e: não polui a coluna atpv_e_url', async () => {
    mockarFetch(() => respostaFake(200, { url: 'https://docs.renavefacil.net/crlve/abc.pdf' }));
    const admin = montarBase();

    await baixarDocumento(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID, tipo: 'crlve' });

    expect(registro(admin)!.atpv_e_url).toBeUndefined();
  });
});

// ── sincronizar_cliente ───────────────────────────────────────────────────

describe('sincronizar_cliente', () => {
  it('monta o cliente a partir do vendedor de origem do BANCO, não do body', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = montarBase();

    await sincronizarCliente(admin as any, LOJA_ID, {
      veiculo_id: VEICULO_ID,
      dados: { razaoSocial: 'NOME FORJADO PELO FRONT', cpfCnpj: '00000000000' },
    });

    const enviado = JSON.parse(chamadas[0].init.body);
    expect(enviado.razaoSocial).toBe('João da Silva');
    expect(enviado.cpfCnpj).toBe('52844196772');
    expect(JSON.stringify(enviado)).not.toContain('FORJADO');
  });

  it('vendedor de origem incompleto: 400 nomeando os campos, sem chamada', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase({ veiculo: { vendedor_origem_cidade: null, vendedor_origem_uf: null } });

    const resp = await sincronizarCliente(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(400);
    expect(body.campos_faltando).toEqual(['vendedor_origem_cidade', 'vendedor_origem_uf']);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('atualizar: true usa PUT com o cpfCnpj no caminho', async () => {
    const chamadas = mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = montarBase();

    await sincronizarCliente(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID, atualizar: true });

    expect(chamadas[0].init.method).toBe('PUT');
    expect(chamadas[0].url).toContain(`/dms/${CNPJ_DA_LOJA}/client/52844196772`);
  });
});

// ── Falha de rede ─────────────────────────────────────────────────────────

describe('Renave Fácil fora do ar', () => {
  it('fetch rejeitado: grava a falha na auditoria e devolve erro tratado (não estoura)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED')));
    const admin = montarBase();

    const resp = await sincronizarVeiculo(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(502);
    expect(body.erro).toMatch(/ECONNREFUSED/);
    const reg = registro(admin)!;
    expect(reg.status).toBe('erro');
    expect(reg.dados.sincronizar_veiculo.status_http).toBe(0);
    expect(reg.mensagem_erro).toMatch(/ECONNREFUSED/);
  });
});

// ── Vocabulário (quem dispara o processo legal não é o Financia+) ─────────

describe('vocabulário: "enviado à Renave Fácil", nunca "registrado no RENAVE"', () => {
  it('nenhuma resposta de sucesso ou de erro afirma registro no RENAVE', async () => {
    const cenarios: Array<() => Promise<Response>> = [];
    const admin = montarBase();

    mockarFetch(() => respostaFake(200, { ok: true }));
    cenarios.push(() => sincronizarVeiculo(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID }));
    cenarios.push(() => sincronizarCliente(admin as any, LOJA_ID, { veiculo_id: VEICULO_ID }));
    cenarios.push(() => enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID }));

    for (const executar of cenarios) {
      const texto = await (await executar()).text();
      expect(texto.toLowerCase()).not.toContain('registrado no renave');
      expect(texto.toLowerCase()).not.toContain('registrada no renave');
    }
  });

  it('sucesso do envio da chave fala em envio, e o status interno não vaza para a resposta', async () => {
    mockarFetch(() => respostaFake(200, { ok: true }));
    const admin = montarBase();

    const resp = await enviarNfe(admin as any, LOJA_ID, 'enviar_nfe_compra', { veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(body.mensagem).toBe('Chave da NF-e enviada à Renave Fácil.');
    expect(body).not.toHaveProperty('status');
    // O valor 'registrado' existe só na coluna (CHECK da 0017) e significa
    // "a chamada foi aceita" — nunca sai daqui como afirmação ao lojista.
    expect(registro(admin)!.status).toBe('registrado');
  });
});

// ── Roteamento ────────────────────────────────────────────────────────────

describe('despachar', () => {
  it('action desconhecida devolve 400 listando as válidas', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase();

    const resp = await despachar(admin as any, LOJA_ID, { action: 'registrar_entrada', veiculo_id: VEICULO_ID });
    const body = await resp.json();

    expect(resp.status).toBe(400);
    expect(body.actions_validas).toContain('enviar_nfe_compra');
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('os nomes antigos do conector (etapa 1) ainda NÃO são aceitos — falha alta em vez de alias silencioso', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const admin = montarBase();

    const resp = await despachar(admin as any, LOJA_ID, {
      action: 'enviar_chave_nfe_purchase',
      veiculo_id: VEICULO_ID,
    });

    expect(resp.status).toBe(400);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});
