import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { parseBR } from '../../lib/format';

const VAZIO = {
  codigo: '', modelo: '', fab_mod: '', cor: '', placa: '', tipo: 'proprio',
  compra: '', pedido: '', minimo: '',
};

export default function AddVeiculoModal({ open, onClose, onSave }) {
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (open) {
      setF(VAZIO);
      setErro('');
    }
  }, [open]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

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
      tipo: f.tipo,
      compra: parseBR(f.compra),
      pedido: parseBR(f.pedido),
      minimo: parseBR(f.minimo),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar veículo"
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]"
            onClick={salvar}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Confirmar e salvar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <F label="Modelo" full><I v={f.modelo} on={(v) => set('modelo', v)} ph="Ex: Corolla GLI Flex" /></F>
        <F label="Código"><I v={f.codigo} on={(v) => set('codigo', v)} ph="opcional" /></F>
        <F label="Fab/Modelo"><I v={f.fab_mod} on={(v) => set('fab_mod', v)} ph="2021/2022" /></F>
        <F label="Cor"><I v={f.cor} on={(v) => set('cor', v)} ph="Prata" /></F>
        <F label="Placa"><I v={f.placa} on={(v) => set('placa', v)} ph="ABC1D23" /></F>
        <F label="Tipo" full>
          <select
            value={f.tipo}
            onChange={(e) => set('tipo', e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white"
          >
            <option value="proprio">Próprio</option>
            <option value="consignado">Consignado</option>
          </select>
        </F>
        <F label="Valor de compra"><I v={f.compra} on={(v) => set('compra', v)} ph="R$ 0,00" cls="num" /></F>
        <F label="Valor pedido (anúncio)"><I v={f.pedido} on={(v) => set('pedido', v)} ph="R$ 0,00" cls="num" /></F>
        <F label="Valor mínimo de venda" full><I v={f.minimo} on={(v) => set('minimo', v)} ph="R$ 0,00" cls="num" /></F>
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
    <input
      value={v}
      onChange={(e) => on(e.target.value)}
      placeholder={ph}
      className={`${cls} text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full`}
    />
  );
}
