import { useState } from 'react';
import { Topbar } from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { fmt } from '../../lib/format';
import { useCrm } from './useCrm';
import { ETAPAS, ORIGENS } from './demoCrm';

export default function CrmPage() {
  const crm = useCrm();
  const toast = useToast();
  const [aba, setAba] = useState('neg'); // neg | pos
  const [hist, setHist] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [drag, setDrag] = useState(null);

  if (hist) return <HistoricoView crm={crm} onVoltar={() => setHist(false)} />;

  async function onAdd(dados) {
    const { error } = await crm.addLead(dados);
    setAddOpen(false);
    toast(error ? 'Erro: ' + error.message : 'Lead adicionado ao funil');
  }
  async function soltar(etapa) {
    if (!drag) return;
    await crm.moverLead(drag, etapa);
    setDrag(null);
  }

  return (
    <>
      <Topbar
        titulo="CRM"
        sub="Negociações e pós-venda"
        acao={
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
            Novo lead
          </button>
        }
      />
      <div className="px-7 py-6 max-w-[1240px]">
        {crm.demo && (
          <div className="mb-4 text-[12px] text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue inline-block" />
            Modo demonstração. Configure o Supabase no <code>.env.local</code> para dados reais.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3.5 mb-[18px] max-[1000px]:grid-cols-1">
          <Kpi label="Leads do mês" valor={crm.leadsMes} foot="entradas no funil" />
          <Kpi label="Taxa de conversão" valor={crm.conversao} foot="vendas ÷ leads no mês" />
          <Kpi label="Negócios em aberto" valor={crm.negociosAbertos} foot="no funil agora" />
        </div>

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex gap-1">
            <SubTab on={aba === 'neg'} onClick={() => setAba('neg')}>Negociações</SubTab>
            <SubTab on={aba === 'pos'} onClick={() => setAba('pos')}>Pós-venda</SubTab>
          </div>
          <button onClick={() => setHist(true)} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
            Histórico mês a mês
          </button>
        </div>

        {aba === 'neg' ? (
          <div className="flex gap-3.5 overflow-x-auto pb-1.5">
            {ETAPAS.map((et) => {
              const cards = crm.leadsPorEtapa(et.key);
              return (
                <div key={et.key} className="flex-[0_0_250px] bg-white border border-border rounded-card shadow-card overflow-hidden self-start"
                  onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(et.key)}>
                  <div className="px-3.5 py-3 border-b border-border flex items-center gap-2" style={{ borderTop: `3px solid ${et.accent}` }}>
                    <span className="text-[12.5px] font-bold">{et.label}</span>
                    <span className="ml-auto text-[11px] font-bold text-muted bg-bg px-2 py-0.5 rounded-full num">{cards.length}</span>
                  </div>
                  <div className="p-2.5 flex flex-col gap-2.5 min-h-[60px]">
                    {cards.map((ld) => (
                      <div key={ld.id} draggable onDragStart={() => setDrag(ld)} onDragEnd={() => setDrag(null)}
                        className="bg-white border border-border rounded-[10px] px-3 py-2.5 shadow-[0_1px_2px_rgba(10,22,40,.04)] cursor-grab hover:border-[#CBD5E1] active:cursor-grabbing">
                        <div className="font-semibold text-[13px]">{ld.nome}</div>
                        <div className="text-[11.5px] text-muted mt-0.5">{ld.carLabel || '—'}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className={['text-[10px] font-semibold px-1.5 py-0.5 rounded', ORIGENS[ld.origem]?.cls || 'bg-bg text-muted'].join(' ')}>
                            {ORIGENS[ld.origem]?.label || ld.origem}
                          </span>
                          <span className="text-[12.5px] font-bold num">{fmt(ld.valor)}</span>
                        </div>
                      </div>
                    ))}
                    {cards.length === 0 && <div className="text-[11.5px] text-muted-2 text-center py-3">Arraste leads aqui</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-border">
              <h2 className="text-[14.5px] font-semibold">Pós-venda</h2>
              <span className="text-[12px] text-muted-2">clientes após a compra</span>
            </div>
            {crm.posVenda.length === 0 && <div className="px-[18px] py-8 text-center text-muted text-[13px]">Nenhuma venda registrada ainda.</div>}
            {crm.posVenda.map((p, i) => (
              <div key={i} className="flex items-center gap-3.5 px-[18px] py-3.5 border-b border-border last:border-b-0 flex-wrap">
                <div className="font-semibold text-[13.5px] min-w-[150px]">{p.nome}<span className="block text-[11.5px] text-muted-2 font-normal mt-px">{p.carro}</span></div>
                <div className="flex gap-2 flex-wrap flex-1">
                  {p.steps.map((s, j) => (
                    <span key={j} className={['text-[11px] font-semibold px-2.5 py-1 rounded-md',
                      s[1] === 'ok' ? 'bg-green-soft text-green' : s[1] === 'pend' ? 'bg-amber-soft text-amber' : 'bg-bg text-muted-2'].join(' ')}>
                      {s[0]}{s[1] === 'ok' ? ' ✓' : s[1] === 'pend' ? ' ⏳' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddLeadModal open={addOpen} veiculos={crm.veiculos} demo={crm.demo} onClose={() => setAddOpen(false)} onSave={onAdd} />
    </>
  );
}

function HistoricoView({ crm, onVoltar }) {
  return (
    <>
      <Topbar titulo="CRM · Histórico" sub="métricas mês a mês" />
      <div className="px-7 py-6 max-w-[1240px]">
        <button onClick={onVoltar} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg mb-[18px]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Voltar
        </button>
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr><Th>Mês</Th><Th r>Leads</Th><Th r>Vendas</Th><Th r>Conversão</Th><Th r>Ticket médio</Th></tr>
              </thead>
              <tbody>
                {crm.historico.length === 0 && <tr><td colSpan={5} className="px-[14px] py-8 text-center text-muted">Sem dados ainda.</td></tr>}
                {crm.historico.map((h) => (
                  <tr key={h.mes}>
                    <Td className="font-semibold">{h.mes}</Td>
                    <Td r className="num">{h.leads}</Td>
                    <Td r className="num">{h.vendas}</Td>
                    <Td r className="num">{h.conversao}</Td>
                    <Td r className="num">{fmt(h.ticket)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function AddLeadModal({ open, veiculos, demo, onClose, onSave }) {
  const [f, setF] = useState({ nome: '', telefone: '', origem: 'whatsapp', veiculo_id: '' });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function salvar() {
    if (!f.nome.trim()) return;
    const v = veiculos.find((x) => x.id === f.veiculo_id);
    onSave({
      nome: f.nome.trim(),
      telefone: f.telefone.trim(),
      origem: f.origem,
      veiculo_id: f.veiculo_id || null,
      carLabel: v?.modelo || '',
      valor: v?.pedido || 0,
    });
    setF({ nome: '', telefone: '', origem: 'whatsapp', veiculo_id: '' });
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo lead" maxWidth={440}
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>Cancelar</button>
          <button className="bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]" onClick={salvar}>Adicionar lead</button>
        </>
      }>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" full><input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome do cliente" className="inp" /></Field>
        <Field label="Telefone"><input value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 00000-0000" className="inp" /></Field>
        <Field label="Origem">
          <select value={f.origem} onChange={(e) => set('origem', e.target.value)} className="inp">
            {Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Veículo de interesse" full>
          <select value={f.veiculo_id} onChange={(e) => set('veiculo_id', e.target.value)} className="inp">
            <option value="">— nenhum —</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo}{v.placa ? ` · ${v.placa}` : ''}</option>)}
          </select>
        </Field>
      </div>
      <style>{`.inp{font-size:13.5px;padding:9px 11px;border:1px solid var(--bd,#E2E8F0);border-radius:8px;outline:none;background:#fff;width:100%}.inp:focus{border-color:#185FA5}`}</style>
    </Modal>
  );
}

/* ---- UI ---- */
function Kpi({ label, valor, foot }) {
  return (
    <div className="bg-white border border-border rounded-card shadow-card px-[18px] py-4">
      <div className="text-[12px] text-muted font-medium">{label}</div>
      <div className="text-[22px] font-bold tracking-tight mt-[7px] num">{valor}</div>
      <div className="text-[11.5px] text-muted-2 mt-[3px]">{foot}</div>
    </div>
  );
}
function SubTab({ on, onClick, children }) {
  return (
    <button onClick={onClick} className={['px-4 py-2 border rounded-[9px] text-[13px] font-semibold', on ? 'bg-navy text-white border-navy' : 'bg-white text-muted border-border'].join(' ')}>{children}</button>
  );
}
function Field({ label, full, children }) {
  return (
    <div className={['flex flex-col gap-1.5', full ? 'col-span-2' : ''].join(' ')}>
      <label className="text-[11.5px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}
function Th({ children, r }) {
  return <th className={['font-semibold text-muted text-[11.5px] uppercase tracking-[.04em] px-[14px] py-[11px] border-b border-border whitespace-nowrap', r ? 'text-right' : 'text-left'].join(' ')}>{children}</th>;
}
function Td({ children, r, className = '' }) {
  return <td className={['px-[14px] py-[13px] border-b border-border align-middle whitespace-nowrap', r ? 'text-right' : '', className].join(' ')}>{children}</td>;
}
