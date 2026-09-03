import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { ddmm, hojeISO } from '../../lib/format';
import { TIPOS_DOC, labelTipoDoc, getDocs, addDoc, removeDoc } from './demoDocs';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { uploadDocVeiculo, deletarArquivo, urlAssinada } from '../../lib/storage';
import { useAuth } from '../../auth/AuthContext';

const STATUS = {
  anexado: { label: 'Anexado', cls: 'bg-blue-soft text-blue' },
  assinado: { label: 'Assinado', cls: 'bg-green-soft text-green' },
  pendente: { label: 'Aguardando assinatura', cls: 'bg-amber-soft text-amber' },
};

// Ficha de documentos do veículo — acessível com o carro à venda ou já vendido.
export default function FichaDocumentosModal({ open, veiculo, onClose, onToast }) {
  const demo = !supabaseConfigurado;
  const { loja } = useAuth();
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState('atpv_e');
  const [verDoc, setVerDoc] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open || !veiculo) return;
    if (demo) {
      setDocs([...getDocs(veiculo.codigo || veiculo.id)]);
      return;
    }
    carregarDocs();
  }, [open, veiculo]);

  async function carregarDocs() {
    setCarregando(true);
    const { data } = await supabase
      .from('veiculo_documento')
      .select('*')
      .eq('veiculo_id', veiculo.id)
      .order('data', { ascending: false });
    setDocs(data || []);
    setCarregando(false);
  }

  if (!veiculo) return null;

  async function anexar(file) {
    if (demo) {
      addDoc(veiculo.codigo || veiculo.id, { tipo, nome_arquivo: file?.name || labelTipoDoc(tipo) });
      setDocs([...getDocs(veiculo.codigo)]);
      onToast?.('Documento anexado à ficha do carro');
      return;
    }
    const lojaId = loja?.id;
    const { url, path, error } = await uploadDocVeiculo({ file, lojaId, veiculoId: veiculo.id });
    if (error) { onToast?.(`Erro no upload: ${error.message}`); return; }
    await supabase.from('veiculo_documento').insert({
      loja_id: lojaId,
      veiculo_id: veiculo.id,
      tipo,
      nome_arquivo: file.name,
      arquivo_url: url,
      arquivo_path: path,
      status: 'anexado',
      data: hojeISO(),
    });
    onToast?.('Documento anexado à ficha do carro');
    await carregarDocs();
  }

  async function excluir(doc) {
    if (demo) {
      removeDoc(veiculo.codigo || veiculo.id, doc.id || doc);
      setDocs([...getDocs(veiculo.codigo)]);
      return;
    }
    await supabase.from('veiculo_documento').delete().eq('id', doc.id);
    if (doc.arquivo_path) await deletarArquivo('docs-veiculos', doc.arquivo_path);
    setDocs((arr) => arr.filter((d) => d.id !== doc.id));
  }

  return (
    <Modal open={open} onClose={onClose} title="Ficha de documentos" maxWidth={520}>
      <div className="text-[12.5px] text-muted mb-3 leading-relaxed">
        <b className="text-navy">{veiculo.modelo}</b> · {veiculo.placa}<br />
        Tudo amarrado a este carro — antes e depois da venda.
      </div>

      <div className="rounded-lg border border-border overflow-hidden mb-3">
        {carregando && <div className="px-3.5 py-6 text-center text-muted-2 text-[12.5px]">Carregando…</div>}
        {!carregando && docs.length === 0 && <div className="px-3.5 py-6 text-center text-muted-2 text-[12.5px]">Nenhum documento anexado ainda.</div>}
        {docs.map((d) => {
          const st = STATUS[d.status] || STATUS.anexado;
          return (
            <div key={d.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 odd:bg-[#FAFBFD]">
              <button onClick={() => setVerDoc(d)} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80" title="Abrir documento">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-blue flex-shrink-0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[13px]">{labelTipoDoc(d.tipo)}</span>
                  <span className="block text-[11px] text-muted-2 truncate">{d.nome_arquivo || '—'} · {ddmm(d.data)}</span>
                </span>
              </button>
              <span className={['text-[10.5px] font-semibold px-2 py-[3px] rounded-md', st.cls].join(' ')}>{st.label}</span>
              <button onClick={() => excluir(d)} title="Remover" className="text-muted-2 hover:text-red hover:bg-red-soft rounded-md px-1.5 text-[15px] leading-none">×</button>
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
        Clique num documento para abrir. A ATPV-e é só guardada aqui — a transferência oficial é feita no Detran/gov.br, fora do sistema.
      </p>

      {/* Visualização do documento */}
      <Modal open={!!verDoc} onClose={() => setVerDoc(null)} title={verDoc ? labelTipoDoc(verDoc.tipo) : 'Documento'} maxWidth={520}>
        {verDoc && (
          <>
            <div className="rounded-lg border border-border bg-[#FAFBFD] aspect-[3/4] max-h-[55vh] grid place-items-center text-center p-6">
              <div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-blue mx-auto mb-3"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>
                <div className="font-semibold text-[14px] text-navy">{verDoc.nome_arquivo || labelTipoDoc(verDoc.tipo)}</div>
                <div className="text-[12px] text-muted mt-1">{labelTipoDoc(verDoc.tipo)} · {ddmm(verDoc.data)} · {(STATUS[verDoc.status] || STATUS.anexado).label}</div>
                {!demo && verDoc.arquivo_url && (
                  <div className="text-[11.5px] text-muted-2 mt-3 max-w-[320px] mx-auto leading-snug">
                    Clique em "Abrir" para ver o arquivo no Supabase Storage.
                  </div>
                )}
                {(demo || !verDoc.arquivo_url) && (
                  <div className="text-[11.5px] text-muted-2 mt-3 max-w-[320px] mx-auto leading-snug">
                    No app conectado, o arquivo (PDF/imagem) abre aqui direto do Supabase Storage.
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end mt-3 gap-2">
              {!demo && (verDoc.arquivo_path || verDoc.arquivo_url) && (
                <button
                  onClick={async () => {
                    // URL fresca a partir do path (a gravada no banco expira)
                    const url = await urlAssinada('docs-veiculos', verDoc.arquivo_path, verDoc.arquivo_url);
                    if (url) window.open(url, '_blank', 'noreferrer');
                  }}
                  className="text-[13px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-4 py-2.5">
                  Abrir
                </button>
              )}
              <button onClick={() => setVerDoc(null)} className="text-[13px] font-semibold text-navy bg-white border border-border rounded-lg px-4 py-2.5 hover:bg-bg">Fechar</button>
            </div>
          </>
        )}
      </Modal>
    </Modal>
  );
}
