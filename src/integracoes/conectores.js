import { conectorOlx } from './olx/conectorOlx';
import { conectorML } from './mercado_livre/conectorML';
import { conectorWebmotors } from './webmotors/conectorWebmotors';
import { conectorRenave } from './renave/conectorRenave';
import { supabaseConfigurado } from '../lib/supabase';

// Camada de conectores (adapters) por canal.
//
// Todo canal implementa a MESMA interface — trocar/adicionar canal = adicionar
// um adapter, sem mexer no resto do sistema. Um agregador (que conecta vários
// portais por uma API só) é apenas mais um conector aqui.
//
//   interface Conector {
//     publicar(anuncio): Promise<{ ok, id_externo, link_externo, erro }>
//     atualizar(anuncio, pub): Promise<...>
//     despublicar(pub): Promise<...>
//     consultarStatus(pub): Promise<{ status }>
//   }
//
// Mock: simulam latência e sucesso (usado no demo e para canais sem homologação).
// Real: busca credenciais no Supabase e chama a API externa.

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function criarConectorMock(canal) {
  const base = `https://exemplo.${canal}.com/anuncio`;
  return {
    canal,
    async publicar(_anuncio) {
      await espera(700);
      const id = canal.slice(0, 3).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8);
      return { ok: true, id_externo: id, link_externo: `${base}/${id}` };
    },
    async atualizar(_anuncio, pub) {
      await espera(500);
      return { ok: true, id_externo: pub.id_externo, link_externo: pub.link_externo };
    },
    async despublicar() {
      await espera(400);
      return { ok: true };
    },
    async consultarStatus(pub) {
      await espera(200);
      return { status: pub.status };
    },
  };
}

// Registry: chave do canal -> conector REAL. Troque o mock pelo adapter real
// conforme cada canal for homologado. No demo (sem Supabase), todo canal usa
// mock — os conectores reais dependem do Supabase para credenciais/proxy.
const registry = {
  mercado_livre: conectorML,
  olx: conectorOlx,
  webmotors: conectorWebmotors,
};

const mocks = {};
const mockDe = (canal) => (mocks[canal] ||= criarConectorMock(canal));

export function getConector(canal) {
  if (!supabaseConfigurado) return mockDe(canal);
  return registry[canal] || mockDe(canal);
}

// Adapter de mensageria (WhatsApp e, no futuro, outros canais do inbox).
function criarMensageriaMock(canal) {
  return {
    canal,
    async enviar(_conversa, _texto, tipo = 'texto') {
      await espera(400);
      return { ok: true, id_externo: 'msg-' + Math.random().toString(36).slice(2, 8), tipo };
    },
  };
}
const registryMensageria = { whatsapp: criarMensageriaMock('whatsapp') };
export function getConectorMensageria(canal) {
  return registryMensageria[canal] || criarMensageriaMock(canal);
}

// Estoque legal (RENAVE) — interface própria (sincronizarCliente/Veiculo,
// enviarChaveNfe*, consultarStatus, baixarDocumento), diferente da de
// publicação/anúncio. Sem mock: Fase B (Edge Function renave-api) ainda não
// existe — usar fora do modo real não tem sentido nesta fase.
const registryEstoqueLegal = { renave: conectorRenave };
export function getConectorEstoqueLegal(canal) {
  return registryEstoqueLegal[canal] || null;
}
