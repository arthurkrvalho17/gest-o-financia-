import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { CANAIS_ANUNCIO } from '../../integracoes/canais';
import { montarAnuncio } from '../../integracoes/anuncioCanonico';
import { statusCanais, getPublicacoesDe, publicarEmCanal, despublicarDeCanal, atualizarStatusDe } from '../../integracoes/publicacoes';
import { useAuth } from '../../auth/AuthContext';

// "Publicar em / status por canal" — a UI que fica em cima da camada de conectores.
// Fluxo (ADR-09): enfileira → conector publica → grava link+status. Demo usa
// stores em memória; real usa canal_credencial + anuncio_publicacao.
export default function PublicarModal({ open, veiculo, config, onClose, onToast }) {
  const { demo, loja } = useAuth();
  const [pubs, setPubs] = useState({});
  const [conexoes, setConexoes] = useState({});
  const [emCurso, setEmCurso] = useState({}); // canal -> true enquanto publica

  useEffect(() => {
    if (!open || !veiculo) return;
    statusCanais({ demo, lojaId: loja?.id }).then(setConexoes);
    getPublicacoesDe({ demo, veiculo }).then(async (mapa) => {
      setPubs(mapa);
      // Canais com moderação assíncrona: reconsulta o desfecho ao abrir
      for (const [canal, pub] of Object.entries(mapa)) {
        if (pub?.status !== 'processando') continue;
        const novo = await atualizarStatusDe({ demo, lojaId: loja?.id, veiculo, canal, pub });
        setPubs((p) => ({ ...p, [canal]: novo }));
      }
    });
  }, [open, veiculo, demo, loja?.id]);

  if (!veiculo) return null;
  const anuncio = montarAnuncio(veiculo, config);

  async function publicar(canal, nome) {
    setEmCurso((e) => ({ ...e, [canal]: true }));
    setPubs((p) => ({ ...p, [canal]: { status: 'pendente' } }));
    const res = await publicarEmCanal({ demo, lojaId: loja?.id, veiculo, config, canal });
    const dados = res.ok
      ? { status: res.status || 'publicado', link_externo: res.link_externo }
      : { status: 'erro', mensagem_erro: res.erro };
    setPubs((p) => ({ ...p, [canal]: dados }));
    setEmCurso((e) => ({ ...e, [canal]: false }));
    onToast?.(
      !res.ok ? `Erro ao publicar no ${nome}: ${res.erro || ''}`
      : dados.status === 'processando' ? `Enviado ao ${nome} — em análise no portal`
      : `Publicado no ${nome}`,
    );
  }
  async function reconsultar(canal) {
    const novo = await atualizarStatusDe({ demo, lojaId: loja?.id, veiculo, canal, pub: pubs[canal] });
    setPubs((p) => ({ ...p, [canal]: novo }));
  }
  async function despublicar(canal, nome) {
    await despublicarDeCanal({ demo, lojaId: loja?.id, veiculo, canal, pub: pubs[canal] });
    setPubs((p) => { const n = { ...p }; delete n[canal]; return n; });
    onToast?.(`Despublicado do ${nome}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Publicar nos canais" maxWidth={520}>
      <div className="text-[12.5px] text-muted mb-3 leading-relaxed">
        <b className="text-navy">{anuncio.titulo}</b> · {veiculo.placa}<br />
        {anuncio.fotos.length} foto(s) · anúncio único que alimenta todos os canais.
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        {CANAIS_ANUNCIO.map((c) => {
          const conectado = conexoes[c.chave] === 'conectado';
          const expirado = conexoes[c.chave] === 'expirado';
          const pub = pubs[c.chave];
          const carregando = emCurso[c.chave];
          return (
            <div key={c.chave} className="flex items-center gap-3 px-3.5 py-3 border-b border-border last:border-b-0 odd:bg-[#FAFBFD]">
              <div className="w-7 h-7 rounded-md grid place-items-center flex-shrink-0 font-bold text-[11px]" style={{ background: c.cor, color: c.corTexto }}>{c.nome[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px]">{c.nome}</div>
                {pub?.status === 'publicado' && pub.link_externo
                  ? <a href={pub.link_externo} target="_blank" rel="noreferrer" className="text-[11.5px] text-blue hover:underline truncate block">{pub.link_externo}</a>
                  : pub?.status === 'processando'
                  ? <div className="text-[11px] text-muted-2">Enviado — aguardando a moderação do portal (o link aparece quando o anúncio for aceito)</div>
                  : pub?.status === 'erro' && pub.mensagem_erro
                  ? <div className="text-[11px] text-red truncate" title={pub.mensagem_erro}>{pub.mensagem_erro}</div>
                  : expirado
                  ? <div className="text-[11px] text-red">Conexão {c.nome} expirada — reconecte em Configurações &gt; Conexões</div>
                  : <div className="text-[11px] text-muted-2">{conectado ? 'Pronto para publicar' : 'Conecte este canal em Conexões'}</div>}
              </div>
              {carregando || pub?.status === 'pendente' ? (
                <span className="text-[11.5px] font-semibold text-amber bg-amber-soft px-2.5 py-1 rounded-md">Publicando…</span>
              ) : pub?.status === 'processando' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold text-amber bg-amber-soft px-2.5 py-1 rounded-md">Em análise</span>
                  <button onClick={() => reconsultar(c.chave)} className="text-[11.5px] font-semibold text-blue hover:underline">Atualizar</button>
                </div>
              ) : pub?.status === 'publicado' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-green bg-green-soft px-2 py-1 rounded-md">Publicado</span>
                  <button onClick={() => despublicar(c.chave, c.nome)} className="text-[11.5px] font-semibold text-red hover:underline">Remover</button>
                </div>
              ) : pub?.status === 'erro' ? (
                <button onClick={() => publicar(c.chave, c.nome)} className="text-[11.5px] font-semibold text-red border border-red-soft rounded-md px-2.5 py-1">Erro · tentar</button>
              ) : conectado ? (
                <button onClick={() => publicar(c.chave, c.nome)} className="text-[12px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-md px-3 py-1.5">Publicar</button>
              ) : expirado ? (
                <span className="text-[11px] font-semibold text-red bg-red-soft px-2.5 py-1 rounded-md">Expirada</span>
              ) : (
                <span className="text-[11px] font-semibold text-muted-2 bg-bg px-2.5 py-1 rounded-md">Desconectado</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-2 mt-3 leading-snug">
        Cada publicação é assíncrona (fila + status por canal). Editar o carro propaga a atualização; a venda dispara a despublicação.
      </p>
    </Modal>
  );
}
