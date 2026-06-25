import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVeiculos, demoVendas } from '../estoque/demoData';
import { totalPrepDemo, allGastosDemo, gastosDemo, addGastoPreparacao, setStatusGastoDemo } from '../preparacao/demoPrep';
import { despesasDemo, setDespesasDemo, novaDespesaDemo, recriarFixasSeVazio } from './demoFin';

const mesDe = (iso) => (iso || '').slice(0, 7);

// Camada de dados do Financeiro. Consolida vendas + preparação + despesas.
export function useFinanceiro() {
  const { usuario } = useAuth();
  const lojaId = usuario?.loja_id;
  const demo = !supabaseConfigurado;

  const [veiculos, setVeiculos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [prepGastos, setPrepGastos] = useState([]); // real
  const [despesas, setDespesas] = useState([]); // real
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // recálculo demo

  const carregar = useCallback(async () => {
    if (demo) {
      recriarFixasSeVazio(MES_ATUAL); // virada de mês: recria as fixas como pendentes
      setVeiculos(demoVeiculos());
      setVendas(demoVendas());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: vs }, { data: vd }, { data: gs }, { data: ds }] = await Promise.all([
      supabase.from('veiculos').select('*'),
      supabase.from('vendas').select('*'),
      supabase.from('preparacao_gastos').select('id, veiculo_id, valor, data, descricao, status'),
      supabase.from('despesas').select('*'),
    ]);
    setVeiculos(vs || []);
    setVendas(vd || []);
    setPrepGastos(gs || []);
    setDespesas(ds || []);
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const custosDe = useCallback(
    (veic) => {
      if (!veic) return 0;
      if (demo) return totalPrepDemo(veic.codigo);
      return prepGastos
        .filter((g) => g.veiculo_id === veic.id)
        .reduce((s, g) => s + (Number(g.valor) || 0), 0);
    },
    [demo, prepGastos]
  );

  // ---- consolidações por mês (mes = 'YYYY-MM') ----
  const vendasDoMes = useCallback(
    (mes) => vendas.filter((v) => mesDe(v.data_venda) === mes),
    [vendas]
  );

  const faturamentoDoMes = useCallback(
    (mes) => vendasDoMes(mes).reduce((s, v) => s + (Number(v.valor_venda) || 0), 0),
    [vendasDoMes]
  );

  const lucroPorCarroDoMes = useCallback(
    (mes) =>
      vendasDoMes(mes).map((v) => {
        const veic = veiculos.find((x) => x.id === v.veiculo_id) || {};
        const custos = custosDe(veic);
        const lucro = (Number(v.valor_venda) || 0) - (Number(veic.compra) || 0) - custos;
        return { veic, modelo: veic.modelo || '—', valorVenda: v.valor_venda, compra: veic.compra || 0, custos, lucro };
      }),
    [vendasDoMes, veiculos, custosDe]
  );

  // Itens de preparação de um carro (para o detalhe do lucro).
  const gastosPrepDe = useCallback(
    (veic) => {
      if (!veic) return [];
      if (demo) return gastosDemo(veic.codigo);
      return prepGastos.filter((g) => g.veiculo_id === veic.id);
    },
    [demo, prepGastos]
  );

  const preparacaoDoMes = useCallback(
    (mes) => {
      const lista = demo ? allGastosDemo() : prepGastos;
      return lista.filter((g) => mesDe(g.data) === mes).reduce((s, g) => s + (Number(g.valor) || 0), 0);
    },
    [demo, prepGastos, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Gastos de preparação do mês, com o carro resolvido (visão do Financeiro).
  const gastosPrepDoMes = useCallback(
    (mes) => {
      const lista = demo ? allGastosDemo() : prepGastos;
      return lista
        .filter((g) => mesDe(g.data) === mes)
        .map((g) => {
          const veic = demo
            ? veiculos.find((v) => String(v.codigo) === String(g.codigo))
            : veiculos.find((v) => v.id === g.veiculo_id);
          return { ...g, carro: veic?.modelo || '—', placa: veic?.placa || '' };
        });
    },
    [demo, prepGastos, veiculos, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Adicionar gasto de preparação pelo formulário (mesmo registro da aba Preparação).
  async function addGastoPrepForm(veic, dados) {
    if (demo) {
      addGastoPreparacao(veic.codigo, dados);
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('preparacao_gastos').insert({
      loja_id: lojaId, veiculo_id: veic.id, descricao: dados.descricao,
      valor: dados.valor, status: dados.status, observacoes: dados.observacao,
      data: new Date().toISOString().slice(0, 10),
    });
    if (!error) await carregar();
    return { error };
  }

  // ---- despesas (fixa/outra) ----
  const despesasDe = useCallback(
    (mes, categoria) => {
      if (demo) return despesasDemo(mes, categoria);
      return despesas.filter((x) => mesDe(x.mes_ref) === mes && x.categoria === categoria);
    },
    [demo, despesas, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totalDespesas = useCallback(
    (mes, categoria) => despesasDe(mes, categoria).reduce((s, x) => s + (Number(x.valor) || 0), 0),
    [despesasDe]
  );

  async function addDespesa(mes, categoria) {
    if (demo) {
      setDespesasDemo(mes, categoria, [...despesasDemo(mes, categoria), novaDespesaDemo()]);
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('despesas').insert({
      loja_id: lojaId, categoria, mes_ref: mes + '-01', descricao: '', valor: 0, status: 'pendente',
    });
    if (!error) await carregar();
    return { error };
  }
  async function updateDespesa(mes, categoria, item, patch) {
    if (demo) {
      setDespesasDemo(mes, categoria, despesasDemo(mes, categoria).map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('despesas').update(patch).eq('id', item.id);
    if (!error) setDespesas((arr) => arr.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    return { error };
  }
  async function delDespesa(mes, categoria, item) {
    if (demo) {
      setDespesasDemo(mes, categoria, despesasDemo(mes, categoria).filter((x) => x.id !== item.id));
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('despesas').delete().eq('id', item.id);
    if (!error) setDespesas((arr) => arr.filter((x) => x.id !== item.id));
    return { error };
  }

  // ---- Contas a pagar: visão filtrada (status pendente) do mês, sem duplicar dado ----
  const contasAPagar = useCallback(
    (mes) => {
      const pend = (arr) => arr.filter((x) => x.status !== 'pago');
      const itens = [
        ...pend(despesasDe(mes, 'fixa')).map((x) => ({ ...x, categoria: 'Despesas fixas', fonte: 'fixa' })),
        ...pend(despesasDe(mes, 'outra')).map((x) => ({ ...x, categoria: 'Outras despesas', fonte: 'outra' })),
        ...gastosPrepDoMes(mes).filter((g) => g.status !== 'pago').map((g) => ({ ...g, descricao: `${g.descricao} (${g.carro})`, categoria: 'Preparação dos carros', fonte: 'prep' })),
      ];
      return itens;
    },
    [despesasDe, gastosPrepDoMes]
  );

  async function marcarPago(item, mes) {
    if (item.fonte === 'prep') {
      if (demo) { setStatusGastoDemo(item.codigo, item.id, 'pago'); setTick((t) => t + 1); return { error: null }; }
      const { error } = await supabase.from('preparacao_gastos').update({ status: 'pago' }).eq('id', item.id);
      if (!error) await carregar();
      return { error };
    }
    return updateDespesa(mes, item.fonte, item, { status: 'pago' });
  }

  return {
    demo, loading,
    custosDe, vendasDoMes, faturamentoDoMes, lucroPorCarroDoMes, preparacaoDoMes, gastosPrepDe,
    gastosPrepDoMes, addGastoPrepForm, veiculos,
    despesasDe, totalDespesas, addDespesa, updateDespesa, delDespesa,
    contasAPagar, marcarPago,
  };
}
