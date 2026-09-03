// Testes do conector RENAVE (Renave Fácil) — mapeamento de situação,
// tratamento de 404 (veículo não cadastrado) e guard contra consulta em
// massa. A Edge Function renave-api é MOCKADA (supabase.functions.invoke):
// nenhum teste bate na Renave Fácil de verdade (nem existe sandbox — é
// tudo em produção, mais um motivo pra nunca testar ao vivo aqui).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '../../lib/supabase';
import { conectorRenave, mapearSituacaoEstoque } from './conectorRenave';

beforeEach(() => {
  vi.clearAllMocks();
});

function erroHttp(status, corpo) {
  return Object.assign(new Error(String(status)), { context: { status, json: async () => corpo } });
}

// ── Mapeamento de situacaoEstoqueRenave → status exibido no Estoque ──────

describe('mapearSituacaoEstoque', () => {
  it('mapeia todos os 7 códigos documentados', () => {
    expect(mapearSituacaoEstoque('S')).toBe('solicitado');
    expect(mapearSituacaoEstoque('T')).toBe('transferido');
    expect(mapearSituacaoEstoque('C')).toBe('confirmado');
    expect(mapearSituacaoEstoque('X')).toBe('cancelado');
    expect(mapearSituacaoEstoque('V')).toBe('vendido');
    expect(mapearSituacaoEstoque('E')).toBe('transferencia_entre_estabelecimentos');
    expect(mapearSituacaoEstoque('I')).toBe('transferencia_entre_filiais');
  });

  it("string vazia ('' — sem processo) mapeia para 'sem_processo', não quebra nem vira undefined", () => {
    expect(mapearSituacaoEstoque('')).toBe('sem_processo');
  });

  it('null/undefined (campo ausente na resposta) também caem em sem_processo', () => {
    expect(mapearSituacaoEstoque(null)).toBe('sem_processo');
    expect(mapearSituacaoEstoque(undefined)).toBe('sem_processo');
  });

  it("código 'X' (cancelado) não é confundido com sem_processo — são estados diferentes", () => {
    expect(mapearSituacaoEstoque('X')).not.toBe(mapearSituacaoEstoque(''));
  });

  it('código desconhecido (a Renave Fácil pode devolver algo não documentado) não lança exceção', () => {
    expect(() => mapearSituacaoEstoque('Z')).not.toThrow();
    expect(mapearSituacaoEstoque('Z')).toBe('desconhecido');
  });
});

// ── consultarStatus reflete a situação real via o conector ───────────────

describe('consultarStatus', () => {
  it('devolve situacao/statusEstoque/documentosDisponiveis a partir da resposta da Edge Function', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { situacaoEstoqueRenave: 'C', documentosDisponiveis: { crlv: true }, chassi: '9BW...', placa: 'ABC1D23' },
      error: null,
    });

    const r = await conectorRenave.consultarStatus({ placa: 'ABC1D23' });

    expect(r.ok).toBe(true);
    expect(r.situacao).toBe('C');
    expect(r.statusEstoque).toBe('confirmado');
    expect(r.documentosDisponiveis).toEqual({ crlv: true });
  });

  it("situacaoEstoqueRenave ausente na resposta (sem processo) vira '' e 'sem_processo', não erro", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { documentosDisponiveis: {} }, error: null });

    const r = await conectorRenave.consultarStatus({ renavam: '12345678901' });

    expect(r.ok).toBe(true);
    expect(r.situacao).toBe('');
    expect(r.statusEstoque).toBe('sem_processo');
  });
});

// ── Envio de chave NF-e sem veículo cadastrado (404) ──────────────────────

describe('envio de chave NF-e — veículo não cadastrado (404)', () => {
  const dadosNfe = { chassi: '9BWZZZ377VT004251', tipoVeiculo: 'U', chaveNfe: '35260866146269...', cpfCnpj: '52844196772', dtHrProcesso: '2026-09-02T10:00:00', valor: 62000 };

  it('sem dado de veículo pra sincronizar: 404 vira erro tipado "veiculo_nao_cadastrado", sem retry', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: erroHttp(404, { erro: 'not found' }) });

    const r = await conectorRenave.enviarChaveNfeVenda(dadosNfe);

    expect(r.ok).toBe(false);
    expect(r.erro).toBe('veiculo_nao_cadastrado');
    expect(r.mensagem).toMatch(/sincronize o cadastro/);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1); // não tentou sincronizar sozinho sem dado pra isso
  });

  it('COM dado de veículo: trata o 404 sincronizando o cadastro e reenviando a chave uma única vez', async () => {
    let chamada = 0;
    supabase.functions.invoke.mockImplementation(async (_nome, { body }) => {
      chamada += 1;
      if (chamada === 1) {
        expect(body.action).toBe('enviar_chave_nfe_purchase');
        return { data: null, error: erroHttp(404, { erro: 'not found' }) };
      }
      if (chamada === 2) {
        expect(body.action).toBe('sincronizar_veiculo');
        return { data: { ok: true }, error: null };
      }
      // 3ª chamada: reenvio da chave, agora deve funcionar
      expect(body.action).toBe('enviar_chave_nfe_purchase');
      return { data: { ok: true }, error: null };
    });

    const r = await conectorRenave.enviarChaveNfeCompra({
      ...dadosNfe,
      veiculoParaSincronizar: { chassi: dadosNfe.chassi, tipoVeiculo: 'U', descricao: 'Onix LT', anoFabricacao: 2019, anoModelo: 2020 },
    });

    expect(r.ok).toBe(true);
    expect(r.reenfileirouCadastro).toBe(true);
    expect(chamada).toBe(3);
  });

  it('erro que NÃO é 404 não tenta sincronizar — só reporta', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: erroHttp(500, { erro: 'falha interna' }) });

    const r = await conectorRenave.enviarChaveNfeTransferencia(dadosNfe);

    expect(r.ok).toBe(false);
    expect(r.erro).not.toBe('veiculo_nao_cadastrado');
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });
});

// ── Guard contra envio/consulta em massa ──────────────────────────────────

describe('guard contra consulta em massa (proibido pela doc da Renave Fácil)', () => {
  it('consultarStatus SEM placa nem renavam lança erro e nunca chama a Edge Function', async () => {
    await expect(conectorRenave.consultarStatus({})).rejects.toThrow(/placa ou renavam/);
    await expect(conectorRenave.consultarStatus()).rejects.toThrow(/placa ou renavam/);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('baixarDocumento SEM placa nem renavam lança erro e nunca chama a Edge Function', async () => {
    await expect(conectorRenave.baixarDocumento('crlve', {})).rejects.toThrow(/placa ou renavam/);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('consultarStatus com só placa OU só renavam já é suficiente (não exige os dois)', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { situacaoEstoqueRenave: '' }, error: null });
    await expect(conectorRenave.consultarStatus({ placa: 'ABC1D23' })).resolves.toMatchObject({ ok: true });
    await expect(conectorRenave.consultarStatus({ renavam: '12345678901' })).resolves.toMatchObject({ ok: true });
  });
});
