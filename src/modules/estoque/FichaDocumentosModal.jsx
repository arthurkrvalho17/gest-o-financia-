import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { ddmm } from '../../lib/format';
import { TIPOS_DOC, labelTipoDoc, getDocs, addDoc, removeDoc } from './demoDocs';

const STATUS = {
  anexado: { label: 'Anexado', cls: 'bg-blue-soft text-blue' },
  assinado: { label: 'Assinado', cls: 'bg-green-soft text-green' },
  pendente: { label: 'Aguardando assinatura', cls: 'bg-amber-soft text-amber' },
};

// Ficha de documentos do veículo — acessível com o carro à venda ou já vendido.
export default function FichaDocumentosModal({ open, veiculo, onClose, onToast }) {
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState('atpv_e');

  useEffect(() => {
    if (open && veiculo) setDocs([...getDocs(veiculo.codigo)]);
  }, [open, veiculo]);

  if (!veiculo) return null;

  function anexar(file) {
    addDoc(veiculo.codigo, { tipo, nome_arquivo: file?.name || labelTipoDoc(tipo) });
    setDocs([...getDocs(veiculo.codigo)]);
    onToast?.('Documento anexado à ficha do carro');
  }
  function excluir(id) {
    removeDoc(veiculo.codigo, id);
    setDocs([...getDocs(veiculo.codigo)]);
  }

  return (
    <Modal open={open} onClose={onClose} title="Ficha de documentos" maxWidth={520}>
      <div className="text-[12.5px] text-muted mb-3 leading-relaxed">
        <b className="text-navy">{veiculo.modelo}</b> · {veiculo.placa}<br />
        Tudo amarrado a este carro — antes e depois da venda.
      </div>

      <div className="rounded-lg border border-border overflow-hidden mb-3">
        {docs.length === 0 && <div className="px-3.5 py-6 text-center text-muted-2 text-[12.5px]">Nenhum documento anexado ainda.</div>}
        {docs.map((d) => {
          const st = STATUS[d.status] || STATUS.anexado;
          return (
            <div key={d.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 odd:bg-[#FAFBFD]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-blue flex-shrink-0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px]">{labelTipoDoc(d.tipo)}</div>
                <div className="text-[11px] text-muted-2 truncate">{d.nome_arquivo || '—'} · {ddmm(d.data)}</div>
              </div>
              <span className={['text-[10.5px] font-semibold px-2 py-[3px] rounded-md', st.cls].join(' ')}>{st.label}</span>
              <button onClick={() => excluir(d.id)} className="text-muted-2 hover:text-red hover:bg-red-soft rounded-md px-1.5 text-[15px] leading-none">×</button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="flex-1 text-[13px] px-3 py-2.5 border border-border rounded-lg outline-none focus:border-blue bg-white">
          {TIPOS_DOC.map((t) => <option key={t.chave} value={t.chave}>{t.label}</option>)}
        </select>
        <label className="text-[13px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-4 py-2.5 cursor-pointer whitespace-nowrap">
          Anexar
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && anexar(e.target.files[0])} />
        </label>
      </div>
      <p className="text-[11px] text-muted-2 mt-2.5 leading-snug">
        A ATPV-e é só guardada aqui — a transferência oficial é feita no Detran/gov.br, fora do sistema.
      </p>
    </Modal>
  );
}
