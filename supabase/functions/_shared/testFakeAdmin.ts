// Cliente Supabase FALSO, só para os testes vitest dos handlers Deno
// (spedy-webhook/index.ts, spedy-api/index.ts) — em memória, sem rede e sem
// Deno. Implementa só o subconjunto de `.from(...)` usado por esses dois
// arquivos (select/insert/update/upsert com `.eq`/`.maybeSingle`/`.single`).
// Não é (e não tenta ser) um mock fiel do supabase-js — é o mínimo para
// exercitar a lógica de verdade dos handlers com dados de mentira.

type Row = Record<string, any>;

export function criarAdminFake(tabelasIniciais: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = {};
  for (const [tabela, linhas] of Object.entries(tabelasIniciais)) {
    db[tabela] = linhas.map((l) => ({ ...l }));
  }
  let seq = 1;

  function from(tabela: string) {
    if (!db[tabela]) db[tabela] = [];
    const filtros: [string, any][] = [];
    let modo: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Row | null = null;
    let onConflict: string | null = null;
    let single = false;

    function aplicaFiltros(linhas: Row[]) {
      return linhas.filter((l) => filtros.every(([c, v]) => l[c] === v));
    }

    function executar() {
      if (modo === 'select') {
        const linhas = aplicaFiltros(db[tabela]);
        return single ? { data: linhas[0] ?? null, error: null } : { data: linhas, error: null };
      }
      if (modo === 'insert') {
        const linha = { id: payload!.id ?? `fake-${seq++}`, ...payload };
        db[tabela].push(linha);
        return single ? { data: linha, error: null } : { data: [linha], error: null };
      }
      if (modo === 'update') {
        const linhas = aplicaFiltros(db[tabela]);
        linhas.forEach((l) => Object.assign(l, payload));
        return { data: single ? (linhas[0] ?? null) : linhas, error: null };
      }
      if (modo === 'upsert') {
        const chave = onConflict ?? 'id';
        const existente = db[tabela].find((l) => l[chave] === payload![chave]);
        let linha: Row;
        if (existente) {
          Object.assign(existente, payload);
          linha = existente;
        } else {
          linha = { id: `fake-${seq++}`, ...payload };
          db[tabela].push(linha);
        }
        return single ? { data: linha, error: null } : { data: [linha], error: null };
      }
      throw new Error(`modo desconhecido: ${modo}`);
    }

    const builder: any = {
      select() { return builder; },
      eq(campo: string, valor: any) { filtros.push([campo, valor]); return builder; },
      insert(obj: Row) { modo = 'insert'; payload = obj; return builder; },
      update(obj: Row) { modo = 'update'; payload = obj; return builder; },
      upsert(obj: Row, opts?: { onConflict?: string }) {
        modo = 'upsert';
        payload = obj;
        onConflict = opts?.onConflict ?? null;
        return builder;
      },
      maybeSingle() { single = true; return Promise.resolve(executar()); },
      single() { single = true; return Promise.resolve(executar()); },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        try {
          resolve(executar());
        } catch (e) {
          if (reject) reject(e);
          else throw e;
        }
      },
    };

    return builder;
  }

  return { from, _db: db };
}
