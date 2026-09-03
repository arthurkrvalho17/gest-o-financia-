import { describe, it, expect } from 'vitest';
import { parseFabMod } from './veiculoAno';

describe('parseFabMod', () => {
  it('"2020/2021" separa fabricação e modelo', () => {
    expect(parseFabMod('2020/2021')).toEqual({ anoFabricacao: 2020, anoModelo: 2021 });
  });

  it('"2021" (um único ano) vira fabricação = modelo = 2021', () => {
    expect(parseFabMod('2021')).toEqual({ anoFabricacao: 2021, anoModelo: 2021 });
  });

  it('vazio ou ausente vira null nos dois, nunca 0 ou NaN', () => {
    expect(parseFabMod('')).toEqual({ anoFabricacao: null, anoModelo: null });
    expect(parseFabMod('   ')).toEqual({ anoFabricacao: null, anoModelo: null });
    expect(parseFabMod(null)).toEqual({ anoFabricacao: null, anoModelo: null });
    expect(parseFabMod(undefined)).toEqual({ anoFabricacao: null, anoModelo: null });
  });

  it('lixo tipo "0km" nunca vira ano 0 (parseInt ingênuo cairia nessa)', () => {
    expect(parseFabMod('0km')).toEqual({ anoFabricacao: null, anoModelo: null });
  });

  it('lixo que começa com dígitos mas não é ano de 4 dígitos também vira null (não chuta)', () => {
    expect(parseFabMod('10km')).toEqual({ anoFabricacao: null, anoModelo: null });
    expect(parseFabMod('abc')).toEqual({ anoFabricacao: null, anoModelo: null });
    expect(parseFabMod('21/22')).toEqual({ anoFabricacao: null, anoModelo: null }); // 2 dígitos, não 4
  });

  it('um dos dois lados inválido descarta o par inteiro (nunca metade certa, metade chutada)', () => {
    expect(parseFabMod('2020/xx')).toEqual({ anoFabricacao: null, anoModelo: null });
    expect(parseFabMod('xx/2021')).toEqual({ anoFabricacao: null, anoModelo: null });
  });

  it('mais de duas partes (formato inesperado) vira null nos dois', () => {
    expect(parseFabMod('2020/2021/2022')).toEqual({ anoFabricacao: null, anoModelo: null });
  });

  it('espaços em volta dos anos são tolerados', () => {
    expect(parseFabMod(' 2020 / 2021 ')).toEqual({ anoFabricacao: 2020, anoModelo: 2021 });
  });
});
