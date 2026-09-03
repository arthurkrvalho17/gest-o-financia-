import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVeiculos, demoVendas } from '../estoque/demoData';
import { totalPrepDemo, allGastosDemo, gastosDemo, addGastoPreparacao, updateGastoDemo } from '../preparacao/demoPrep';
import { despesasDemo, setDespesasDemo, novaDespesaDemo, recriarFixasSeVazio } from './demoFin';
import { anexarCompra } from '../../lib/veiculoValores';

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
      recriarFixasSeVazio(new Date().toISOString().slice(0, 7)); // virada de mês: recria as fixas como pendentes
      setVeiculos(demoVeiculos());
      setVendas(demoVendas());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: vs, error: e1 }, { data: vd, error: e2 }, { data: gs, error: e3 }, { data: ds, error: e4 }] = await Promise.all([
      supabase.from('veiculos').select('*'),
      supabase.from('vendas').select('*'),
      supabase.from('preparacao_gastos').select('id, veiculo_id, valor, data, descricao, status'),
      supabase.from('despesas').select('*'),
    ]);
    const erroCarregar = e1 || e2 || e3 || e4;
    if (erroCarregar) console.error('[Financia+] Erro ao carregar financeiro:', erroCarregar.message);
    setVeiculos(await anexarCompra(vs || []));
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

  // Adicionar gasto(s) de preparação pelo formulário (mesmo registro da aba Preparação).
  async function addGastoPrepForm(veic, lista) {
    const itens = Array.isArray(lista) ? lista : [lista];
    if (demo) {
      itens.forEach((d) => addGastoPreparacao(veic.codigo, d));
      setTick((t) => t + 1);
      return { error: null };
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('preparacao_gastos').insert(
      itens.map((d) => ({
        loja_id: lojaId, veiculo_id: veic.id, descricao: d.descricao, valor: d.valor,
        status: d.status, observacoes: d.observacao, data: hoje,
      }))
    );
    if (!error) await carregar();
    return { error };
  }

  // Anexa/atualiza a nota fiscal de um gasto de preparação (mesma fonte da Preparação).
  async function anexarNotaPrep(gasto, patch) {
    if (demo) {
      updateGastoDemo(gasto.codigo, gasto.id, patch);
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('preparacao_gastos').update(patch).eq('id', gasto.id);
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

  return {
    demo, loading,
    custosDe, vendasDoMes, faturamentoDoMes, lucroPorCarroDoMes, preparacaoDoMes, gastosPrepDe,
    gastosPrepDoMes, addGastoPrepForm, anexarNotaPrep, veiculos,
    despesasDe, totalDespesas, addDespesa, updateDespesa, delDespesa,
  };
}
