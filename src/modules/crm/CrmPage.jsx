import { useState } from 'react';
import { Topbar } from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { fmt } from '../../lib/format';
import { useCrm } from './useCrm';
import { ETAPAS, ORIGENS, TEMPLATES_HSM, CANAIS_DISTRIBUICAO } from './demoCrm';

export default function CrmPage() {
  const crm = useCrm();
  const toast = useToast();
  const [aba, setAba] = useState('neg'); // neg | conversas
  const [hist, setHist] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [drag, setDrag] = useState(null);
  const [filtroCanal, setFiltroCanal] = useState('');
  const [simCanal, setSimCanal] = useState('olx');

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
        sub="Funil de leads e conversas"
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
            <SubTab on={aba === 'conversas'} onClick={() => setAba('conversas')}>
              Conversas {crm.conversas.length > 0 && <span className="ml-1 text-[10px] bg-green text-white rounded-full px-1.5 py-px align-middle">{crm.conversas.length}</span>}
            </SubTab>
          </div>
          <button onClick={() => setHist(true)} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
            Histórico mês a mês
          </button>
        </div>

        {aba === 'neg' ? (
          <>
            {/* Separação por canal + (demo) simular chegada de lead com distribuição */}
            <div className="flex items-center gap-2.5 mb-3 flex-wrap">
              <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)}
                className={['text-[12.5px] font-medium border border-border rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-blue cursor-pointer', filtroCanal ? 'text-navy' : 'text-muted'].join(' ')}>
                <option value="">Todos os canais</option>
                {Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {filtroCanal && <button onClick={() => setFiltroCanal('')} className="text-[12px] font-semibold text-blue hover:underline">Limpar</button>}
              {crm.demo && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[11.5px] text-muted-2">Simular lead de:</span>
                  <select value={simCanal} onChange={(e) => setSimCanal(e.target.value)} className="text-[12.5px] border border-border rounded-lg px-2 py-1.5 bg-white outline-none focus:border-blue">
                    {CANAIS_DISTRIBUICAO.map((c) => <option key={c} value={c}>{ORIGENS[c].label}</option>)}
                  </select>
                  <button onClick={() => { const ld = crm.simularLead(simCanal); toast(ld?.vendedor_id ? `Lead da ${ORIGENS[simCanal].label} → ${crm.leads.find((x) => x.id === ld.id)?.vendedorNome || 'vendedor'}` : `Lead da ${ORIGENS[simCanal].label} (sem regra — distribuir manual)`); }}
                    className="text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-3 py-1.5">Simular</button>
                </div>
              )}
            </div>

            <div className="flex gap-3.5 overflow-x-auto pb-1.5">
              {ETAPAS.map((et) => {
                const cards = crm.leadsPorEtapa(et.key).filter((ld) => !filtroCanal || ld.canal_origem === filtroCanal);
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
                          <div className="text-[10.5px] text-muted-2 mt-1.5 flex items-center gap-1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" /></svg>
                            {ld.vendedorNome || 'sem dono'}
                          </div>
                        </div>
                      ))}
                      {cards.length === 0 && <div className="text-[11.5px] text-muted-2 text-center py-3">—</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <Conversas crm={crm} />
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

// Inbox de Conversas (WhatsApp) — amarrado ao lead; troca a etapa pela conversa;
// respeita a janela de 24h (fora dela, só templates HSM).
function Conversas({ crm }) {
  const [selId, setSelId] = useState(crm.conversas[0]?.id || null);
  const [texto, setTexto] = useState('');
  const [template, setTemplate] = useState('');
  const conversa = crm.conversas.find((c) => c.id === selId) || crm.conversas[0];

  if (crm.conversas.length === 0) {
    return <div className="bg-white border border-border rounded-card shadow-card px-[18px] py-10 text-center text-muted text-[13px]">Nenhuma conversa ainda. Conecte o WhatsApp em Conexões.</div>;
  }

  function enviar() {
    if (!texto.trim()) return;
    crm.enviarMensagem(conversa, texto.trim());
    setTexto('');
  }
  function enviarTemplate() {
    if (!template) return;
    crm.enviarMensagem(conversa, template, 'template');
    setTemplate('');
  }

  return (
    <div className="grid grid-cols-[300px_1fr] gap-0 bg-white border border-border rounded-card shadow-card overflow-hidden max-[900px]:grid-cols-1" style={{ minHeight: 460 }}>
      {/* Lista */}
      <div className="border-r border-border max-[900px]:border-r-0 max-[900px]:border-b overflow-y-auto">
        {crm.conversas.map((c) => (
          <button key={c.id} onClick={() => setSelId(c.id)}
            className={['w-full text-left px-3.5 py-3 border-b border-border flex gap-2.5 items-start', c.id === conversa.id ? 'bg-blue-soft' : 'hover:bg-bg'].join(' ')}>
            <div className="w-8 h-8 rounded-full bg-[#25D366] text-white grid place-items-center text-[11px] font-bold flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2a10 10 0 00-8.6 15l-1.4 5 5.1-1.3A10 10 0 1012 2z" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-[13px] truncate">{c.leadNome}</span>
                <span className="text-[10.5px] text-muted-2 flex-shrink-0">{c.ultima}</span>
              </div>
              <div className="text-[11.5px] text-muted-2 truncate">{c.mensagens[c.mensagens.length - 1]?.txt}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Thread */}
      <div className="flex flex-col" style={{ minHeight: 460 }}>
        <div className="flex items-center justify-between gap-3 px-[18px] py-3 border-b border-border flex-wrap">
          <div>
            <div className="font-semibold text-[14px]">{conversa.leadNome}</div>
            <div className="text-[11.5px] text-muted-2">{conversa.telefone} · WhatsApp</div>
          </div>
          {conversa.lead && (
            <label className="flex items-center gap-2 text-[11.5px] text-muted">
              Etapa:
              <select value={conversa.lead.etapa} onChange={(e) => crm.moverLead(conversa.lead, e.target.value)}
                className="text-[12.5px] font-semibold border border-border rounded-lg px-2 py-1.5 bg-white outline-none focus:border-blue cursor-pointer">
                {ETAPAS.map((et) => <option key={et.key} value={et.key}>{et.label}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] py-4 flex flex-col gap-2 bg-[#FAFBFD]">
          {conversa.mensagens.map((m) => (
            <div key={m.id} className={['max-w-[75%] px-3 py-2 rounded-xl text-[13px]',
              m.dir === 'out' ? 'self-end bg-[#DCF8C6] text-navy rounded-br-sm' : 'self-start bg-white border border-border rounded-bl-sm'].join(' ')}>
              {m.tipo === 'template' && <div className="text-[9.5px] font-bold text-blue uppercase tracking-wide mb-0.5">Template</div>}
              {m.txt}
              <div className="text-[9.5px] text-muted-2 mt-0.5 text-right">{m.hora}</div>
            </div>
          ))}
        </div>

        {/* Composer — respeita a janela de 24h */}
        {conversa.janelaAberta ? (
          <div className="flex items-center gap-2 p-3 border-t border-border">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()}
              placeholder="Escreva uma mensagem…" className="flex-1 text-[13px] px-3 py-2.5 border border-border rounded-lg outline-none focus:border-blue" />
            <button onClick={enviar} className="bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-4 py-2.5 rounded-lg">Enviar</button>
          </div>
        ) : (
          <div className="p-3 border-t border-border">
            <div className="text-[11.5px] text-amber bg-amber-soft rounded-lg px-3 py-2 mb-2 leading-snug">
              ⏳ Fora da janela de 24h — só é possível enviar <b>mensagens de template aprovadas (HSM)</b>.
            </div>
            <div className="flex items-center gap-2">
              <select value={template} onChange={(e) => setTemplate(e.target.value)}
                className="flex-1 text-[12.5px] px-3 py-2.5 border border-border rounded-lg outline-none focus:border-blue bg-white">
                <option value="">— escolher template —</option>
                {TEMPLATES_HSM.map((t, i) => <option key={i} value={t}>{t.slice(0, 50)}…</option>)}
              </select>
              <button onClick={enviarTemplate} className="bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-4 py-2.5 rounded-lg">Enviar</button>
            </div>
          </div>
        )}
      </div>
    </div>
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
