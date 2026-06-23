import { useState } from 'react';
import Modal from '../../components/Modal';
import { fmtR } from '../../lib/format';

// Painel "Desempenho dos vendedores" (só dono). Minimizável + histórico mês a mês.
export default function DesempenhoVendedores({ desempenho }) {
  const [min, setMin] = useState(false);
  const [hist, setHist] = useState(false);

  const mesAtual = desempenho[0];
  const mesPassado = desempenho[1];
  const destaque = mesAtual?.vendedores[0];
  const destaquePassado = mesPassado?.vendedores[0];
  const totalVendas = mesAtual?.vendedores.reduce((s, v) => s + v.vendas, 0) || 0;
  const totalFat = mesAtual?.vendedores.reduce((s, v) => s + v.faturamento, 0) || 0;

  return (
    <div className="bg-white border border-border rounded-card shadow-card overflow-hidden mt-[18px]">
      <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-border">
        <h2 className="text-[14.5px] font-semibold flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px] text-blue"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></svg>
          Desempenho dos vendedores
        </h2>
        <div className="flex items-center gap-2">
          {!min && (
            <button onClick={() => setHist(true)} className="text-[12.5px] font-semibold text-blue hover:underline">Ver histórico</button>
          )}
          <button onClick={() => setMin((m) => !m)} className="text-[12px] font-semibold text-muted border border-border rounded-md px-2.5 py-1 hover:bg-bg">
            {min ? 'Expandir' : 'Minimizar'}
          </button>
        </div>
      </div>

      {!min && (
        <div className="grid grid-cols-3 gap-3.5 p-[18px] max-[1000px]:grid-cols-1">
          <Card titulo={`Destaque do mês`} tom="green">
            {destaque ? (
              <>
                <div className="text-[18px] font-bold text-navy">{destaque.nome}</div>
                <div className="text-[12px] text-muted mt-0.5">{destaque.vendas} vendas · {fmtR(destaque.faturamento)}</div>
              </>
            ) : <Vazio />}
          </Card>
          <Card titulo="Vendedor do mês passado" tom="blue">
            {destaquePassado ? (
              <>
                <div className="text-[18px] font-bold text-navy">{destaquePassado.nome}</div>
                <div className="text-[12px] text-muted mt-0.5">{destaquePassado.vendas} vendas · {fmtR(destaquePassado.faturamento)}</div>
              </>
            ) : <Vazio />}
          </Card>
          <Card titulo="Total vendido no mês" tom="amber">
            <div className="text-[22px] font-bold text-navy num">{totalVendas} <span className="text-[13px] font-semibold text-muted">carros</span></div>
            <div className="text-[12px] text-muted mt-0.5 num">{fmtR(totalFat)}</div>
          </Card>
        </div>
      )}

      <Modal open={hist} onClose={() => setHist(false)} title="Histórico de vendedores" maxWidth={560}>
        <div className="flex flex-col gap-4">
          {desempenho.length === 0 && <div className="text-center text-muted text-[13px] py-6">Sem dados ainda.</div>}
          {desempenho.map((m) => (
            <div key={m.mes}>
              <div className="text-[12px] font-bold text-muted uppercase tracking-[.04em] mb-2">{m.nome}</div>
              <div className="rounded-lg border border-border overflow-hidden">
                {m.vendedores.map((v, i) => (
                  <div key={v.nome} className="flex items-center justify-between px-3 py-2 text-[13px] odd:bg-[#FAFBFD] border-b border-border last:border-b-0">
                    <span className="flex items-center gap-2">
                      <span className={['w-5 h-5 rounded-full grid place-items-center text-[10.5px] font-bold', i === 0 ? 'bg-green-soft text-green' : 'bg-bg text-muted'].join(' ')}>{i + 1}</span>
                      {v.nome}
                    </span>
                    <span className="num text-muted">{v.vendas} vendas · {fmtR(v.faturamento)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Card({ titulo, tom, children }) {
  const tomCls = { green: 'bg-green-soft border-[#CDE8D6]', blue: 'bg-blue-soft border-[#D3E3F2]', amber: 'bg-amber-soft border-[#F0DEC4]' }[tom];
  return (
    <div className={['rounded-card border px-4 py-3.5', tomCls].join(' ')}>
      <div className="text-[12px] font-medium text-muted">{titulo}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
function Vazio() {
  return <div className="text-[13px] text-muted-2">Sem vendas no período</div>;
}
