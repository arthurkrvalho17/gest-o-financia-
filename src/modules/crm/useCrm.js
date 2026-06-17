import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVendas, demoVeiculos } from '../estoque/demoData';
import { leadsDemo, setLeadsDemo, novoLeadDemo, posVendaDemo, historicoCrm } from './demoCrm';

const mesDe = (iso) => (iso || '').slice(0, 7);
const MES_ATUAL = new Date().toISOString().slice(0, 7);

export function useCrm() {
  const { usuario } = useAuth();
  const lojaId = usuario?.loja_id;
  const demo = !supabaseConfigurado;

  const [leadsRaw, setLeadsRaw] = useState([]);
  const [veiculos, setVeiculos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const carregar = useCallback(async () => {
    if (demo) {
      setLeadsRaw(leadsDemo());
      setVeiculos(demoVeiculos());
      setVendas(demoVendas());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: ls }, { data: vs }, { data: vd }] = await Promise.all([
      supabase.from('leads').select('*').order('criado_em', { ascending: false }),
      supabase.from('veiculos').select('id, modelo, pedido'),
      supabase.from('vendas').select('*'),
    ]);
    setLeadsRaw(ls || []);
    setVeiculos(vs || []);
    setVendas(vd || []);
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Normaliza o lead para exibição (resolve carro/valor).
  const leads = useMemo(() => {
    void tick;
    return (demo ? leadsDemo() : leadsRaw).map((ld) => {
      if (demo) return { ...ld, carLabel: ld.car_label, valor: ld.valor };
      const v = veiculos.find((x) => x.id === ld.veiculo_id);
      return { ...ld, carLabel: v?.modelo || '—', valor: v?.pedido || 0 };
    });
  }, [demo, leadsRaw, veiculos, tick]);

  // Métricas
  const leadsMes = leads.filter((x) => mesDe(x.criado_em) === MES_ATUAL).length;
  const vendasMes = vendas.filter((x) => mesDe(x.data_venda) === MES_ATUAL).length;
  const conversao = leadsMes > 0 ? Math.round((vendasMes / leadsMes) * 100) + '%' : '0%';
  const negociosAbertos = leads.filter((x) => ['novo', 'contato', 'proposta'].includes(x.etapa)).length;

  function leadsPorEtapa(etapa) {
    return leads.filter((x) => x.etapa === etapa);
  }

  async function moverLead(lead, etapa) {
    if (lead.etapa === etapa) return { error: null };
    if (demo) {
      setLeadsDemo(leadsDemo().map((x) => (x.id === lead.id ? { ...x, etapa } : x)));
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('leads').update({ etapa }).eq('id', lead.id);
    if (!error) setLeadsRaw((arr) => arr.map((x) => (x.id === lead.id ? { ...x, etapa } : x)));
    return { error };
  }

  async function addLead(dados) {
    if (demo) {
      setLeadsDemo([novoLeadDemo(dados), ...leadsDemo()]);
      setTick((t) => t + 1);
      return { error: null };
    }
    const { error } = await supabase.from('leads').insert({
      loja_id: lojaId,
      nome: dados.nome,
      telefone: dados.telefone || null,
      origem: dados.origem,
      etapa: 'novo',
      veiculo_id: dados.veiculo_id || null,
    });
    if (!error) await carregar();
    return { error };
  }

  // Pós-venda: demo usa seed; real deriva das vendas (sem rastreio de etapas ainda).
  const posVenda = demo
    ? posVendaDemo
    : vendas.map((v) => ({
        nome: v.comprador_nome || 'Cliente',
        carro: (veiculos.find((x) => x.id === v.veiculo_id)?.modelo || '—') + ' · ' + (v.data_venda || ''),
        steps: [['Entrega', 'none'], ['Transferência', 'none'], ['Avaliação', 'none'], ['Indicação', 'none']],
      }));

  // Histórico: demo usa seed; real agrega leads x vendas por mês (últimos meses).
  const historico = demo ? historicoCrm : historicoReal(leads, vendas);

  return {
    demo, loading, leads, leadsMes, conversao, negociosAbertos,
    leadsPorEtapa, moverLead, addLead, veiculos, posVenda, historico,
  };
}

function historicoReal(leads, vendas) {
  const meses = {};
  for (const l of leads) {
    const m = mesDe(l.criado_em);
    if (!m) continue;
    (meses[m] ||= { leads: 0, vendas: 0, fat: 0 }).leads++;
  }
  for (const v of vendas) {
    const m = mesDe(v.data_venda);
    if (!m) continue;
    const b = (meses[m] ||= { leads: 0, vendas: 0, fat: 0 });
    b.vendas++;
    b.fat += Number(v.valor_venda) || 0;
  }
  return Object.entries(meses)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mes, b]) => ({
      mes,
      leads: b.leads,
      vendas: b.vendas,
      conversao: b.leads > 0 ? Math.round((b.vendas / b.leads) * 100) + '%' : '0%',
      ticket: b.vendas > 0 ? Math.round(b.fat / b.vendas) : 0,
    }));
}
