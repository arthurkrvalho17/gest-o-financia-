import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { parseBR } from '../../lib/format';

// Formulário único de gasto de preparação. O gasto SEMPRE pertence a um carro.
// Usado em dois lugares (Preparação e Financeiro) — fonte única.
export default function GastoPreparacaoForm({ open, veiculos, preVeiculoId, onClose, onSave }) {
  const [f, setF] = useState({ veiculo_id: '', descricao: '', valor: '', status: 'pendente', observacao: '' });
  const [erro, setErro] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (open) {
      setF({ veiculo_id: preVeiculoId || '', descricao: '', valor: '', status: 'pendente', observacao: '' });
      setErro('');
    }
  }, [open, preVeiculoId]);

  function salvar() {
    const veic = veiculos.find((v) => v.id === f.veiculo_id);
    if (!veic) { setErro('Selecione o carro do estoque.'); return; }
    if (!f.descricao.trim()) { setErro('Descreva o gasto.'); return; }
    onSave(veic, {
      descricao: f.descricao.trim(),
      valor: parseBR(f.valor),
      status: f.status,
      observacao: f.observacao.trim() || null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar gasto de preparação"
      maxWidth={460}
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>Cancelar</button>
          <button onClick={salvar} className="inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
            Salvar gasto
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Campo label="Carro do estoque">
          <select value={f.veiculo_id} onChange={(e) => set('veiculo_id', e.target.value)} disabled={!!preVeiculoId}
            className={['text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white', preVeiculoId ? 'opacity-70' : ''].join(' ')}>
            <option value="">— escolher o carro —</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo}{v.placa ? ` · ${v.placa}` : ''}</option>)}
          </select>
        </Campo>
        <Campo label="O que foi o gasto">
          <input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Ex: revisão, pneus, funilaria, polimento"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor">
            <input value={f.valor} onChange={(e) => set('valor', e.target.value)} placeholder="R$ 0,00"
              className="num text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
          </Campo>
          <Campo label="Status">
            <div className="flex gap-1.5">
              {[['pago', 'Pago'], ['pendente', 'Pendente']].map(([v, lbl]) => (
                <button key={v} onClick={() => set('status', v)} type="button"
                  className={['flex-1 text-[12px] font-bold py-2.5 rounded-lg', f.status === v ? (v === 'pago' ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber') : 'bg-bg text-muted-2'].join(' ')}>
                  {lbl}
                </button>
              ))}
            </div>
          </Campo>
        </div>
        <Campo label="Observação (opcional)">
          <textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} rows={2} placeholder="Ex: oficina do Zé, garantia de 90 dias…"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full resize-y" />
        </Campo>
        {erro && <div className="text-[12.5px] text-red bg-red-soft rounded-lg px-3 py-2.5">{erro}</div>}
        <p className="text-[11px] text-muted-2">A data é registrada automaticamente (hoje). Este gasto entra na ficha de preparação do carro e na despesa do mês.</p>
      </div>
    </Modal>
  );
}

function Campo({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
