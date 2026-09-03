// Lógica pura da integração RENAVE — roda no vitest, fora do Deno, SEM rede.
// Nenhum teste deste arquivo (nem do renave-api/index.test.ts) chega perto da
// Renave Fácil: lá não existe sandbox, então toda chamada de verdade seria em
// produção. Mesmo motivo pelo qual spedyConfig.ts é testado separado do
// handler.
import { describe, it, expect } from 'vitest';
import {
  RENAVE_API_URL_PADRAO,
  camposCompraFaltando,
  camposVeiculoFaltando,
  camposVendedorOrigemFaltando,
  formatarDtHrProcesso,
  mensagemCamposFaltando,
  montarPayloadCliente,
  montarPayloadNfe,
  montarPayloadVeiculo,
  normalizarUrlBase,
  resolverEvento,
  resolverTipoVeiculo,
  rotaDocumento,
  textoEnviado,
} from './renaveCore.ts';

const VEICULO_COMPLETO = {
  id: 'veic-1',
  chassi: '9bwzzz377vt004251',
  renavam: '1234567890-1',
  ano_fabricacao: 2019,
  ano_modelo: 2020,
  placa: 'abc1d23',
  descricao: 'Onix LT 1.0',
  modelo: 'Onix',
  codigo_fipe: '004445-0',
  chave_nfe_compra: '3526 0866 1462 6900 0000',
  vendedor_origem_nome: 'João da Silva',
  vendedor_origem_cpf_cnpj: '528.441.967-72',
  vendedor_origem_cep: '70000-000',
  vendedor_origem_logradouro: 'Rua das Flores',
  vendedor_origem_numero: '123',
  vendedor_origem_bairro: 'Centro',
  vendedor_origem_cidade: 'Brasília',
  vendedor_origem_uf: 'df',
};

// ── URL base ──────────────────────────────────────────────────────────────

describe('normalizarUrlBase', () => {
  it('sem env configurada, o default é PRODUÇÃO (não existe sandbox na Renave Fácil)', () => {
    expect(normalizarUrlBase(undefined)).toBe(RENAVE_API_URL_PADRAO);
    expect(normalizarUrlBase('')).toBe(RENAVE_API_URL_PADRAO);
    expect(RENAVE_API_URL_PADRAO).toBe('https://api.renavefacil.net/v2/integration');
  });

  it('remove barra final para o caminho não virar dupla', () => {
    expect(normalizarUrlBase('https://exemplo.test/v2/integration/')).toBe('https://exemplo.test/v2/integration');
  });
});

// ── dtHrProcesso (regra 2: momento do envio, nunca a data de entrada) ─────

describe('formatarDtHrProcesso', () => {
  it('formata exatamente YYYY-MM-DDTHH:MM:SS — sem milissegundos, sem sufixo de timezone', () => {
    const s = formatarDtHrProcesso(new Date('2026-09-03T01:30:45Z'), 'UTC');
    expect(s).toBe('2026-09-03T01:30:45');
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(s).not.toMatch(/[Z.]/);
  });

  it('usa o fuso de São Paulo por padrão — 22h30 local não pode virar o dia seguinte', () => {
    // 01:30 UTC de 03/09 é 22:30 do dia 02/09 em São Paulo. Mandar UTC
    // colocaria o processo num DIA que não aconteceu ainda.
    expect(formatarDtHrProcesso(new Date('2026-09-03T01:30:45Z'))).toBe('2026-09-02T22:30:45');
  });

  it('meia-noite local sai como 00, nunca como 24 (bug clássico de Intl hour12:false)', () => {
    expect(formatarDtHrProcesso(new Date('2026-09-03T03:00:00Z'))).toBe('2026-09-03T00:00:00');
  });

  it('é o instante do ENVIO: dois envios em momentos diferentes têm carimbos diferentes', () => {
    const a = formatarDtHrProcesso(new Date('2026-09-03T12:00:00Z'));
    const b = formatarDtHrProcesso(new Date('2026-09-04T12:00:00Z'));
    expect(a).not.toBe(b);
  });
});

// ── Validação de campos faltando (regra 4) ────────────────────────────────

describe('camposVeiculoFaltando', () => {
  it('veículo completo não tem campo faltando', () => {
    expect(camposVeiculoFaltando(VEICULO_COMPLETO)).toEqual([]);
  });

  it('nomeia cada campo ausente, na ordem, sem parar no primeiro', () => {
    expect(camposVeiculoFaltando({ chassi: 'x' })).toEqual(['renavam', 'ano_fabricacao', 'ano_modelo']);
  });

  it('string em branco conta como ausente (cadastro salvo com espaço não vale)', () => {
    expect(camposVeiculoFaltando({ ...VEICULO_COMPLETO, chassi: '   ' })).toEqual(['chassi']);
  });

  it('veículo inexistente devolve todos os campos, não estoura', () => {
    expect(camposVeiculoFaltando(null)).toEqual(['chassi', 'renavam', 'ano_fabricacao', 'ano_modelo']);
  });
});

describe('camposVendedorOrigemFaltando', () => {
  it('vendedor completo passa', () => {
    expect(camposVendedorOrigemFaltando(VEICULO_COMPLETO)).toEqual([]);
  });

  it('complemento NÃO é obrigatório — endereço sem complemento é o caso normal', () => {
    const { vendedor_origem_nome, ...semNome } = VEICULO_COMPLETO;
    expect(camposVendedorOrigemFaltando({ ...VEICULO_COMPLETO, vendedor_origem_complemento: '' })).toEqual([]);
    expect(camposVendedorOrigemFaltando(semNome)).toEqual(['vendedor_origem_nome']);
  });

  it('lista todos os que faltam de uma vez', () => {
    expect(camposVendedorOrigemFaltando({})).toHaveLength(8);
  });
});

describe('camposCompraFaltando — a checagem antes de enviar a NF-e de compra', () => {
  it('veículo completo + valor > 0 passa', () => {
    expect(camposCompraFaltando(VEICULO_COMPLETO, 62000)).toEqual([]);
  });

  it('junta identificação do veículo, vendedor de origem, chave e valor num único retorno', () => {
    const faltando = camposCompraFaltando({ chassi: '9BW' }, 0);
    expect(faltando).toContain('renavam');
    expect(faltando).toContain('ano_fabricacao');
    expect(faltando).toContain('vendedor_origem_cpf_cnpj');
    expect(faltando).toContain('chave_nfe_compra');
    expect(faltando).toContain('valor_compra');
  });

  it('valor zero ou negativo é campo faltando (nota de compra sem valor não existe)', () => {
    expect(camposCompraFaltando(VEICULO_COMPLETO, 0)).toEqual(['valor_compra']);
    expect(camposCompraFaltando(VEICULO_COMPLETO, -1)).toEqual(['valor_compra']);
    expect(camposCompraFaltando(VEICULO_COMPLETO, null)).toEqual(['valor_compra']);
  });
});

describe('mensagemCamposFaltando', () => {
  it('nomea os campos em português, sem despejar nome de coluna cru', () => {
    const msg = mensagemCamposFaltando(['chassi', 'ano_fabricacao', 'vendedor_origem_cpf_cnpj']);
    expect(msg).toContain('chassi');
    expect(msg).toContain('ano de fabricação');
    expect(msg).toContain('CPF/CNPJ do vendedor de origem');
  });

  it('usa "enviado à Renave Fácil" e NUNCA "registrado no RENAVE"', () => {
    const msg = mensagemCamposFaltando(['chassi']);
    expect(msg).toContain('enviado à Renave Fácil');
    expect(msg.toLowerCase()).not.toContain('registrado no renave');
  });
});

describe('textoEnviado', () => {
  it('concorda com o sujeito: "cadastro enviado", "chave enviada"', () => {
    expect(`Cadastro do veículo ${textoEnviado()}`).toBe('Cadastro do veículo enviado à Renave Fácil');
    expect(`Chave da NF-e ${textoEnviado('f')}`).toBe('Chave da NF-e enviada à Renave Fácil');
  });

  it('nenhuma variação afirma registro no RENAVE — quem dispara o processo legal não é o Financia+', () => {
    for (const t of [textoEnviado('m'), textoEnviado('f')]) {
      expect(t.toLowerCase()).not.toMatch(/registrad[oa] no renave/);
      expect(t).toContain('à Renave Fácil');
    }
  });
});

// ── tipoVeiculo ───────────────────────────────────────────────────────────

describe('resolverTipoVeiculo', () => {
  it("default é 'U' (o produto é revenda de usado) quando nada é informado", () => {
    expect(resolverTipoVeiculo(undefined)).toBe('U');
    expect(resolverTipoVeiculo('')).toBe('U');
  });

  it("aceita 'N' e 'U', inclusive minúsculo", () => {
    expect(resolverTipoVeiculo('N')).toBe('N');
    expect(resolverTipoVeiculo('u')).toBe('U');
  });

  it('valor inválido lança em vez de virar usado silenciosamente', () => {
    expect(() => resolverTipoVeiculo('X')).toThrow(/'N' \(novo\) ou 'U' \(usado\)/);
    expect(() => resolverTipoVeiculo('proprio')).toThrow();
  });
});

// ── Montagem de payload ───────────────────────────────────────────────────

describe('montarPayloadVeiculo', () => {
  it('anos vão como Number (a doc exige), chassi/placa em maiúsculo, renavam só dígitos', () => {
    const p = montarPayloadVeiculo(VEICULO_COMPLETO, 'U') as any;
    expect(p.anoFabricacao).toBe(2019);
    expect(p.anoModelo).toBe(2020);
    expect(typeof p.anoFabricacao).toBe('number');
    expect(p.chassi).toBe('9BWZZZ377VT004251');
    expect(p.placa).toBe('ABC1D23');
    expect(p.renavam).toBe('12345678901');
    expect(p.tipoVeiculo).toBe('U');
  });

  it("placa e renavam ausentes viram '' (veículo novo), nunca null", () => {
    const p = montarPayloadVeiculo({ ...VEICULO_COMPLETO, placa: null, renavam: null }, 'N') as any;
    expect(p.placa).toBe('');
    expect(p.renavam).toBe('');
  });

  it('codigoFipe é omitido quando não temos — não vai como string vazia', () => {
    const p = montarPayloadVeiculo({ ...VEICULO_COMPLETO, codigo_fipe: null }, 'U');
    expect(p).not.toHaveProperty('codigoFipe');
    expect(montarPayloadVeiculo(VEICULO_COMPLETO, 'U')).toHaveProperty('codigoFipe', '004445-0');
  });

  it('descricao cai para o modelo quando a descrição não foi preenchida', () => {
    const p = montarPayloadVeiculo({ ...VEICULO_COMPLETO, descricao: null }, 'U') as any;
    expect(p.descricao).toBe('Onix');
  });
});

describe('montarPayloadCliente', () => {
  it('monta o vendedor de origem com CPF/CNPJ e CEP só em dígitos e UF maiúscula', () => {
    const p = montarPayloadCliente(VEICULO_COMPLETO) as any;
    expect(p.cpfCnpj).toBe('52844196772');
    expect(p.cep).toBe('70000000');
    expect(p.uf).toBe('DF');
    expect(p.razaoSocial).toBe('João da Silva');
  });

  it("complemento ausente vai como '' — a chave existe, o valor é vazio", () => {
    expect((montarPayloadCliente(VEICULO_COMPLETO) as any).complemento).toBe('');
  });
});

describe('montarPayloadNfe', () => {
  it('chave e CPF/CNPJ vão só com dígitos; valor vai como Number', () => {
    const p = montarPayloadNfe({
      chassi: '9bwzzz377vt004251',
      tipoVeiculo: 'U',
      chaveNfe: '3526 0866-1462.6900',
      cpfCnpj: '528.441.967-72',
      dtHrProcesso: '2026-09-03T10:00:00',
      valor: 62000,
    }) as any;
    expect(p.chaveNfe).toBe('3526086614626900');
    expect(p.cpfCnpj).toBe('52844196772');
    expect(p.chassi).toBe('9BWZZZ377VT004251');
    expect(p.valor).toBe(62000);
    expect(p.dtHrProcesso).toBe('2026-09-03T10:00:00');
  });
});

// ── Rotas e eventos ───────────────────────────────────────────────────────

describe('rotaDocumento', () => {
  it('mapeia só os três documentos que a Renave Fácil expõe (leitura)', () => {
    expect(rotaDocumento('atpve_entrada')).toBe('atpve/entrada');
    expect(rotaDocumento('atpve_saida')).toBe('atpve/saida');
    expect(rotaDocumento('crlve')).toBe('crlve');
  });

  it('tipo desconhecido lança nomeando os válidos, em vez de montar URL inventada', () => {
    expect(() => rotaDocumento('crv_papel')).toThrow(/atpve_entrada \| atpve_saida \| crlve/);
    expect(() => rotaDocumento('')).toThrow();
  });
});

describe('resolverEvento', () => {
  it('cada ação tem um eixo determinado (renave_registro é única por veiculo × evento)', () => {
    expect(resolverEvento('enviar_nfe_compra')).toBe('entrada');
    expect(resolverEvento('sincronizar_veiculo')).toBe('entrada');
    expect(resolverEvento('enviar_nfe_venda')).toBe('saida');
    expect(resolverEvento('enviar_nfe_transferencia')).toBe('saida');
  });

  it('baixar_documento segue o documento pedido (ATPV-e de saída grava no evento de saída)', () => {
    expect(resolverEvento('baixar_documento', undefined, 'atpve_saida')).toBe('saida');
    expect(resolverEvento('baixar_documento', undefined, 'atpve_entrada')).toBe('entrada');
  });

  it('evento informado explicitamente ganha do default', () => {
    expect(resolverEvento('enviar_nfe_compra', 'saida')).toBe('saida');
  });

  it("evento inválido lança — 'consignacao' não existe mais desde a 0029", () => {
    expect(() => resolverEvento('enviar_nfe_compra', 'consignacao')).toThrow(/'entrada' ou 'saida'/);
  });
});
