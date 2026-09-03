// Nota fiscal de uma despesa (foto JPG/PNG ou PDF). Opcional, comprova o gasto.
// Demo: o arquivo vira dataURL guardada no próprio lançamento.
// Real: vai ao Supabase Storage (bucket "notas-fiscais", RLS por loja) e guardamos
// uma URL assinada de longa duração em nota_fiscal_url.
import { supabase } from './supabase';

const uid = () =>
  globalThis.crypto?.randomUUID?.() || 'nf-' + Math.random().toString(36).slice(2);

export function tipoDeArquivo(file) {
  const t = file?.type || '';
  return t.includes('pdf') || /\.pdf$/i.test(file?.name || '') ? 'pdf' : 'imagem';
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Prepara a nota para gravar no lançamento. Retorna { url, tipo } ou { error }.
export async function prepararNota({ file, demo, lojaId, ref }) {
  if (!file) return { error: new Error('Sem arquivo') };
  const tipo = tipoDeArquivo(file);
  if (demo) {
    const url = await fileToDataUrl(file);
    return { url, tipo };
  }
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const path = `${lojaId}/${ref || uid()}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('notas-fiscais').upload(path, file, { upsert: true });
  if (error) return { error };
  // URL assinada de longa duração (1 ano) — o bucket é privado, isolado por loja.
  const { data } = await supabase.storage.from('notas-fiscais').createSignedUrl(path, 60 * 60 * 24 * 365);
  return { url: data?.signedUrl, tipo, path };
}
