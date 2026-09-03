// Utilitários de upload para o Supabase Storage.
// Todos os buckets são privados + RLS por loja (foldername[1] = loja_id).
// Retorna { url: signedUrl, path } em sucesso ou { error } em falha.
import { supabase } from './supabase';

const uid = () =>
  globalThis.crypto?.randomUUID?.() || 'f-' + Math.random().toString(36).slice(2);

const TTL_1_ANO = 60 * 60 * 24 * 365;

async function upload(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) return { error };
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_1_ANO);
  return { url: data?.signedUrl, path };
}

export async function uploadFotoVeiculo({ file, lojaId, veiculoId }) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const path = `${lojaId}/${veiculoId}/${uid()}.${ext}`;
  return upload('fotos-veiculos', path, file);
}

export async function uploadDocVeiculo({ file, lojaId, veiculoId }) {
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const path = `${lojaId}/${veiculoId}/${uid()}.${ext}`;
  return upload('docs-veiculos', path, file);
}

export async function uploadLogo({ file, lojaId }) {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
  const path = `${lojaId}/logo.${ext}`;
  return upload('logos-lojas', path, file);
}

// Traço desenhado na via "assinar no aparelho" — registro visual de
// aceite, não uma assinatura eletrônica avançada. `blob` vem de
// canvas.toBlob(); ver AssinaturaModal.jsx.
export async function uploadAssinatura({ blob, lojaId, documentoId }) {
  const path = `${lojaId}/${documentoId}/${uid()}.png`;
  return upload('assinaturas', path, blob);
}

export async function deletarArquivo(bucket, path) {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

// ── Leitura: URL assinada gerada NA HORA a partir do path ─────────────
// URLs assinadas gravadas no banco expiram; o path não. Estas funções
// geram URLs frescas na leitura, com fallback para a URL antiga (legado).

const TTL_LEITURA = 60 * 60; // 1h — abrir/visualizar
// 30 dias — os portais baixam as fotos DEPOIS do publish (a OLX tem moderação
// assíncrona e re-baixa as imagens em edições/re-análises); 24h dava NO_IMAGE.
// A URL é renovada a cada publicar/atualizar. Ver ADR-18 no README.
const TTL_ANUNCIO = 60 * 60 * 24 * 30;

export async function urlAssinada(bucket, path, urlLegada = null, ttl = TTL_LEITURA) {
  if (!path) return urlLegada;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  return data?.signedUrl || urlLegada;
}

// itens: [{ path, url }] → [urls] na mesma ordem (1 chamada batch p/ os paths)
export async function urlsAssinadas(bucket, itens, ttl = TTL_ANUNCIO) {
  const paths = itens.filter((i) => i.path).map((i) => i.path);
  let mapa = {};
  if (paths.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, ttl);
    mapa = Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }
  return itens.map((i) => (i.path && mapa[i.path]) || i.url || null).filter(Boolean);
}
