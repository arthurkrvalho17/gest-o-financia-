// Testes de tokenValidoML — em especial o bug de uso único do refresh_token
// (Parte C, 02/09/2026): cada renovação do Mercado Livre devolve um par
// NOVO; reusar o antigo funciona na 1ª renovação e quebra "silenciosamente"
// na 2ª (o ML aceita cada refresh_token só uma vez). Um teste de UMA
// renovação só não pega esse bug — por isso o teste principal aqui faz DUAS
// seguidas. Nenhum teste bate no Mercado Livre real; `admin` é o mesmo fake
// em memória usado nos testes da Spedy, e `fetch` é sempre mockado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tokenValidoML } from './mlToken.ts';
import { criarAdminFake } from './testFakeAdmin.ts';

const LOJA_ID = 'loja-1';

beforeEach(() => {
  (globalThis as any).__ML_TOKEN_TEST_ENV__ = { ML_CLIENT_ID: 'client-id', ML_CLIENT_SECRET: 'client-secret' };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as any).__ML_TOKEN_TEST_ENV__;
});

function credExpirada(refresh_token = 'refresh-original') {
  return {
    access_token: 'access-velho',
    refresh_token,
    expires_at: new Date(Date.now() - 1000).toISOString(), // já venceu
    ml_user_id: 42,
  };
}

function montarAdmin(credenciais: Record<string, unknown>) {
  return criarAdminFake({
    canal_credencial: [{ id: 'cred-1', loja_id: LOJA_ID, canal: 'mercado_livre', credenciais, status: 'conectado' }],
  });
}

function respostaRenovacao(accessToken: string, refreshToken: string) {
  return { ok: true, status: 200, json: async () => ({ access_token: accessToken, refresh_token: refreshToken, expires_in: 21600 }) };
}

describe('tokenValidoML — renovação de token do Mercado Livre', () => {
  it('token ainda válido: devolve direto, nunca chama a rede', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const cred = { access_token: 'access-bom', refresh_token: 'refresh-x', expires_at: new Date(Date.now() + 3600_000).toISOString() };
    const admin = montarAdmin(cred);

    const { token, erro } = await tokenValidoML(admin as any, LOJA_ID, cred as any);

    expect(token).toBe('access-bom');
    expect(erro).toBeUndefined();
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('renova quando expirado: grava o par NOVO (access_token e refresh_token diferentes dos antigos)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaRenovacao('access-novo-1', 'refresh-novo-1')));
    const cred = credExpirada('refresh-original');
    const admin = montarAdmin(cred);

    const { token, erro } = await tokenValidoML(admin as any, LOJA_ID, cred as any);

    expect(erro).toBeUndefined();
    expect(token).toBe('access-novo-1');
    const gravado = admin._db.canal_credencial[0].credenciais;
    expect(gravado.access_token).toBe('access-novo-1');
    expect(gravado.refresh_token).toBe('refresh-novo-1'); // NUNCA o 'refresh-original'
    expect(gravado.ml_user_id).toBe(42); // preservado
  });

  it('DUAS renovações consecutivas: a 2ª usa o refresh_token gravado pela 1ª, não o original (o bug que uma renovação só não pega)', async () => {
    const corposEnviados: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const body = new URLSearchParams(opts.body);
        corposEnviados.push(body.get('refresh_token')!);
        // Simula o ML: cada chamada devolve um par novo e distinto.
        const n = corposEnviados.length;
        return respostaRenovacao(`access-novo-${n}`, `refresh-novo-${n}`);
      }),
    );
    const cred = credExpirada('refresh-original');
    const admin = montarAdmin(cred);

    // 1ª renovação
    const r1 = await tokenValidoML(admin as any, LOJA_ID, cred as any);
    expect(r1.token).toBe('access-novo-1');

    // 2ª renovação: simula outra requisição chegando depois, com o `cred` ORIGINAL
    // em mãos (o cenário real — quem chama não sabe que já rolou uma renovação;
    // é `tokenValidoML` quem tem que reler o banco e usar o que está lá agora).
    // Força "expirado de novo" reescrevendo expires_at no fake antes de chamar.
    admin._db.canal_credencial[0].credenciais.expires_at = new Date(Date.now() - 1000).toISOString();
    const r2 = await tokenValidoML(admin as any, LOJA_ID, cred as any); // `cred` ainda é o objeto ORIGINAL, de propósito

    expect(r2.token).toBe('access-novo-2');
    // A prova do bug: o segundo POST ao ML usou o refresh_token da 1ª renovação,
    // nunca o 'refresh-original'. Com o bug (reusar `cred.refresh_token` do
    // argumento em vez de reler o banco), a 2ª chamada mandaria 'refresh-original'
    // de novo e o ML responderia invalid_grant.
    expect(corposEnviados).toEqual(['refresh-original', 'refresh-novo-1']);
    expect(corposEnviados[1]).not.toBe('refresh-original');
  });

  it('sem refresh_token (conexão feita sem offline_access): marca "erro" com mensagem explícita, nunca chama a rede', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const cred = { access_token: 'access-velho', refresh_token: null, expires_at: new Date(Date.now() - 1000).toISOString() };
    const admin = montarAdmin(cred);

    const { token, erro } = await tokenValidoML(admin as any, LOJA_ID, cred as any);

    expect(token).toBeUndefined();
    expect(erro).toMatch(/offline_access/);
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(admin._db.canal_credencial[0].status).toBe('erro');
  });

  it('refresh_token realmente inválido/expirado (achado 02/09/2026): status vira "expirado", não "erro" — mesmo padrão da OLX', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }));
    const cred = credExpirada('refresh-vencido-ha-6-meses');
    const admin = montarAdmin(cred);

    const { token, erro } = await tokenValidoML(admin as any, LOJA_ID, cred as any);

    expect(token).toBeUndefined();
    expect(erro).toMatch(/Reconecte/);
    expect(admin._db.canal_credencial[0].status).toBe('expirado');
  }, 10_000); // essa via espera 1.5s (recuperação de corrida) antes de desistir

  it('corrida entre requisições concorrentes: se outra já renovou, usa o token dela em vez de tentar de novo', async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    const cred = credExpirada('refresh-original');
    const admin = montarAdmin(cred);
    // Simula que OUTRA requisição já renovou entre o momento em que este
    // `cred` foi lido e a chamada de tokenValidoML.
    admin._db.canal_credencial[0].credenciais = { access_token: 'access-do-vencedor', refresh_token: 'refresh-do-vencedor', expires_at: new Date(Date.now() + 3600_000).toISOString() };

    const { token, erro } = await tokenValidoML(admin as any, LOJA_ID, cred as any);

    expect(token).toBe('access-do-vencedor');
    expect(erro).toBeUndefined();
    expect(fetchEspiao).not.toHaveBeenCalled(); // nem chegou a tentar renovar
  });
});
