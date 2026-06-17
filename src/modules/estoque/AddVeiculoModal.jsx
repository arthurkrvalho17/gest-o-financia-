import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { parseBR } from '../../lib/format';

const VAZIO = {
  codigo: '', modelo: '', fab_mod: '', cor: '', placa: '', renavam: '', tipo: 'proprio',
  compra: '', pedido: '', minimo: '', descricao: '',
};

export default function AddVeiculoModal({ open, ehDono = true, onClose, onSave }) {
  const [f, setF] = useState(VAZIO);
  const [fotos, setFotos] = useState([]); // {url, nome}
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (open) {
      setF(VAZIO);
      setFotos([]);
      setErro('');
      setAviso('');
    }
  }, [open]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function addFotos(fileList) {
    const novas = Array.from(fileList || []).map((file) => ({ url: URL.createObjectURL(file), nome: file.name }));
    setFotos((arr) => [...arr, ...novas]);
  }

  function salvar() {
    if (!f.modelo.trim()) {
      setErro('Informe ao menos o modelo do veículo.');
      return;
    }
    onSave({
      codigo: f.codigo.trim() || null,
      modelo: f.modelo.trim(),
      fab_mod: f.fab_mod.trim() || null,
      cor: f.cor.trim() || null,
      placa: f.placa.trim().toUpperCase() || null,
      renavam: f.renavam.trim() || null,
      tipo: f.tipo,
      compra: ehDono ? parseBR(f.compra) : 0,
      pedido: parseBR(f.pedido),
      minimo: ehDono ? parseBR(f.minimo) : 0,
      descricao: f.descricao.trim() || null,
      fotos: fotos.map((x, i) => ({ url: x.url, nome: x.nome, ordem: i })),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar veículo"
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>Cancelar</button>
          <button className="inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]" onClick={salvar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
            Confirmar e salvar
          </button>
        </>
      }
    >
      {/* Atalhos de preenchimento (opcionais) */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setAviso('Consulta por placa: integração em breve. Por enquanto, preencha manualmente.')}
          className="flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] font-semibold text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg py-2.5 hover:bg-[#dde9f6]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          Buscar pela placa
        </button>
        <label className="flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] font-semibold text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg py-2.5 hover:bg-[#dde9f6] cursor-pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
          Enviar CRLV-e (PDF)
          <input type="file" accept="application/pdf" className="hidden" onChange={() => setAviso('Leitura do CRLV-e: integração em breve. Por enquanto, preencha manualmente.')} />
        </label>
      </div>
      {aviso && <div className="text-[12px] text-amber bg-amber-soft rounded-lg px-3 py-2.5 mb-3 -mt-1">{aviso}</div>}

      <div className="grid grid-cols-2 gap-3">
        <F label="Modelo" full><I v={f.modelo} on={(v) => set('modelo', v)} ph="Ex: Corolla GLI Flex" /></F>
        <F label="Placa"><I v={f.placa} on={(v) => set('placa', v)} ph="ABC1D23" /></F>
        <F label="RENAVAM"><I v={f.renavam} on={(v) => set('renavam', v)} ph="00000000000" /></F>
        <F label="Fab/Modelo"><I v={f.fab_mod} on={(v) => set('fab_mod', v)} ph="2021/2022" /></F>
        <F label="Cor"><I v={f.cor} on={(v) => set('cor', v)} ph="Prata" /></F>
        <F label="Código"><I v={f.codigo} on={(v) => set('codigo', v)} ph="opcional" /></F>
        <F label="Tipo">
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white">
            <option value="proprio">Próprio</option>
            <option value="consignado">Consignado</option>
          </select>
        </F>
        {ehDono && <F label={f.tipo === 'consignado' ? 'Repasse ao dono' : 'Valor de compra'}><I v={f.compra} on={(v) => set('compra', v)} ph="R$ 0,00" cls="num" /></F>}
        <F label="Valor pedido (anúncio)"><I v={f.pedido} on={(v) => set('pedido', v)} ph="R$ 0,00" cls="num" /></F>
        {ehDono && <F label="Valor mínimo de venda"><I v={f.minimo} on={(v) => set('minimo', v)} ph="R$ 0,00" cls="num" /></F>}
        <F label="Descrição do anúncio" full>
          <textarea value={f.descricao} onChange={(e) => set('descricao', e.target.value)} rows={2} placeholder="Único dono, revisões em dia, pneus novos…"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full resize-y" />
        </F>
      </div>

      {/* Fotos */}
      <div className="mt-3.5">
        <label className="text-[11.5px] font-semibold text-muted">Fotos do carro</label>
        <div className="mt-1.5 flex flex-wrap gap-2 items-center">
          {fotos.map((foto, i) => (
            <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-border relative group">
              <img src={foto.url} alt={foto.nome} className="w-full h-full object-cover" />
              <button onClick={() => setFotos((arr) => arr.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 bg-navy/70 text-white w-4 h-4 rounded grid place-items-center text-[11px] leading-none">×</button>
            </div>
          ))}
          <label className="w-16 h-16 rounded-lg border border-dashed border-border grid place-items-center text-muted-2 hover:border-blue hover:text-blue cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M12 5v14M5 12h14" /></svg>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFotos(e.target.files)} />
          </label>
        </div>
      </div>

      {erro && <div className="text-[12.5px] text-red bg-red-soft rounded-lg px-3 py-2.5 mt-3">{erro}</div>}
    </Modal>
  );
}

function F({ label, full, children }) {
  return (
    <div className={['flex flex-col gap-1.5', full ? 'col-span-2' : ''].join(' ')}>
      <label className="text-[11.5px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}
function I({ v, on, ph, cls = '' }) {
  return (
    <input value={v} onChange={(e) => on(e.target.value)} placeholder={ph}
      className={`${cls} text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full`} />
  );
}
