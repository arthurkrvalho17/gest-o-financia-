import { useState } from 'react';
import { Topbar } from '../../components/Layout';
import { brl } from '../../lib/format';
import LembreteModal from './LembreteModal';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../auth/AuthContext';
import NotaFiscalCell from '../../components/NotaFiscalCell';
import { prepararNota } from '../../lib/notaFiscal';

const BellIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 01-3.4 0" />
  </svg>
);

// Planilha editável de uma categoria de despesa (fixa | outra) de um mês.
export default function DespesaSheet({ fin, mes, mesNome, categoria, onVoltar }) {
  const toast = useToast();
  const { usuario } = useAuth();
  const [lembreteAlvo, setLembreteAlvo] = useState(null);
  const itens = fin.despesasDe(mes, categoria);
  const total = fin.totalDespesas(mes, categoria);
  const titulo = categoria === 'fixa' ? 'Despesas fixas' : 'Outras despesas';

  const up = (item, patch) => fin.updateDespesa(mes, categoria, item, patch);

  async function anexarNota(item, file) {
    const r = await prepararNota({ file, demo: fin.demo, lojaId: usuario?.loja_id, ref: item.id });
    if (r.error) { toast('Erro ao anexar nota: ' + r.error.message); return; }
    await up(item, { nota_fiscal_url: r.url, nota_fiscal_tipo: r.tipo, nota_fiscal_path: r.path || null });
    toast('Nota fiscal anexada');
  }

  function salvarLembrete(dia, hora) {
    up(lembreteAlvo, { lembrete_ativo: true, lembrete_dia: dia, lembrete_hora: hora });
    setLembreteAlvo(null);
    toast(`Lembrete ativado · dia ${dia} às ${hora}`);
  }
  function removerLembrete() {
    up(lembreteAlvo, { lembrete_ativo: false, lembrete_dia: null, lembrete_hora: null });
    setLembreteAlvo(null);
    toast('Lembrete removido');
  }

  return (
    <>
      <Topbar titulo="Financeiro" sub={`${titulo} · ${mesNome}`} />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="flex items-center gap-3.5 mb-[18px]">
          <button onClick={onVoltar} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Voltar
          </button>
          <div>
            <h2 className="text-[17px] font-bold">{titulo}</h2>
            <div className="text-[12px] text-muted">Mês de referência: {mesNome}</div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#F4F7FB]">
                  <Th>#</Th><Th>Descrição</Th><Th>Vencimento</Th><Th center>Lembrete</Th>
                  <Th r>Valor (R$)</Th><Th center>Status</Th><Th>Data pgto.</Th><Th>Observações</Th><Th center>Nota fiscal</Th><Th>{''}</Th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && (
                  <tr><td colSpan={10} className="px-[14px] py-8 text-center text-muted">Sem lançamentos. Use "Adicionar despesa".</td></tr>
                )}
                {itens.map((x, i) => (
                  <tr key={x.id} className="odd:bg-[#FAFBFD] hover:bg-blue-soft/50">
                    <SheetTd className="num text-muted-2">{i + 1}</SheetTd>
                    <SheetTd><Cell value={x.descricao} onChange={(v) => up(x, { descricao: v })} placeholder="Descrição" /></SheetTd>
                    <SheetTd><Cell value={x.vencimento} onChange={(v) => up(x, { vencimento: v })} placeholder="—" w="120px" /></SheetTd>
                    <SheetTd center>
                      <button onClick={() => setLembreteAlvo(x)} title={x.lembrete_ativo ? `Lembrete dia ${x.lembrete_dia} às ${x.lembrete_hora}` : 'Definir lembrete'}
                        className={['p-1 rounded-md', x.lembrete_ativo ? 'text-blue' : 'text-muted-2 hover:text-muted'].join(' ')}>
                        <BellIcon className="w-4 h-4" />
                      </button>
                    </SheetTd>
                    <SheetTd r>
                      <input type="number" step="0.01" value={x.valor ?? 0} onChange={(e) => up(x, { valor: parseFloat(e.target.value) || 0 })}
                        className="num text-[13px] font-semibold text-right bg-transparent outline-none focus:bg-blue-soft rounded px-1 py-1 w-[100px]" />
                    </SheetTd>
                    <SheetTd center>
                      <button onClick={() => up(x, { status: x.status === 'pago' ? 'pendente' : 'pago' })}
                        className={['text-[10.5px] font-bold py-[5px] rounded-md w-[88px]', x.status === 'pago' ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber'].join(' ')}>
                        {x.status === 'pago' ? 'PAGO' : 'PENDENTE'}
                      </button>
                    </SheetTd>
                    <SheetTd><Cell value={x.data_pgto} onChange={(v) => up(x, { data_pgto: v })} placeholder="—" w="80px" /></SheetTd>
                    <SheetTd><Cell value={x.observacoes} onChange={(v) => up(x, { observacoes: v })} placeholder="—" /></SheetTd>
                    <SheetTd center>
                      <NotaFiscalCell url={x.nota_fiscal_url} path={x.nota_fiscal_path} tipo={x.nota_fiscal_tipo} onAttach={(file) => anexarNota(x, file)} />
                    </SheetTd>
                    <SheetTd>
                      <button onClick={() => fin.delDespesa(mes, categoria, x)} aria-label="remover"
                        className="text-muted-2 hover:text-red hover:bg-red-soft rounded-md px-[7px] text-[17px] leading-none">×</button>
                    </SheetTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-[18px] py-3.5 bg-[#F4F7FB] flex-wrap gap-3">
            <button onClick={() => fin.addDespesa(mes, categoria)} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
              Adicionar despesa
            </button>
            <div className="text-[13px] text-muted font-semibold flex items-center gap-2.5">
              Total <b className="text-[19px] text-navy font-extrabold num">{brl(total)}</b>
            </div>
          </div>
        </div>
      </div>

      <LembreteModal open={!!lembreteAlvo} item={lembreteAlvo} onClose={() => setLembreteAlvo(null)} onSave={salvarLembrete} onRemove={removerLembrete} />
    </>
  );
}

function Th({ children, r, center }) {
  return <th className={['font-semibold text-muted text-[11.5px] uppercase tracking-[.04em] px-[14px] py-[11px] border-b border-border whitespace-nowrap', r ? 'text-right' : center ? 'text-center' : 'text-left'].join(' ')}>{children}</th>;
}
function SheetTd({ children, r, center, className = '' }) {
  return <td className={['px-3 py-2 border-b border-border align-middle', r ? 'text-right' : center ? 'text-center' : '', className].join(' ')}>{children}</td>;
}
function Cell({ value, onChange, placeholder, w }) {
  return (
    <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={w ? { width: w } : undefined}
      className="text-[13px] bg-transparent outline-none focus:bg-blue-soft rounded px-1 py-1 w-full text-navy placeholder:text-muted-2" />
  );
}
