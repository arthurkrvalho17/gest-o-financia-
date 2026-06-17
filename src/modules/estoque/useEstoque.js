import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { hojeISO } from '../../lib/format';
import { demoCustos, demoVeiculos, demoVendas } from './demoData';

// Camada de dados do Estoque.
// - Supabase configurado  -> lê/escreve nas tabelas veiculos e vendas (RLS por loja).
// - Não configurado        -> modo demo, em memória, com os dados do protótipo.
export function useEstoque() {
  const { usuario } = useAuth();
  const lojaId = usuario?.loja_id;
  const demo = !supabaseConfigurado;

  const [veiculos, setVeiculos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (demo) {
      setVeiculos(demoVeiculos());
      setVendas(demoVendas());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: vs }, { data: vd }] = await Promise.all([
      supabase.from('veiculos').select('*').order('entrada', { ascending: false }),
      supabase.from('vendas').select('*'),
    ]);
    setVeiculos(vs || []);
    setVendas(vd || []);
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Custo de preparação do carro (Fase 2). Por ora: demo usa os valores do
  // protótipo; no modo real ainda é 0 até a Fase 2 somar preparacao_gastos.
  const custosDe = useCallback(
    (veic) => (demo ? demoCustos[veic?.codigo] || 0 : 0),
    [demo]
  );

  async function addVeiculo(dados) {
    if (demo) {
      const novo = {
        id: globalThis.crypto?.randomUUID?.() || 'demo-' + Date.now(),
        loja_id: 'demo',
        situacao: 'estoque',
        entrada: hojeISO(),
        saida: null,
        marcador_texto: null,
        marcador_cor: null,
        ...dados,
      };
      setVeiculos((arr) => [novo, ...arr]);
      return { error: null };
    }
    const { error } = await supabase
      .from('veiculos')
      .insert({ ...dados, loja_id: lojaId, situacao: 'estoque' });
    if (!error) await carregar();
    return { error };
  }

  async function salvarMarcador(veic, texto, cor) {
    const patch = { marcador_texto: texto || null, marcador_cor: texto ? cor : null };
    if (demo) {
      setVeiculos((arr) => arr.map((x) => (x.id === veic.id ? { ...x, ...patch } : x)));
      return { error: null };
    }
    const { error } = await supabase.from('veiculos').update(patch).eq('id', veic.id);
    if (!error) await carregar();
    return { error };
  }

  async function registrarVenda(veic, { valor_venda, data_venda, comprador_nome, forma_pagamento }) {
    const novaSituacao = veic.tipo === 'consignado' ? 'repasse' : 'vendido';
    if (demo) {
      const venda = {
        id: globalThis.crypto?.randomUUID?.() || 'demo-' + Date.now(),
        loja_id: 'demo',
        veiculo_id: veic.id,
        valor_venda,
        data_venda,
        comprador_nome,
        forma_pagamento,
      };
      setVendas((arr) => [venda, ...arr]);
      setVeiculos((arr) =>
        arr.map((x) =>
          x.id === veic.id ? { ...x, situacao: novaSituacao, saida: data_venda } : x
        )
      );
      return { error: null };
    }
    const { error: e1 } = await supabase.from('vendas').insert({
      loja_id: lojaId,
      veiculo_id: veic.id,
      valor_venda,
      data_venda,
      comprador_nome: comprador_nome || null,
      forma_pagamento,
      vendedor_id: usuario?.id || null,
    });
    if (e1) return { error: e1 };
    const { error: e2 } = await supabase
      .from('veiculos')
      .update({ situacao: novaSituacao, saida: data_venda })
      .eq('id', veic.id);
    if (!e2) await carregar();
    return { error: e2 };
  }

  return { veiculos, vendas, loading, demo, custosDe, addVeiculo, salvarMarcador, registrarVenda };
}

// Helpers de cálculo (lucro nunca é guardado fixo — sempre calculado).
export const lucroEstimado = (veic, custos) => (veic.pedido || 0) - (veic.compra || 0) - custos;
export const lucroRealizado = (valorVenda, veic, custos) =>
  (valorVenda || 0) - (veic.compra || 0) - custos;
