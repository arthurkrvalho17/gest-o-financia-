import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { MODELOS } from './modelos';

// Visualiza/edita um modelo. Sempre mantém Padrão FINANCIA+ × Seu modelo (editado).
export default function ModeloModal({ open, tipo, ct, onClose, onToast }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');

  useEffect(() => { if (open) { setEditando(false); setTexto(''); } }, [open, tipo]);
  if (!tipo) return null;

  const info = ct.modeloInfo(tipo);
  const temEditado = !!info.conteudoEditado;
  const origem = info.origem;
  const conteudo = ct.conteudoAtivoDe(tipo);

  function comecarEdicao() {
    setTexto(ct.conteudoAtivoDe(tipo));
    setEditando(true);
  }
  function salvar() {
    ct.salvarModeloEditado(tipo, texto);
    setEditando(false);
    onToast?.('Seu modelo salvo — o padrão FINANCIA+ continua disponível');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={MODELOS[tipo]?.nome || 'Modelo'}
      maxWidth={680}
      footer={
        editando ? (
          <>
            <button className="text-[12.5px] text-blue font-medium" onClick={() => setEditando(false)}>Cancelar</button>
            <button onClick={salvar} className="bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]">Salvar como meu modelo</button>
          </>
        ) : (
          <>
            <label className="text-[12.5px] font-semibold text-blue cursor-pointer">
              Enviar modelo próprio
              <input type="file" accept=".doc,.docx,.pdf" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) { ct.enviarModeloProprio(tipo, e.target.files[0]); onToast?.('Modelo próprio enviado'); } }} />
            </label>
            <button onClick={comecarEdicao} className="bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]">
              Editar como meu modelo
            </button>
          </>
        )
      }
    >
      {/* Alternância de versões */}
      {!editando && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button onClick={() => ct.definirOrigemModelo(tipo, 'padrao')}
            className={['text-[12px] font-semibold px-3 py-1.5 rounded-lg border', origem === 'padrao' ? 'bg-blue text-white border-blue' : 'bg-white border-border text-muted'].join(' ')}>
            Padrão FINANCIA+
          </button>
          <button onClick={() => temEditado && ct.definirOrigemModelo(tipo, 'editado')} disabled={!temEditado}
            className={['text-[12px] font-semibold px-3 py-1.5 rounded-lg border', origem === 'editado' ? 'bg-blue text-white border-blue' : temEditado ? 'bg-white border-border text-muted' : 'bg-bg border-border text-muted-2 cursor-not-allowed'].join(' ')}>
            Seu modelo (editado)
          </button>
          {(temEditado || origem === 'enviado') && (
            <button onClick={() => { ct.voltarPadraoModelo(tipo); onToast?.('Voltou ao padrão FINANCIA+'); }}
              className="text-[12px] font-semibold text-red hover:underline ml-auto">Voltar ao padrão</button>
          )}
        </div>
      )}

      {origem === 'enviado' && !editando && (
        <div className="text-[12px] text-green bg-green-soft rounded-lg px-3 py-2 mb-3">
          Usando seu arquivo enviado: <b>{info.arquivoEnviado?.nome}</b>. Abaixo, o texto padrão como referência.
        </div>
      )}

      {editando ? (
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={16}
          className="w-full text-[12.5px] font-mono leading-relaxed px-3 py-3 border border-border rounded-lg outline-none focus:border-blue resize-y" />
      ) : (
        <pre className="text-[12px] leading-relaxed whitespace-pre-wrap bg-[#FAFBFD] border border-border rounded-lg p-4 max-h-[50vh] overflow-y-auto text-navy font-sans">{conteudo}</pre>
      )}

      <p className="text-[11px] text-muted-2 mt-2.5 leading-snug">
        Os campos entre <code>{'{{ }}'}</code> são preenchidos automaticamente na geração (cliente, veículo, valores).
        O <b>Padrão FINANCIA+</b> nunca é alterado — se você editar, a responsabilidade pela alteração é sua.
      </p>
    </Modal>
  );
}
