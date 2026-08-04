// Resolve (marca, modelo, versão) do cadastro do veículo para os IDs
// numéricos do Catálogo de Autos da OLX — obrigatórios na categoria 2020
// (vehicle_brand / vehicle_model / vehicle_version; a OLX rejeita com
// ERROR_VEHICLE_*_INVALID quando não batem com o catálogo).
// Ref: https://developers.olx.com.br/anuncio/api/autos/car_models.html
//
// O catálogo exige access_token em runtime, então a consulta passa pela Edge
// Function olx-api (acao 'catalogo', com cache server-side de 24h) — o browser
// nunca vê o token. Aqui fica só o matching tolerante (acento/caixa/
// similaridade). Quando NÃO há correspondência confiável, lançamos erro claro
// ANTES de enviar o anúncio, em vez de deixar a OLX rejeitar genericamente.
import { supabase } from '../../lib/supabase';
// Heurística compartilhada de "de que marca é este modelo" (função pura).
import { inferirMarcaModelo } from '../mercado_livre/mapearCamposML';

// Cache de sessão no cliente (a Edge Function já cacheia; isto evita até a
// ida à função quando o lojista publica vários carros em sequência).
const cacheSessao = new Map();

async function consultarCatalogo(caminho = []) {
  const chave = caminho.join('/');
  if (cacheSessao.has(chave)) return cacheSessao.get(chave);

  const { data, error } = await supabase.functions.invoke('olx-api', {
    body: { acao: 'catalogo', caminho },
  });
  if (error) {
    let msg = error.message;
    try {
      const detalhe = await error.context.json();
      msg = detalhe.erro || msg;
    } catch { /* mantém a mensagem genérica */ }
    throw new Error(`Falha ao consultar o Catálogo de Autos da OLX: ${msg}`);
  }
  const mapa = data?.data;
  if (!mapa || typeof mapa !== 'object') {
    throw new Error('Catálogo de Autos da OLX retornou resposta inesperada.');
  }
  cacheSessao.set(chave, mapa);
  return mapa; // { "NOME": id }
}

// ── Matching tolerante ────────────────────────────────────────────────

export const normalizar = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (s) => normalizar(s).split(' ').filter(Boolean);

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Melhor entrada de { NOME: id } para um texto: igualdade normalizada,
// depois substring, depois distância de edição pequena (tolera erro de grafia).
function melhorEntrada(mapa, texto) {
  const alvo = normalizar(texto);
  if (!alvo) return null;

  let melhor = null;
  for (const [nome, id] of Object.entries(mapa)) {
    const cand = normalizar(nome);
    let pontos = 0;
    if (cand === alvo) pontos = 3;
    else if (cand.includes(alvo) || alvo.includes(cand)) pontos = 2;
    else if (cand.length > 3 && levenshtein(cand, alvo) <= Math.max(1, Math.floor(cand.length / 5))) pontos = 1;
    if (pontos && (!melhor || pontos > melhor.pontos)) melhor = { nome, id, pontos };
  }
  return melhor;
}

// Melhor versão por sobreposição de tokens entre o texto do cadastro e o nome
// da versão no catálogo (ex.: "ONIX HATCH LT 1.0 8V FLEX 5P MEC.").
function melhorVersao(mapa, textoCadastro) {
  const nossos = new Set(tokens(textoCadastro));
  if (!nossos.size) return null;

  let melhor = null;
  for (const [nome, id] of Object.entries(mapa)) {
    const deles = tokens(nome);
    const comuns = deles.filter((t) => nossos.has(t)).length;
    const cobertura = comuns / nossos.size; // quanto do NOSSO cadastro a versão cobre
    if (!melhor || comuns > melhor.comuns || (comuns === melhor.comuns && cobertura > melhor.cobertura)) {
      melhor = { nome, id, comuns, cobertura };
    }
  }
  // Sem pelo menos 2 tokens em comum (ou cobertura razoável de cadastro curto),
  // o palpite não é confiável — melhor bloquear do que publicar errado.
  if (!melhor || (melhor.comuns < 2 && melhor.cobertura < 0.5)) return null;
  return melhor;
}

const maisProximas = (mapa, n = 3) => Object.keys(mapa).slice(0, n).join(', ');

// ── Resolução completa ────────────────────────────────────────────────
// anuncio.titulo vem do cadastro ("Onix LT 1.0" ou "Chevrolet Onix LT 1.0").
// → { vehicle_brand, vehicle_model, vehicle_version } (IDs em string, como no
//   exemplo da doc) — ou lança erro acionável apontando o cadastro.
export async function resolverCatalogoOlx(anuncio) {
  const { marca, modelo } = inferirMarcaModelo(anuncio.titulo);

  const marcas = await consultarCatalogo();
  const m = melhorEntrada(marcas, marca) || melhorEntrada(marcas, tokens(anuncio.titulo)[0] || '');
  if (!m) {
    throw new Error(
      `Marca "${marca || anuncio.titulo}" não encontrada no catálogo da OLX — ajuste o cadastro do veículo (comece o modelo pela marca, ex.: "Chevrolet Onix LT 1.0").`,
    );
  }

  const modelos = await consultarCatalogo([m.id]);
  // O nome do modelo no catálogo costuma ser a 1ª palavra do nosso campo
  // "modelo" ("ONIX" ⊂ "Onix LT 1.0") — testa o campo inteiro e depois a 1ª palavra.
  const mod = melhorEntrada(modelos, tokens(modelo)[0] || modelo) || melhorEntrada(modelos, modelo);
  if (!mod) {
    throw new Error(
      `Modelo "${modelo}" não encontrado no catálogo da OLX para a marca ${m.nome} — ajuste o cadastro do veículo. Exemplos do catálogo: ${maisProximas(modelos)}.`,
    );
  }

  const versoes = await consultarCatalogo([m.id, mod.id]);
  const ver = melhorVersao(versoes, anuncio.titulo);
  if (!ver) {
    throw new Error(
      `Versão de "${anuncio.titulo}" não encontrada no catálogo da OLX — inclua a versão no cadastro do veículo (ex.: motorização e acabamento). Exemplos do catálogo: ${maisProximas(versoes)}.`,
    );
  }

  return {
    vehicle_brand: String(m.id),
    vehicle_model: String(mod.id),
    vehicle_version: String(ver.id),
  };
}
