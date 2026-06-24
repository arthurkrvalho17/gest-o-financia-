import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVeiculos } from '../estoque/demoData';
import { gastosDemo, setGastosDemo, novoGastoDemo, addGastoPreparacao } from './demoPrep';

// Camada de dados da Preparação.
// Demo: usa o store compartilhado demoPrep (mesma fonte do custo no Estoque).
// Real: tabela preparacao_gastos no Supabase (RLS por loja).
export function usePreparacao() {
  const { usuario } = useAuth();
  const lojaId = usuario?.loja_id;
  const demo = !supabaseConfigurado;

  const [veiculos, setVeiculos] = useState([]);
  const [gastos, setGastos] = useState([]); // só usado no modo real
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // força recálculo no modo demo

  const carregar = useCallback(async () => {
    if (demo) {
      setVeiculos(demoVeiculos());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: vs }, { data: gs }] = await Promise.all([
      supabase.from('veiculos').select('*').order('entrada', { ascending: false }),
      supabase.from('preparacao_gastos').select('*'),
    ]);
    setVeiculos(vs || []);
    setGastos(gs || []);
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Lista de gastos de um veículo.
  const gastosDe = useCallback(
    (veic) => {
      if (!veic) return [];
      if (demo) return gastosDemo(veic.codigo);
      return gastos.filter((x) => x.veiculo_id === veic.id);
    },
    [demo, gastos, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totalDe = useCallback(
    (veic) => gastosDe(veic).reduce((s, x) => s + (Number(x.valor) || 0), 0),
    [gastosDe]
  );

  async function addGasto(veic) {
    if (demo) {
      setGastosDemo(veic.codigo, [...gastosDemo(veic.codigo), novoGastoDemo()]);
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('preparacao_gastos').insert({
      loja_id: lojaId,
      veiculo_id: veic.id,
      descricao: '',
      valor: 0,
      status: 'pendente',
    });
    if (!error) await carregar();
    return { error };
  }

  // Gasto preenchido pelo formulário (fonte única Preparação ↔ Financeiro).
  async function addGastoForm(veic, dados) {
    if (demo) {
      addGastoPreparacao(veic.codigo, dados);
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('preparacao_gastos').insert({
      loja_id: lojaId,
      veiculo_id: veic.id,
      descricao: dados.descricao,
      valor: dados.valor,
      status: dados.status,
      observacoes: dados.observacao,
      data: new Date().toISOString().slice(0, 10),
    });
    if (!error) await carregar();
    return { error };
  }

  // patch parcial { descricao?, data?, forma_pgto?, valor?, status?, observacoes? }
  async function updateGasto(veic, gasto, patch) {
    if (demo) {
      const arr = gastosDemo(veic.codigo).map((x) =>
        x.id === gasto.id ? { ...x, ...patch } : x
      );
      setGastosDemo(veic.codigo, arr);
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase
      .from('preparacao_gastos')
      .update(patch)
      .eq('id', gasto.id);
    if (!error)
      setGastos((arr) => arr.map((x) => (x.id === gasto.id ? { ...x, ...patch } : x)));
    return { error };
  }

  async function delGasto(veic, gasto) {
    if (demo) {
      setGastosDemo(
        veic.codigo,
        gastosDemo(veic.codigo).filter((x) => x.id !== gasto.id)
      );
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('preparacao_gastos').delete().eq('id', gasto.id);
    if (!error) setGastos((arr) => arr.filter((x) => x.id !== gasto.id));
    return { error };
  }

  return { veiculos, loading, demo, gastosDe, totalDe, addGasto, addGastoForm, updateGasto, delGasto, tick };
}
