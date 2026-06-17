import { useState } from 'react';
import { Topbar } from '../../components/Layout';
import { brl, fmt } from '../../lib/format';
import { usePreparacao } from './usePreparacao';
import { FORMAS_PGTO } from './demoPrep';

const ahVendaSit = ['estoque', 'reservado'];
const vendidoSit = ['vendido', 'repasse'];

export default function PreparacaoPage() {
  const prep = usePreparacao();
  const [mode, setMode] = useState('venda');
  const [alvo, setAlvo] = useState(null); // veículo aberto

  if (alvo) return <DetalheCarro prep={prep} veic={alvo} onVoltar={() => setAlvo(null)} />;

  const lista = prep.veiculos.filter((v) =>
    (mode === 'venda' ? ahVendaSit : vendidoSit).includes(v.situacao)
  );

  return (
    <>
      <Topbar titulo="Preparação" sub="Gastos de preparação de cada carro" />
      <div className="px-7 py-6 max-w-[1240px]">
        {prep.demo && <DemoBanner />}

        <div className="inline-flex bg-bg border border-border rounded-[9px] p-[3px] gap-0.5 mb-[18px]">
          <Seg on={mode === 'venda'} onClick={() => setMode('venda')}>Carros à venda</Seg>
          <Seg on={mode === 'vendidos'} onClick={() => setMode('vendidos')}>Carros já vendidos</Seg>
        </div>

        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-border">
            <h2 className="text-[14.5px] font-semibold">Selecione o carro</h2>
            <span className="text-[12px] text-muted-2">clique para lançar os gastos de preparação</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>Cód</Th><Th>Modelo</Th><Th>Fab/Mod</Th><Th>Placa</Th>
                  <Th r>Itens</Th><Th r>Gasto em preparação</Th><Th>Situação</Th><Th>{''}</Th>
                </tr>
              </thead>
              <tbody>
                {prep.loading && (
                  <tr><td colSpan={8} className="px-[14px] py-10 text-center text-muted">Carregando…</td></tr>
                )}
                {!prep.loading && lista.length === 0 && (
                  <tr><td colSpan={8} className="px-[14px] py-10 text-center text-muted">Nenhum carro {mode === 'venda' ? 'à venda' : 'vendido'}.</td></tr>
                )}
                {!prep.loading && lista.map((v) => {
                  const itens = prep.gastosDe(v);
                  const total = prep.totalDe(v);
                  const pend = itens.some((x) => x.status !== 'pago');
                  const sit = mode === 'vendidos'
                    ? { label: 'Vendido', cls: 'bg-[#EEF2F7] text-muted' }
                    : itens.length === 0
                      ? { label: 'Sem lançamentos', cls: 'bg-green-soft text-green' }
                      : pend
                        ? { label: 'Em preparo', cls: 'bg-amber-soft text-amber' }
                        : { label: 'Pronto', cls: 'bg-green-soft text-green' };
                  return (
                    <tr key={v.id} className="cursor-pointer hover:bg-blue-soft" onClick={() => setAlvo(v)}>
                      <Td className="num text-muted font-semibold">{v.codigo || '—'}</Td>
                      <Td><span className="text-blue font-semibold">{v.modelo}</span></Td>
                      <Td className="num">{v.fab_mod || '—'}</Td>
                      <Td className="num">{v.placa || '—'}</Td>
                      <Td r className="num">{itens.length}</Td>
                      <Td r className="num font-medium">{fmt(total)}</Td>
                      <Td><span className={['text-[11px] font-semibold px-2.5 py-[3px] rounded-full', sit.cls].join(' ')}>{sit.label}</span></Td>
                      <Td><span className="text-blue font-semibold text-[12px] whitespace-nowrap">Abrir ▸</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function DetalheCarro({ prep, veic, onVoltar }) {
  const itens = prep.gastosDe(veic);
  const total = prep.totalDe(veic);

  return (
    <>
      <Topbar titulo="Preparação" sub={`${veic.modelo} · ${veic.placa || ''}`} />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="flex items-center gap-3.5 mb-[18px]">
          <button onClick={onVoltar} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Voltar
          </button>
          <div>
            <h2 className="text-[17px] font-bold">{veic.modelo}</h2>
            <div className="text-[12px] text-muted">{[veic.fab_mod, veic.placa, veic.cor].filter(Boolean).join(' · ')}</div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>#</Th><Th>Descrição do gasto</Th><Th>Data</Th><Th>Forma de pgto</Th>
                  <Th r>Valor (R$)</Th><Th center>Status</Th><Th>Observações</Th><Th>{''}</Th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && (
                  <tr><td colSpan={8} className="px-[14px] py-8 text-center text-muted">Sem gastos lançados. Use "Adicionar gasto".</td></tr>
                )}
                {itens.map((x, i) => (
                  <tr key={x.id} className="border-b border-border">
                    <SheetTd className="num text-muted-2">{i + 1}</SheetTd>
                    <SheetTd>
                      <CellInput value={x.descricao} onChange={(v) => prep.updateGasto(veic, x, { descricao: v })} placeholder="Descrição" />
                    </SheetTd>
                    <SheetTd>
                      <input type="date" value={x.data || ''} onChange={(e) => prep.updateGasto(veic, x, { data: e.target.value || null })}
                        className="text-[13px] bg-transparent outline-none focus:bg-blue-soft rounded px-1 py-1 w-[140px]" />
                    </SheetTd>
                    <SheetTd>
                      <select value={x.forma_pgto || ''} onChange={(e) => prep.updateGasto(veic, x, { forma_pgto: e.target.value })}
                        className="text-[13px] bg-transparent outline-none focus:bg-blue-soft rounded px-1 py-1 cursor-pointer">
                        <option value="">—</option>
                        {FORMAS_PGTO.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </SheetTd>
                    <SheetTd r>
                      <input type="number" step="0.01" value={x.valor ?? 0}
                        onChange={(e) => prep.updateGasto(veic, x, { valor: parseFloat(e.target.value) || 0 })}
                        className="num text-[13px] font-semibold text-right bg-transparent outline-none focus:bg-blue-soft rounded px-1 py-1 w-[100px]" />
                    </SheetTd>
                    <SheetTd center>
                      <button onClick={() => prep.updateGasto(veic, x, { status: x.status === 'pago' ? 'pendente' : 'pago' })}
                        className={['text-[10.5px] font-bold py-[5px] rounded-md w-[88px]', x.status === 'pago' ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber'].join(' ')}>
                        {x.status === 'pago' ? 'PAGO' : 'PENDENTE'}
                      </button>
                    </SheetTd>
                    <SheetTd>
                      <CellInput value={x.observacoes} onChange={(v) => prep.updateGasto(veic, x, { observacoes: v })} placeholder="—" />
                    </SheetTd>
                    <SheetTd>
                      <button onClick={() => prep.delGasto(veic, x)} aria-label="remover"
                        className="text-muted-2 hover:text-red hover:bg-red-soft rounded-md px-[7px] text-[17px] leading-none">×</button>
                    </SheetTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-[18px] py-3.5 bg-bg flex-wrap gap-3">
            <button onClick={() => prep.addGasto(veic)} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
              Adicionar gasto
            </button>
            <div className="text-[13px] text-muted font-semibold flex items-center gap-2.5">
              Total em preparação <b className="text-[19px] text-navy font-extrabold num">{brl(total)}</b>
            </div>
          </div>
        </div>

        <div className="text-[11.5px] text-blue bg-blue-soft rounded-lg px-[18px] py-2.5 mt-3.5 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
          Cada gasto já entra na despesa do mês e é abatido no lucro deste carro, sozinho.
        </div>
      </div>
    </>
  );
}

/* ---- UI ---- */
function DemoBanner() {
  return (
    <div className="mb-4 text-[12px] text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-2 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-blue inline-block" />
      Modo demonstração. Configure o Supabase no <code>.env.local</code> para dados reais.
    </div>
  );
}
function Seg({ on, onClick, children }) {
  return (
    <button onClick={onClick} className={['px-4 py-1.5 rounded-[7px] text-[13px] font-semibold transition', on ? 'bg-white text-blue shadow-[0_1px_3px_rgba(10,22,40,.08)]' : 'text-muted'].join(' ')}>
      {children}
    </button>
  );
}
function Th({ children, r, center }) {
  return <th className={['font-semibold text-muted text-[11.5px] uppercase tracking-[.04em] px-[14px] py-[11px] border-b border-border whitespace-nowrap', r ? 'text-right' : center ? 'text-center' : 'text-left'].join(' ')}>{children}</th>;
}
function Td({ children, r, className = '' }) {
  return <td className={['px-[14px] py-[13px] border-b border-border align-middle whitespace-nowrap', r ? 'text-right' : '', className].join(' ')}>{children}</td>;
}
function SheetTd({ children, r, center, className = '' }) {
  return <td className={['px-3 py-2 align-middle', r ? 'text-right' : center ? 'text-center' : '', className].join(' ')}>{children}</td>;
}
function CellInput({ value, onChange, placeholder }) {
  return (
    <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="text-[13px] bg-transparent outline-none focus:bg-blue-soft rounded px-1 py-1 w-full text-navy placeholder:text-muted-2" />
  );
}
