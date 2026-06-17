import { useMemo, useState } from 'react';
import { Topbar } from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { fmt, ddmm, diasDesde } from '../../lib/format';
import { useEstoque, lucroEstimado, lucroRealizado } from './useEstoque';
import AddVeiculoModal from './AddVeiculoModal';
import RegistrarVendaModal from './RegistrarVendaModal';
import MarcadorModal from './MarcadorModal';

const SIT = {
  estoque: { label: 'Estoque', cls: 'bg-green-soft text-green', dot: '#15803D' },
  reservado: { label: 'Reservado', cls: 'bg-amber-soft text-amber', dot: '#B45309' },
  vendido: { label: 'Vendido', cls: 'bg-[#EEF2F7] text-muted', dot: '#94A3B8' },
  repasse: { label: 'Repasse', cls: 'bg-[#F4E3DA] text-[#9A4B22]', dot: '#9A4B22' },
};
const ahVendaSit = ['estoque', 'reservado'];
const vendidoSit = ['vendido', 'repasse'];
const mesAtual = new Date().toISOString().slice(0, 7); // YYYY-MM

export default function EstoquePage() {
  const toast = useToast();
  const { veiculos, vendas, loading, demo, custosDe, addVeiculo, salvarMarcador, registrarVenda } =
    useEstoque();

  const [mode, setMode] = useState('venda');
  const [busca, setBusca] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [marcAlvo, setMarcAlvo] = useState(null);
  const [vendaAlvo, setVendaAlvo] = useState(null);
  const [acoesAlvo, setAcoesAlvo] = useState(null);

  const vendaPorVeiculo = useMemo(() => {
    const m = {};
    for (const v of vendas) m[v.veiculo_id] = v;
    return m;
  }, [vendas]);

  const aVenda = veiculos.filter((v) => ahVendaSit.includes(v.situacao));
  const vendidos = veiculos.filter((v) => vendidoSit.includes(v.situacao));

  // KPIs
  const proprios = aVenda.filter((v) => v.tipo === 'proprio').length;
  const consignados = aVenda.length - proprios;
  const mediaDias = aVenda.length
    ? Math.round(aVenda.reduce((s, v) => s + diasDesde(v.entrada), 0) / aVenda.length)
    : 0;
  const vendasMes = vendas.filter((v) => (v.data_venda || '').slice(0, 7) === mesAtual);
  const faturamentoMes = vendasMes.reduce((s, v) => s + (v.valor_venda || 0), 0);

  // Lista filtrada
  const fonte = mode === 'venda' ? aVenda : vendidos;
  const lista = fonte.filter((v) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (
      (v.modelo || '').toLowerCase().includes(q) || (v.placa || '').toLowerCase().includes(q)
    );
  });

  async function onAddSave(dados) {
    const { error } = await addVeiculo(dados);
    setAddOpen(false);
    toast(error ? 'Erro ao salvar: ' + error.message : 'Veículo salvo no estoque');
  }
  async function onMarcSave(texto, cor) {
    const { error } = await salvarMarcador(marcAlvo, texto, cor);
    setMarcAlvo(null);
    if (error) toast('Erro: ' + error.message);
  }
  async function onMarcClear() {
    const { error } = await salvarMarcador(marcAlvo, '', null);
    setMarcAlvo(null);
    if (error) toast('Erro: ' + error.message);
  }
  async function onVendaConfirm(dados) {
    const { error } = await registrarVenda(vendaAlvo, dados);
    const luc = lucroRealizado(dados.valor_venda, vendaAlvo, custosDe(vendaAlvo));
    setVendaAlvo(null);
    toast(error ? 'Erro: ' + error.message : 'Venda registrada · lucro ' + fmt(luc));
  }

  return (
    <>
      <Topbar
        titulo="Estoque"
        sub={`${aVenda.length} à venda · ${proprios} próprios, ${consignados} consignados`}
        acao={
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Adicionar veículo
          </button>
        }
      />

      <div className="px-7 py-6 max-w-[1240px]">
        {demo && (
          <div className="mb-4 text-[12px] text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue inline-block" />
            Modo demonstração (dados de exemplo). Configure o Supabase no <code>.env.local</code> para usar dados reais da sua loja.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3.5 mb-[22px] max-[1000px]:grid-cols-1">
          <Kpi label="Veículos em estoque" valor={aVenda.length} foot={`${proprios} próprios · ${consignados} consignados`} />
          <Kpi label="Média de dias em estoque" valor={`${mediaDias} `} unidade="dias" foot="carro parado é dinheiro parado" />
          <Kpi label="Vendas do mês" valor={vendasMes.length} foot={`${fmt(faturamentoMes)} em vendas`} />
        </div>

        {/* Painel + tabela */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-[18px] py-[15px] border-b border-border flex-wrap">
            <div className="inline-flex bg-bg border border-border rounded-[9px] p-[3px] gap-0.5">
              <Seg on={mode === 'venda'} onClick={() => setMode('venda')}>Carros à venda</Seg>
              <Seg on={mode === 'vendidos'} onClick={() => setMode('vendidos')}>Carros já vendidos</Seg>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="text-[12px] text-muted-2 num">{lista.length} resultados</span>
              <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-[11px] py-[7px] text-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px]">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por modelo ou placa"
                  className="bg-transparent outline-none text-[13px] text-navy w-[170px]"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Cód', 'Modelo', 'Fab/Mod', 'Cor', 'Placa', 'Tipo', 'Entrada', 'Saída', 'Situação'].map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                  <Th r>Venda</Th>
                  <Th r>Lucro</Th>
                  {mode === 'venda' && <Th>Marcador</Th>}
                  {mode === 'venda' && <Th>{''}</Th>}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={13} className="px-[14px] py-10 text-center text-muted">Carregando…</td></tr>
                )}
                {!loading && lista.length === 0 && (
                  <tr><td colSpan={13} className="px-[14px] py-10 text-center text-muted">Nenhum veículo {mode === 'venda' ? 'à venda' : 'vendido'} ainda.</td></tr>
                )}
                {!loading &&
                  lista.map((v) => {
                    const custos = custosDe(v);
                    const venda = vendaPorVeiculo[v.id];
                    const valorVenda = mode === 'vendidos' ? venda?.valor_venda ?? v.pedido : v.pedido;
                    const lucro =
                      mode === 'vendidos'
                        ? lucroRealizado(valorVenda, v, custos)
                        : lucroEstimado(v, custos);
                    const sit = SIT[v.situacao] || SIT.estoque;
                    return (
                      <tr key={v.id} className="hover:bg-[#FBFCFE]">
                        <Td className="num text-muted font-semibold">{v.codigo || '—'}</Td>
                        <Td><span className="text-blue font-semibold">{v.modelo}</span></Td>
                        <Td className="num">{v.fab_mod || '—'}</Td>
                        <Td>{v.cor || '—'}</Td>
                        <Td className="num">{v.placa || '—'}</Td>
                        <Td>
                          <span className={['text-[11px] font-semibold px-2 py-0.5 rounded-md', v.tipo === 'consignado' ? 'bg-[#F1ECFB] text-[#7C3AED]' : 'bg-blue-soft text-blue'].join(' ')}>
                            {v.tipo === 'consignado' ? 'Consignado' : 'Próprio'}
                          </span>
                        </Td>
                        <Td className="num">{ddmm(v.entrada) || '—'}</Td>
                        <Td className="num">{ddmm(v.saida) || <span className="text-muted-2">—</span>}</Td>
                        <Td>
                          <span className={['inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-[3px] rounded-full', sit.cls].join(' ')}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sit.dot }} />
                            {sit.label}
                          </span>
                        </Td>
                        <Td r className="num font-medium">{fmt(valorVenda)}</Td>
                        <Td r className="num font-bold" style={{ color: lucro < 0 ? '#B91C1C' : '#15803D' }}>{fmt(lucro)}</Td>
                        {mode === 'venda' && (
                          <Td>
                            {v.marcador_texto ? (
                              <button
                                onClick={() => setMarcAlvo(v)}
                                style={{ background: v.marcador_cor || '#185FA5' }}
                                className="text-[11px] font-bold text-white px-2.5 py-1 rounded-md whitespace-nowrap"
                              >
                                {v.marcador_texto}
                              </button>
                            ) : (
                              <button onClick={() => setMarcAlvo(v)} className="text-[11px] font-semibold text-muted-2 border border-border rounded-md px-2.5 py-1 hover:bg-bg whitespace-nowrap">
                                + Marcador
                              </button>
                            )}
                          </Td>
                        )}
                        {mode === 'venda' && (
                          <Td>
                            <button onClick={() => setAcoesAlvo(v)} className="text-[12px] font-semibold px-2.5 py-[5px] border border-border rounded-md hover:bg-bg whitespace-nowrap">
                              Ações ▾
                            </button>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modais */}
      <AddVeiculoModal open={addOpen} onClose={() => setAddOpen(false)} onSave={onAddSave} />
      <MarcadorModal open={!!marcAlvo} veiculo={marcAlvo} onClose={() => setMarcAlvo(null)} onSave={onMarcSave} onClear={onMarcClear} />
      <RegistrarVendaModal open={!!vendaAlvo} veiculo={vendaAlvo} custos={vendaAlvo ? custosDe(vendaAlvo) : 0} onClose={() => setVendaAlvo(null)} onConfirm={onVendaConfirm} />

      {/* Menu de ações do veículo */}
      <Modal open={!!acoesAlvo} onClose={() => setAcoesAlvo(null)} title={acoesAlvo?.modelo || 'Ações'} maxWidth={340}>
        <div className="flex flex-col gap-2">
          <AcBtn primary onClick={() => { const a = acoesAlvo; setAcoesAlvo(null); setVendaAlvo(a); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
            Registrar venda
          </AcBtn>
          <AcBtn onClick={() => { const a = acoesAlvo; setAcoesAlvo(null); setMarcAlvo(a); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0l-7.2-7.2a2 2 0 01-.6-1.4V4a1 1 0 011-1h7.8a2 2 0 011.4.6l7.6 7.6a2 2 0 010 2.6z" /><circle cx="7.5" cy="7.5" r="1" /></svg>
            Definir marcador
          </AcBtn>
          <AcBtn onClick={() => { setAcoesAlvo(null); toast('Edição de dados: em breve'); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z" /></svg>
            Editar dados
          </AcBtn>
        </div>
      </Modal>
    </>
  );
}

/* ---- pequenos componentes de UI ---- */
function Kpi({ label, valor, unidade, foot }) {
  return (
    <div className="bg-white border border-border rounded-card shadow-card px-[18px] py-4">
      <div className="text-[12px] text-muted font-medium">{label}</div>
      <div className="text-[22px] font-bold tracking-tight mt-[7px] num">
        {valor}
        {unidade && <span className="text-sm font-semibold text-muted">{unidade}</span>}
      </div>
      <div className="text-[11.5px] text-muted-2 mt-[3px]">{foot}</div>
    </div>
  );
}
function Seg({ on, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={['px-4 py-1.5 rounded-[7px] text-[13px] font-semibold transition', on ? 'bg-white text-blue shadow-[0_1px_3px_rgba(10,22,40,.08)]' : 'text-muted'].join(' ')}
    >
      {children}
    </button>
  );
}
function Th({ children, r }) {
  return (
    <th className={['font-semibold text-muted text-[11.5px] uppercase tracking-[.04em] px-[14px] py-[11px] border-b border-border whitespace-nowrap', r ? 'text-right' : 'text-left'].join(' ')}>
      {children}
    </th>
  );
}
function Td({ children, r, className = '', style }) {
  return (
    <td className={['px-[14px] py-[13px] border-b border-border align-middle whitespace-nowrap', r ? 'text-right' : '', className].join(' ')} style={style}>
      {children}
    </td>
  );
}
function AcBtn({ children, primary, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-2.5 w-full text-left px-[13px] py-[11px] border rounded-[9px] text-[13.5px] font-semibold',
        '[&>svg]:w-4 [&>svg]:h-4',
        primary ? 'bg-green-soft border-transparent text-green [&>svg]:text-green' : 'bg-white border-border text-navy [&>svg]:text-muted hover:bg-bg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
