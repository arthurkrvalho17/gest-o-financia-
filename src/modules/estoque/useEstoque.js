import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { hojeISO } from '../../lib/format';
import { demoVeiculos, demoVendas, getEquipeDemo, addVeiculoDemo, addVendaDemo, updateVeiculoDemo } from './demoData';
import { desempenhoDemo, computarDesempenho } from './demoDesempenho';
import { totalPrepDemo } from '../preparacao/demoPrep';
import { addDoc as addDocFicha } from './demoDocs';
import { uploadFotoVeiculo, uploadDocVeiculo } from '../../lib/storage';
import { anexarCompra } from '../../lib/veiculoValores';

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
      setEquipe(getEquipeDemo());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: vs, error: e1 }, { data: vd, error: e2 }, { data: gs, error: e3 }, { data: us, error: e4 }] = await Promise.all([
      supabase.from('veiculos').select('*').order('entrada', { ascending: false }),
      supabase.from('vendas').select('*'),
      supabase.from('preparacao_gastos').select('veiculo_id, valor'),
      supabase.from('usuarios').select('id, nome, papel'),
    ]);
    const erroCarregar = e1 || e2 || e3 || e4;
    if (erroCarregar) console.error('[Financia+] Erro ao carregar estoque:', erroCarregar.message);
    setVeiculos(await anexarCompra(vs || []));
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
    const { fotos, crlv, compra, ...campos } = dados; // fotos, CRLV e compra vão à parte
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
        compra,
        ...campos,
      };
      addVeiculoDemo(novo); // persiste no store demo (fonte única)
      setVeiculos((arr) => [novo, ...arr]);
      // Usa codigo como chave para compatibilidade com o store demo; cai back no id quando não há codigo.
      if (crlv) addDocFicha(novo.codigo || novo.id, { tipo: 'crlv_e', nome_arquivo: crlv?.name ?? crlv, status: 'anexado' });
      return { error: null, veiculo: novo };
    }
    const { data, error } = await supabase
      .from('veiculos')
      .insert({ ...campos, loja_id: lojaId, situacao: 'estoque' })
      .select('id')
      .single();
    const fotosUrls = []; // URLs assinadas — a publicação pós-save usa direto
    if (!error && data?.id) {
      const veiculoId = data.id;
      // Upload fotos ao Storage e insere metadados em veiculo_fotos
      if (fotos?.length) {
        const fotosRows = [];
        for (const f of fotos) {
          if (f.file) {
            const { url, path } = await uploadFotoVeiculo({ file: f.file, lojaId, veiculoId });
            if (url) fotosRows.push({ loja_id: lojaId, veiculo_id: veiculoId, url, path, ordem: f.ordem });
          } else if (f.url && !f.url.startsWith('blob:')) {
            fotosRows.push({ loja_id: lojaId, veiculo_id: veiculoId, url: f.url, path: null, ordem: f.ordem });
          }
        }
        if (fotosRows.length) {
          await supabase.from('veiculo_fotos').insert(fotosRows);
          fotosUrls.push(...fotosRows.map((r) => ({ url: r.url })));
        }
      }
      // Upload CRLV-e e registra em veiculo_documento
      if (crlv?.file) {
        const { url, path } = await uploadDocVeiculo({ file: crlv.file, lojaId, veiculoId });
        if (url) {
          await supabase.from('veiculo_documento').insert({
            loja_id: lojaId, veiculo_id: veiculoId,
            tipo: 'crlv_e', nome_arquivo: crlv.name,
            arquivo_url: url, arquivo_path: path, status: 'anexado',
            data: hojeISO(),
          });
        }
      }
      // Compra é protegida no banco (migration 0026 — veiculo_valor_compra,
      // RLS só-dono): só grava se vier valor. Um funcionário sempre manda
      // compra=0 (AddVeiculoModal já esconde o campo dele), então esta
      // chamada simplesmente não dispara — nem chega a esbarrar na RLS.
      if (Number(compra) > 0) {
        await supabase.from('veiculo_valor_compra').upsert({
          veiculo_id: veiculoId, loja_id: lojaId, compra: Number(compra),
        });
      }
    }
    if (!error) await carregar();
    return {
      error,
      veiculo: error ? null : { id: data.id, loja_id: lojaId, compra, ...campos, fotos: fotosUrls },
    };
  }

  async function salvarMarcador(veic, texto, cor) {
    const patch = { marcador_texto: texto || null, marcador_cor: texto ? cor : null };
    if (demo) {
      updateVeiculoDemo(veic.id, patch);
      setVeiculos((arr) => arr.map((x) => (x.id === veic.id ? { ...x, ...patch } : x)));
      return { error: null };
    }
    const { error } = await supabase.from('veiculos').update(patch).eq('id', veic.id);
    if (!error) await carregar();
    return { error };
  }

  async function registrarVenda(veic, {
    valor_venda, data_venda, comprador_nome, comprador_cpf, forma_pagamento, origem_lead, vendedor_id, observacao,
    comprador_cep, comprador_logradouro, comprador_numero, comprador_bairro, comprador_cidade, comprador_cidade_ibge, comprador_uf,
  }) {
    const novaSituacao = veic.tipo === 'consignado' ? 'repasse' : 'vendido';
    if (demo) {
      const venda = {
        id: globalThis.crypto?.randomUUID?.() || 'demo-' + Date.now(),
        loja_id: 'demo',
        veiculo_id: veic.id,
        valor_venda,
        data_venda,
        comprador_nome,
        comprador_cpf,
        forma_pagamento,
        origem_lead,
        vendedor_id,
        observacao,
      };
      // Persiste no store demo (fonte única) — Financeiro/CRM enxergam a mesma venda.
      addVendaDemo(venda);
      updateVeiculoDemo(veic.id, { situacao: novaSituacao, saida: data_venda });
      setVendas((arr) => [venda, ...arr]);
      setVeiculos((arr) =>
        arr.map((x) =>
          x.id === veic.id ? { ...x, situacao: novaSituacao, saida: data_venda } : x
        )
      );
      return { error: null };
    }
    const { data: novaVenda, error: e1 } = await supabase
      .from('vendas')
      .insert({
        loja_id: lojaId,
        veiculo_id: veic.id,
        valor_venda,
        data_venda,
        comprador_nome: comprador_nome || null,
        comprador_cpf: comprador_cpf || null,
        forma_pagamento,
        origem_lead: origem_lead || null,
        vendedor_id: vendedor_id || usuario?.id || null,
        observacao: observacao || null,
        comprador_cep: comprador_cep || null,
        comprador_logradouro: comprador_logradouro || null,
        comprador_numero: comprador_numero || null,
        comprador_bairro: comprador_bairro || null,
        comprador_cidade: comprador_cidade || null,
        comprador_cidade_ibge: comprador_cidade_ibge || null,
        comprador_uf: comprador_uf || null,
      })
      .select('id')
      .single();
    if (e1) return { error: e1 };
    const { error: e2 } = await supabase
      .from('veiculos')
      .update({ situacao: novaSituacao, saida: data_venda })
      .eq('id', veic.id);
    if (!e2) await carregar();
    // Emissão de NF-e (Spedy — ADR-17): assíncrona e best-effort. Se a loja
    // não habilitou o complemento, a função só devolve { skip }. Erros de
    // emissão nunca invalidam a venda — ficam registrados em nota_fiscal.
    supabase.functions.invoke('spedy-api', { body: { action: 'emitir', vendaId: novaVenda.id } }).catch(() => {});
    return { error: e2 };
  }

  const desempenho = useMemo(
    () => (demo ? desempenhoDemo : computarDesempenho(vendas, equipe)),
    [demo, vendas, equipe]
  );

  return { veiculos, vendas, equipe, desempenho, loading, demo, custosDe, addVeiculo, salvarMarcador, registrarVenda };
}

// Helpers de cálculo (lucro nunca é guardado fixo — sempre calculado).
export const lucroEstimado = (veic, custos) => (veic.pedido || 0) - (veic.compra || 0) - custos;
export const lucroRealizado = (valorVenda, veic, custos) =>
  (valorVenda || 0) - (veic.compra || 0) - custos;
