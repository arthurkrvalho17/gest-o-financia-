import { useMemo, useState } from 'react';
import { Topbar } from '../../components/Layout';
import { fmt, brl, fmtSinal, fmtR } from '../../lib/format';
import { useFinanceiro } from './useFinanceiro';
import { mesesPassados, NOMES_MES } from './demoFin';
import DespesaSheet from './DespesaSheet';

const hoje = new Date();
const MES_ATUAL = hoje.toISOString().slice(0, 7); // YYYY-MM
const NOME_MES_ATUAL = NOMES_MES[hoje.getMonth()];

export default function FinanceiroPage() {
  const fin = useFinanceiro();
  const [view, setView] = useState({ tipo: 'overview' });

  // dados do mês corrente (ao vivo) — calculado sempre, antes de qualquer return
  const dadosMesAtual = useMemo(() => {
    const carros = fin.lucroPorCarroDoMes(MES_ATUAL);
    return {
      mes: MES_ATUAL,
      nome: NOME_MES_ATUAL,
      faturamento: fin.faturamentoDoMes(MES_ATUAL),
      vendas: fin.vendasDoMes(MES_ATUAL).length,
      preparacao: fin.preparacaoDoMes(MES_ATUAL),
      carros: carros.map((c) => ({ modelo: c.modelo, lucro: c.lucro, calc: `${fmt(c.valorVenda)} − ${fmt(c.compra)} − ${fmt(c.custos)}` })),
      lucroVendidos: carros.reduce((s, c) => s + c.lucro, 0),
      contasReceber: fin.vendasDoMes(MES_ATUAL).filter((v) => ['financiamento', 'consorcio'].includes(v.forma_pagamento)).reduce((s, v) => s + (Number(v.valor_venda) || 0), 0),
    };
  }, [fin]);

  const abrirCategoria = (mes, mesNome, categoria, from) =>
    setView({ tipo: 'sheet', mes, mesNome, categoria, from });

  if (view.tipo === 'sheet') {
    return (
      <DespesaSheet
        fin={fin}
        mes={view.mes}
        mesNome={view.mesNome}
        categoria={view.categoria}
        onVoltar={() => setView(view.from === 'month' ? { tipo: 'month', mes: view.mes, mesNome: view.mesNome } : { tipo: 'overview' })}
      />
    );
  }

  if (view.tipo === 'month') {
    const passado = mesesPassados.find((m) => m.mes === view.mes);
    const dados = passado
      ? { mes: passado.mes, nome: passado.nome, faturamento: passado.faturamento, vendas: passado.vendas, preparacao: passado.preparacao, carros: passado.carros.map(([modelo, lucro]) => ({ modelo, lucro, calc: '' })), lucroVendidos: passado.lucroVendidos, contasReceber: null }
      : dadosMesAtual;
    return (
      <ResumoMes
        titulo={`Financeiro · ${dados.nome}`}
        sub="tudo o que aconteceu nesse mês"
        fin={fin}
        dados={dados}
        demo={fin.demo}
        onAbrirCategoria={(cat) => abrirCategoria(dados.mes, dados.nome, cat, 'month')}
        onVoltar={() => setView({ tipo: 'overview' })}
      />
    );
  }

  // OVERVIEW (mês atual) + histórico
  return (
    <ResumoMes
      titulo="Financeiro"
      sub="Despesas, lucro e histórico mês a mês"
      fin={fin}
      dados={dadosMesAtual}
      demo={fin.demo}
      isOverview
      onAbrirCategoria={(cat) => abrirCategoria(MES_ATUAL, NOME_MES_ATUAL, cat, 'overview')}
      historico={
        <Historico
          fin={fin}
          dadosMesAtual={dadosMesAtual}
          onAbrirMes={(mes, mesNome) => setView({ tipo: 'month', mes, mesNome })}
        />
      }
    />
  );
}

function ResumoMes({ titulo, sub, fin, dados, demo, isOverview, onAbrirCategoria, onVoltar, historico }) {
  const fixas = fin.totalDespesas(dados.mes, 'fixa');
  const outras = fin.totalDespesas(dados.mes, 'outra');
  const prep = dados.preparacao;
  const gastoTotal = fixas + outras + prep;
  const resultado = dados.lucroVendidos - (fixas + outras);

  return (
    <>
      <Topbar titulo={titulo} sub={sub} />
      <div className="px-7 py-6 max-w-[1240px]">
        {onVoltar && (
          <button onClick={onVoltar} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg mb-[18px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Voltar
          </button>
        )}
        {demo && isOverview && (
          <div className="mb-4 text-[12px] text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue inline-block" />
            Modo demonstração. Configure o Supabase no <code>.env.local</code> para dados reais.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3.5 mb-[18px] max-[1000px]:grid-cols-2">
          <Kpi tom="blue" label="Faturamento do mês" valor={fmtR(dados.faturamento)} foot={`${dados.vendas} ${dados.vendas === 1 ? 'carro vendido' : 'carros vendidos'}`} />
          <Kpi tom="amber" label="Gasto total do mês" valor={fmtR(gastoTotal)} foot="fixas + preparação + outras" />
          <Kpi tom={resultado < 0 ? 'red' : 'green'} label="Lucro do mês" valor={fmtSinal(resultado)} foot="depois das despesas" />
          {isOverview
            ? <Kpi label="Contas a receber" valor={fmtR(dados.contasReceber || 0)} foot="financiamentos a creditar" />
            : <Kpi label="Vendas" valor={dados.vendas} foot="no mês" />}
        </div>

        <div className="grid grid-cols-2 gap-[18px] mb-[18px] max-[1000px]:grid-cols-1">
          {/* Despesas do mês */}
          <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
            <PanelHead titulo="Despesas do mês" hint="quanto a loja gastou" />
            <div className="py-1.5">
              <DespRow cor="#185FA5" label="Despesas fixas" valor={fixas} onClick={() => onAbrirCategoria('fixa')} sub={`Clique para abrir e editar · ${fin.despesasDe(dados.mes, 'fixa').length} lançamentos`} />
              <DespRow cor="#15803D" label="Preparação dos carros" valor={prep} sub="Vem dos carros (aba Preparação) · só consolidado aqui" />
              <DespRow cor="#B45309" label="Outras despesas" valor={outras} onClick={() => onAbrirCategoria('outra')} sub="Clique para abrir e editar a planilha" />
            </div>
            <Foot label="Total gasto no mês" valor={brl(gastoTotal)} />
            <Nota>A compra dos carros não entra aqui — fica no custo de cada carro e é abatida no lucro quando vende.</Nota>
          </div>

          {/* Lucro por carro vendido */}
          <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
            <PanelHead titulo="Lucro por carro vendido" hint="no mês" />
            {dados.carros.length === 0 && <div className="px-[18px] py-8 text-center text-muted text-[13px]">Nenhuma venda neste mês.</div>}
            {dados.carros.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-[18px] py-3 border-b border-border last:border-b-0">
                <div>
                  <div className="font-semibold text-[13px]">{c.modelo}</div>
                  {c.calc && <div className="text-[11.5px] text-muted-2 mt-px num">{c.calc}</div>}
                </div>
                <div className="font-bold num" style={{ color: c.lucro < 0 ? '#B91C1C' : '#15803D' }}>{fmtSinal(c.lucro)}</div>
              </div>
            ))}
            <div className="flex justify-between px-[18px] py-[15px] border-t border-border bg-bg">
              <span className="font-semibold">Resultado da loja no mês</span>
              <span className="font-extrabold text-[17px] num" style={{ color: resultado < 0 ? '#B91C1C' : '#15803D' }}>{fmtSinal(resultado)}</span>
            </div>
            <Nota>Resultado = lucro dos vendidos − despesas fixas e outras. A preparação não é descontada de novo (já está no lucro de cada carro).</Nota>
          </div>
        </div>

        {historico}
      </div>
    </>
  );
}

function Historico({ fin, dadosMesAtual, onAbrirMes }) {
  const fixasA = fin.totalDespesas(dadosMesAtual.mes, 'fixa');
  const outrasA = fin.totalDespesas(dadosMesAtual.mes, 'outra');
  const despAtual = fixasA + outrasA + dadosMesAtual.preparacao;
  const resultadoAtual = dadosMesAtual.lucroVendidos - (fixasA + outrasA);

  const linhas = [
    { mes: dadosMesAtual.mes, nome: dadosMesAtual.nome + ' (atual)', fat: dadosMesAtual.faturamento, luc: resultadoAtual, desp: despAtual },
    ...mesesPassados.map((m) => ({
      mes: m.mes, nome: m.nome, fat: m.faturamento,
      luc: m.lucroVendidos - (fin.totalDespesas(m.mes, 'fixa') + fin.totalDespesas(m.mes, 'outra')),
      desp: fin.totalDespesas(m.mes, 'fixa') + fin.totalDespesas(m.mes, 'outra') + m.preparacao,
    })),
  ];

  return (
    <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
      <PanelHead titulo="Histórico" hint="clique no mês para ver tudo" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th>Mês</Th><Th r>Faturamento</Th><Th r>Lucro</Th><Th r>Despesas</Th><Th>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes} className="cursor-pointer hover:bg-blue-soft" onClick={() => onAbrirMes(l.mes, l.nome.replace(' (atual)', ''))}>
                <Td className="font-semibold">{l.nome}</Td>
                <Td r className="num">{fmtR(l.fat)}</Td>
                <Td r className="num font-semibold" style={{ color: l.luc < 0 ? '#B91C1C' : '#15803D' }}>{fmtSinal(l.luc)}</Td>
                <Td r className="num text-muted">{fmtR(l.desp)}</Td>
                <Td><span className="text-blue font-semibold text-[12px]">Abrir ▸</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- UI ---- */
function Kpi({ tom, label, valor, foot }) {
  const tomCls = {
    blue: 'bg-blue-soft border-[#D3E3F2] text-blue',
    amber: 'bg-amber-soft border-[#F0DEC4] text-amber',
    green: 'bg-green-soft border-[#CDE8D6] text-green',
    red: 'bg-red-soft border-[#F3D4D4] text-red',
  }[tom];
  return (
    <div className={['rounded-card border px-[18px] py-4 shadow-card', tom ? tomCls : 'bg-white border-border'].join(' ')}>
      <div className={['text-[12px] font-medium', tom ? '' : 'text-muted'].join(' ')}>{label}</div>
      <div className={['text-[22px] font-bold tracking-tight mt-[7px] num', tom ? '' : 'text-navy'].join(' ')}>{valor}</div>
      <div className={['text-[11.5px] mt-[3px]', tom ? 'opacity-80' : 'text-muted-2'].join(' ')}>{foot}</div>
    </div>
  );
}
function PanelHead({ titulo, hint }) {
  return (
    <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-border">
      <h2 className="text-[14.5px] font-semibold">{titulo}</h2>
      <span className="text-[12px] text-muted-2">{hint}</span>
    </div>
  );
}
function DespRow({ cor, label, valor, sub, onClick }) {
  return (
    <>
      <div onClick={onClick} className={['flex items-center justify-between px-[18px] py-[11px] text-[13px]', onClick ? 'cursor-pointer hover:bg-blue-soft' : ''].join(' ')}>
        <span className="flex items-center gap-2.5 text-navy">
          <span className="w-2 h-2 rounded-sm" style={{ background: cor }} />
          {label}
          {onClick && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-muted-2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z" /></svg>
          )}
        </span>
        <span className="font-semibold num">{brl(valor)}</span>
      </div>
      <div className="text-[11.5px] text-muted-2 px-[18px] pb-2.5 pl-[39px]">{sub}</div>
    </>
  );
}
function Foot({ label, valor }) {
  return (
    <div className="flex justify-between px-[18px] py-[15px] border-t border-border bg-bg">
      <span className="font-semibold">{label}</span>
      <span className="font-extrabold text-[17px] num">{valor}</span>
    </div>
  );
}
function Nota({ children }) {
  return (
    <div className="flex gap-2.5 text-[11.5px] text-muted px-[18px] py-3 border-t border-border leading-relaxed">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px] flex-shrink-0 text-blue mt-px"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
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
