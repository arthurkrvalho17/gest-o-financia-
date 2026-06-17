import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { hojeISO } from '../../lib/format';
import { demoVeiculos, demoVendas, demoEquipe } from './demoData';
import { totalPrepDemo } from '../preparacao/demoPrep';

// Camada de dados do Estoque.
// - Supabase configurado  -> lê/escreve nas tabelas veiculos e vendas (RLS por loja).
// - Não configurado        -> modo demo, em memória, com os dados do protótipo.
export function useEstoque() {
  const { usuario } = useAuth();
  const lojaId = usuario?.loja_id;
  const demo = !supabaseConfigurado;

  const [veiculos, setVeiculos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [equipe, setEquipe] = useState([]); // vendedores da loja
  const [custosMap, setCustosMap] = useState({}); // veiculo_id -> soma da preparação (modo real)
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (demo) {
      setVeiculos(demoVeiculos());
      setVendas(demoVendas());
      setEquipe(demoEquipe);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: vs }, { data: vd }, { data: gs }, { data: us }] = await Promise.all([
      supabase.from('veiculos').select('*').order('entrada', { ascending: false }),
      supabase.from('vendas').select('*'),
      supabase.from('preparacao_gastos').select('veiculo_id, valor'),
      supabase.from('usuarios').select('id, nome, papel'),
    ]);
    setVeiculos(vs || []);
    setVendas(vd || []);
    setEquipe(us || []);
    // Custo de cada carro = soma dos gastos de preparação (fonte única).
    const m = {};
    for (const g of gs || []) m[g.veiculo_id] = (m[g.veiculo_id] || 0) + (Number(g.valor) || 0);
    setCustosMap(m);
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Custo de preparação do carro = soma de preparacao_gastos do veículo (Fase 2).
  // Lucro nunca é guardado fixo; o custo vem sempre desta fonte única.
  const custosDe = useCallback(
    (veic) => (demo ? totalPrepDemo(veic?.codigo) : custosMap[veic?.id] || 0),
    [demo, custosMap]
  );

  async function addVeiculo(dados) {
    const { fotos, ...campos } = dados; // fotos vão para tabela/Storage à parte
    if (demo) {
      const novo = {
        id: globalThis.crypto?.randomUUID?.() || 'demo-' + Date.now(),
        loja_id: 'demo',
        situacao: 'estoque',
        entrada: hojeISO(),
        saida: null,
        marcador_texto: null,
        marcador_cor: null,
        fotos: fotos || [],
        ...campos,
      };
      setVeiculos((arr) => [novo, ...arr]);
      return { error: null };
    }
    const { data, error } = await supabase
      .from('veiculos')
      .insert({ ...campos, loja_id: lojaId, situacao: 'estoque' })
      .select('id')
      .single();
    // Upload das fotos para o Supabase Storage fica para a fase pós-MVP;
    // aqui só registramos os metadados se já houver URLs.
    if (!error && data?.id && fotos?.length) {
      await supabase.from('veiculo_fotos').insert(
        fotos.filter((f) => f.url && !f.url.startsWith('blob:')).map((f) => ({
          loja_id: lojaId, veiculo_id: data.id, url: f.url, ordem: f.ordem,
        }))
      );
    }
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

  async function registrarVenda(veic, { valor_venda, data_venda, comprador_nome, forma_pagamento, vendedor_id, observacao }) {
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
        vendedor_id,
        observacao,
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
      vendedor_id: vendedor_id || usuario?.id || null,
      observacao: observacao || null,
    });
    if (e1) return { error: e1 };
    const { error: e2 } = await supabase
      .from('veiculos')
      .update({ situacao: novaSituacao, saida: data_venda })
      .eq('id', veic.id);
    if (!e2) await carregar();
    return { error: e2 };
  }

  return { veiculos, vendas, equipe, loading, demo, custosDe, addVeiculo, salvarMarcador, registrarVenda };
}

// Helpers de cálculo (lucro nunca é guardado fixo — sempre calculado).
export const lucroEstimado = (veic, custos) => (veic.pedido || 0) - (veic.compra || 0) - custos;
export const lucroRealizado = (valorVenda, veic, custos) =>
  (valorVenda || 0) - (veic.compra || 0) - custos;
