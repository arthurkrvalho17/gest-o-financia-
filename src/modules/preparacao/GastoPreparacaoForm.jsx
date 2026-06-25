import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { parseBR } from '../../lib/format';

const gastoVazio = () => ({ descricao: '', valor: '', status: 'pendente', observacao: '' });

// Formulário único de gastos de preparação. Escolhe o carro UMA vez e lança
// vários gastos de uma só vez. Usado na Preparação e no Financeiro (fonte única).
export default function GastoPreparacaoForm({ open, veiculos, preVeiculoId, onClose, onSave }) {
  const [veiculoId, setVeiculoId] = useState('');
  const [gastos, setGastos] = useState([gastoVazio()]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (open) {
      setVeiculoId(preVeiculoId || '');
      setGastos([gastoVazio()]);
      setErro('');
    }
  }, [open, preVeiculoId]);

  const set = (i, k, v) => setGastos((arr) => arr.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  const addLinha = () => setGastos((arr) => [...arr, gastoVazio()]);
  const removeLinha = (i) => setGastos((arr) => (arr.length === 1 ? arr : arr.filter((_, j) => j !== i)));

  function salvar() {
    const veic = veiculos.find((v) => v.id === veiculoId);
    if (!veic) { setErro('Selecione o carro do estoque.'); return; }
    const validos = gastos.filter((g) => g.descricao.trim());
    if (validos.length === 0) { setErro('Descreva ao menos um gasto.'); return; }
    onSave(veic, validos.map((g) => ({
      descricao: g.descricao.trim(), valor: parseBR(g.valor), status: g.status, observacao: g.observacao.trim() || null,
    })));
  }

  const nValidos = gastos.filter((g) => g.descricao.trim()).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar gastos de preparação"
      maxWidth={560}
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>Cancelar</button>
          <button onClick={salvar} className="inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
            Salvar {nValidos > 1 ? `${nValidos} gastos` : 'gasto'}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 mb-4">
        <span className="text-[11.5px] font-semibold text-muted">Carro do estoque</span>
        <select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} disabled={!!preVeiculoId}
          className={['text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white', preVeiculoId ? 'opacity-70' : ''].join(' ')}>
          <option value="">— escolher o carro —</option>
          {veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo}{v.placa ? ` · ${v.placa}` : ''}</option>)}
        </select>
      </label>

      <div className="flex flex-col gap-3">
        {gastos.map((g, i) => (
          <div key={i} className="rounded-lg border border-border p-3 bg-[#FAFBFD]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-muted-2">Gasto {i + 1}</span>
              {gastos.length > 1 && <button onClick={() => removeLinha(i)} className="text-muted-2 hover:text-red text-[15px] leading-none">×</button>}
            </div>
            <input value={g.descricao} onChange={(e) => set(i, 'descricao', e.target.value)} placeholder="O que foi o gasto (revisão, pneus…)"
              className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full mb-2 bg-white" />
            <div className="grid grid-cols-2 gap-2">
              <input value={g.valor} onChange={(e) => set(i, 'valor', e.target.value)} placeholder="R$ 0,00"
                className="num text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white" />
              <div className="flex gap-1.5">
                {[['pago', 'Pago'], ['pendente', 'Pendente']].map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => set(i, 'status', v)}
                    className={['flex-1 text-[12px] font-bold py-2.5 rounded-lg', g.status === v ? (v === 'pago' ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber') : 'bg-white border border-border text-muted-2'].join(' ')}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <input value={g.observacao} onChange={(e) => set(i, 'observacao', e.target.value)} placeholder="Observação (opcional)"
              className="text-[13px] px-[11px] py-2 border border-border rounded-lg outline-none focus:border-blue w-full mt-2 bg-white" />
          </div>
        ))}
      </div>

      <button onClick={addLinha} className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-blue mt-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
        Adicionar outro gasto
      </button>

      {erro && <div className="text-[12.5px] text-red bg-red-soft rounded-lg px-3 py-2.5 mt-3">{erro}</div>}
      <p className="text-[11px] text-muted-2 mt-2">A data é registrada automaticamente. Tudo entra na ficha do carro e na despesa do mês.</p>
    </Modal>
  );
}
