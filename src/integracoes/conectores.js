// Camada de conectores (adapters) por canal.
//
// Todo canal implementa a MESMA interface — trocar/adicionar canal = adicionar
// um adapter, sem mexer no resto do sistema. Um agregador (que conecta vários
// portais por uma API só) é apenas mais um conector aqui.
//
//   interface Conector {
//     publicar(anuncio, credenciais): Promise<{ ok, id_externo, link_externo, erro }>
//     atualizar(anuncio, pub, credenciais): Promise<...>
//     despublicar(pub, credenciais): Promise<...>
//     consultarStatus(pub, credenciais): Promise<{ status }>
//   }
//
// Por enquanto todos são MOCK (simulam latência e sucesso). Quando a credencial/
// homologação de cada canal ficar pronta, troca-se o mock pelo adapter real —
// nada mais no app precisa mudar.

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function criarConectorMock(canal) {
  const base = `https://exemplo.${canal}.com/anuncio`;
  return {
    canal,
    async publicar(anuncio) {
      await espera(700);
      const id = canal.slice(0, 3).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8);
      return { ok: true, id_externo: id, link_externo: `${base}/${id}` };
    },
    async atualizar(anuncio, pub) {
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

// Registry: chave do canal -> conector. Hoje tudo mock; troque por adapters reais
// (ex.: conectorMercadoLivre) conforme cada um for homologado.
const registry = {
  mercado_livre: criarConectorMock('mercado_livre'),
  olx: criarConectorMock('olx'),
  webmotors: criarConectorMock('webmotors'),
  instagram: criarConectorMock('instagram'),
  agregador: criarConectorMock('agregador'),
};

export function getConector(canal) {
  return registry[canal] || criarConectorMock(canal);
}

// Adapter de mensageria (WhatsApp e, no futuro, outros canais do inbox).
function criarMensageriaMock(canal) {
  return {
    canal,
    async enviar(conversa, texto, tipo = 'texto') {
      await espera(400);
      return { ok: true, id_externo: 'msg-' + Math.random().toString(36).slice(2, 8), tipo };
    },
  };
}
const registryMensageria = { whatsapp: criarMensageriaMock('whatsapp') };
export function getConectorMensageria(canal) {
  return registryMensageria[canal] || criarMensageriaMock(canal);
}
