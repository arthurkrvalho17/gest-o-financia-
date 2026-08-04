// Camada de publicação por canal — funciona nos DOIS modos:
//   demo → stores em memória (demoIntegr), como sempre foi
//   real → canal_credencial (conexões) + anuncio_publicacao (status por
//          veículo×canal), via conectores reais (OLX, ML, ...)
//
// Fluxo (ADR-09): monta o anúncio canônico → conector publica → grava
// status/link. Publicar é assíncrono: quem chama não bloqueia a UI.
import { supabase } from '../lib/supabase';
import { urlsAssinadas } from '../lib/storage';
import { getConector } from './conectores';
import { montarAnuncio } from './anuncioCanonico';
import {
  getConexoes, getPublicacoes, setPublicacao, removerPublicacao,
} from './demoIntegr';

// Chave do veículo nos stores demo (codigo é estável; id cobre carro sem codigo)
const chaveDemo = (veiculo) => veiculo.codigo || veiculo.id;

// → { [canal]: true } só com canais conectados
export async function canaisConectados({ demo, lojaId }) {
  if (demo) {
    const cx = getConexoes();
    return Object.fromEntries(
      Object.entries(cx).filter(([, st]) => st === 'conectado').map(([c]) => [c, true])
    );
  }
  const { data } = await supabase
    .from('canal_credencial')
    .select('canal, status')
    .eq('loja_id', lojaId)
    .eq('status', 'conectado');
  return Object.fromEntries((data || []).map((r) => [r.canal, true]));
}

// → { [canal]: { status, link_externo, id_externo, mensagem_erro } }
export async function getPublicacoesDe({ demo, veiculo }) {
  if (demo) return { ...getPublicacoes(chaveDemo(veiculo)) };
  const { data } = await supabase
    .from('anuncio_publicacao')
    .select('canal, status, id_externo, link_externo, mensagem_erro')
    .eq('veiculo_id', veiculo.id);
  const mapa = {};
  for (const p of data || []) {
    if (p.status !== 'despublicado') mapa[p.canal] = p;
  }
  return mapa;
}

// No modo real as fotos vivem em veiculo_fotos; o anúncio precisa de URLs
// FRESCAS geradas do path — os portais baixam as imagens após o publish e a
// URL gravada no banco pode já ter expirado. O TTL é longo (30 dias, ADR-18)
// porque a OLX modera de forma assíncrona e re-baixa as fotos em edições.
async function fotosDoVeiculo(veiculo) {
  if (veiculo.fotos?.length) return veiculo.fotos;
  const { data } = await supabase
    .from('veiculo_fotos')
    .select('url, path, ordem')
    .eq('veiculo_id', veiculo.id)
    .order('ordem');
  const urls = await urlsAssinadas('fotos-veiculos', data || []);
  return urls.map((url) => ({ url }));
}

async function salvarResultado({ demo, lojaId, veiculo, canal, dados }) {
  if (demo) {
    setPublicacao(chaveDemo(veiculo), canal, dados);
    return;
  }
  await supabase.from('anuncio_publicacao').upsert(
    {
      loja_id: lojaId,
      veiculo_id: veiculo.id,
      canal,
      status: dados.status,
      id_externo: dados.id_externo || null,
      link_externo: dados.link_externo || null,
      mensagem_erro: dados.mensagem_erro || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'veiculo_id,canal' },
  );
}

// Publica um veículo em um canal e persiste o resultado.
// → { ok, link_externo?, erro? }
export async function publicarEmCanal({ demo, lojaId, veiculo, config, canal }) {
  const fotos = demo ? veiculo.fotos || [] : await fotosDoVeiculo(veiculo);
  const anuncio = montarAnuncio({ ...veiculo, fotos }, config);

  await salvarResultado({ demo, lojaId, veiculo, canal, dados: { status: 'pendente' } });
  const res = await getConector(canal).publicar(anuncio);
  const dados = res.ok
    ? { status: 'publicado', link_externo: res.link_externo, id_externo: res.id_externo }
    : { status: 'erro', mensagem_erro: res.erro };
  await salvarResultado({ demo, lojaId, veiculo, canal, dados });
  return res.ok ? { ok: true, link_externo: res.link_externo } : { ok: false, erro: res.erro };
}

// Remove a publicação de um canal (no real, marca como despublicado).
export async function despublicarDeCanal({ demo, lojaId, veiculo, canal, pub }) {
  const res = await getConector(canal).despublicar({ ...pub, loja_id: lojaId });
  if (demo) {
    removerPublicacao(chaveDemo(veiculo), canal);
    return res;
  }
  await salvarResultado({
    demo, lojaId, veiculo, canal,
    dados: { status: 'despublicado', id_externo: pub?.id_externo, link_externo: null },
  });
  return res;
}
