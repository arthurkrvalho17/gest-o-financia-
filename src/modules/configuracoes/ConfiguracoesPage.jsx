import { useState } from 'react';
import { Topbar } from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { brl } from '../../lib/format';
import { getEquipeDemo, addVendedorDemo, removeVendedorDemo } from '../estoque/demoData';

// Plano demo (no real vem de loja_plano + provedor de cobrança, ex.: Asaas)
const PLANO_DEMO = {
  plano: 'Gestão', valor_mensal: 149, proxima_cobranca: '10/07/2026', forma_pagamento: 'Cartão de crédito',
};

export default function ConfiguracoesPage() {
  const toast = useToast();
  const [, force] = useState(0);
  const [complementos, setComplementos] = useState({ ia: false, multicanal: true, nf: false });
  const [novoVendedor, setNovoVendedor] = useState('');

  const equipe = getEquipeDemo();

  function addVendedor() {
    if (!novoVendedor.trim()) return;
    addVendedorDemo({ nome: novoVendedor.trim() });
    setNovoVendedor('');
    force((n) => n + 1);
    toast('Vendedor adicionado — já aparece no registro de venda');
  }
  function removeVendedor(id, nome) {
    removeVendedorDemo(id);
    force((n) => n + 1);
    toast(`${nome} removido`);
  }
  function toggleComplemento(k) {
    setComplementos((c) => ({ ...c, [k]: !c[k] }));
  }

  return (
    <>
      <Topbar titulo="Configurações" sub="Assinatura, plano e vendedores da loja" />
      <div className="px-7 py-6 max-w-[1240px] grid grid-cols-2 gap-[18px] max-[1000px]:grid-cols-1">
        {/* 3.1 Assinatura / Plano */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="px-[18px] py-[15px] border-b border-border"><h2 className="text-[14.5px] font-semibold">Assinatura / Plano</h2></div>
          <div className="p-[18px]">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[12px] text-muted">Plano atual</div>
                <div className="text-[22px] font-bold text-navy">{PLANO_DEMO.plano}</div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-bold text-blue num">{brl(PLANO_DEMO.valor_mensal)}</div>
                <div className="text-[11.5px] text-muted-2">por mês</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-[13px]">
              <Info k="Próxima cobrança" v={PLANO_DEMO.proxima_cobranca} />
              <Info k="Forma de pagamento" v={PLANO_DEMO.forma_pagamento} />
              <Info k="Usuários ativos" v={`${equipe.length}`} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => toast('Mudar de plano: em breve')} className="flex-1 text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg py-2.5">Mudar de plano</button>
              <button onClick={() => toast('Gerenciar pagamento: em breve')} className="flex-1 text-[12.5px] font-semibold text-navy bg-white border border-border rounded-lg py-2.5 hover:bg-bg">Gerenciar pagamento</button>
            </div>

            <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mt-6 mb-2">Complementos</div>
            <Toggle label="IA de pré-venda (WhatsApp)" on={complementos.ia} onClick={() => toggleComplemento('ia')} />
            <Toggle label="Publicação multicanal" on={complementos.multicanal} onClick={() => toggleComplemento('multicanal')} />
            <Toggle label="Nota Fiscal" on={complementos.nf} onClick={() => toggleComplemento('nf')} />
          </div>
        </div>

        {/* 3.2 Vendedores */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden self-start">
          <div className="px-[18px] py-[15px] border-b border-border flex items-center justify-between">
            <h2 className="text-[14.5px] font-semibold">Vendedores</h2>
            <span className="text-[12px] text-muted-2">aparecem no registro de venda</span>
          </div>
          {equipe.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-[18px] py-3 border-b border-border">
              <div className="w-8 h-8 rounded-full bg-blue-soft text-blue grid place-items-center font-bold text-[12px]">
                {u.nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-[13.5px]">{u.nome}</div>
                <span className={['text-[10.5px] font-semibold px-1.5 py-px rounded', u.papel === 'dono' ? 'bg-blue-soft text-blue' : 'bg-[#EEF2F7] text-muted'].join(' ')}>
                  {u.papel === 'dono' ? 'Dono' : 'Vendedor'}
                </span>
              </div>
              {u.papel !== 'dono' && (
                <button onClick={() => removeVendedor(u.id, u.nome)} className="text-muted-2 hover:text-red hover:bg-red-soft rounded-md px-2 py-1 text-[16px] leading-none">×</button>
              )}
            </div>
          ))}
          <div className="flex gap-2 p-[18px]">
            <input value={novoVendedor} onChange={(e) => setNovoVendedor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addVendedor()}
              placeholder="Nome do vendedor" className="flex-1 text-[13px] px-3 py-2.5 border border-border rounded-lg outline-none focus:border-blue" />
            <button onClick={addVendedor} className="text-[13px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-4">Adicionar</button>
          </div>
          <div className="px-[18px] pb-3 text-[11px] text-muted-2 leading-snug">
            Vendedores são usuários da loja (mesma base do login). No sistema real, adicionar envia um convite de acesso.
          </div>
        </div>
      </div>
    </>
  );
}

function Info({ k, v }) {
  return <div><div className="text-[11px] text-muted-2">{k}</div><div className="font-semibold text-navy">{v}</div></div>;
}
function Toggle({ label, on, onClick }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-navy">{label}</span>
      <button onClick={onClick} className={['w-10 h-6 rounded-full transition relative', on ? 'bg-blue' : 'bg-[#CBD5E1]'].join(' ')}>
        <span className={['absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all', on ? 'left-[18px]' : 'left-0.5'].join(' ')} />
      </button>
    </div>
  );
}
