import { describe, it, expect } from 'vitest';
import { camposRenaveFaltando, validarCamposRenave } from './validacaoRenave';

const veiculoCompleto = {
  chassi: '9BWZZZ377VT004251',
  placa: 'ABC1D23',
  renavam: '12345678901',
  ano_fabricacao: 2020,
  ano_modelo: 2021,
};

describe('validarCamposRenave', () => {
  it('loja SEM RENAVE ativo: salva sem nenhum dos campos, sem bloquear', () => {
    expect(validarCamposRenave({}, false)).toBeNull();
    expect(validarCamposRenave({ chassi: '', placa: '', renavam: '' }, false)).toBeNull();
  });

  it('loja COM RENAVE ativo e veículo completo: não bloqueia', () => {
    expect(validarCamposRenave(veiculoCompleto, true)).toBeNull();
  });

  it('loja COM RENAVE ativo e veículo incompleto: bloqueia e diz exatamente o que falta', () => {
    const msg = validarCamposRenave({ ...veiculoCompleto, chassi: '', ano_modelo: null }, true);
    expect(msg).toMatch(/Chassi/);
    expect(msg).toMatch(/Ano modelo/);
    expect(msg).not.toMatch(/Placa/); // placa está preenchida, não deve aparecer
  });

  it('loja COM RENAVE ativo e veículo totalmente vazio: lista os 5 campos', () => {
    expect(camposRenaveFaltando({})).toEqual(['Chassi', 'Placa', 'RENAVAM', 'Ano de fabricação', 'Ano modelo']);
  });

  it('codigo_fipe, chave_nfe_compra e vendedor_origem_* NUNCA entram na lista de obrigatórios (endpoints separados)', () => {
    const msg = validarCamposRenave(veiculoCompleto, true); // sem codigo_fipe/chave_nfe_compra/vendedor_origem_*
    expect(msg).toBeNull();
  });
});
