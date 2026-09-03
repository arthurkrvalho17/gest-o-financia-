import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVendas, demoVeiculos } from '../estoque/demoData';
import { leadsDemo, setLeadsDemo, novoLeadDemo, historicoCrm, conversasDemo, enviarMensagemDemo,
  getRegras, setRegra, nomeVendedor, novoLeadDistribuido } from './demoCrm';

const mesDe = (iso) => (iso || '').slice(0, 7);

export function useCrm() {
  const MES_ATUAL = new Date().toISOString().slice(0, 7);
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
    const [{ data: ls, error: e1 }, { data: vs, error: e2 }, { data: vd, error: e3 }] = await Promise.all([
      supabase.from('leads').select('*').order('criado_em', { ascending: false }),
      supabase.from('veiculos').select('id, modelo, pedido'),
      supabase.from('vendas').select('*'),
    ]);
    const erroCarregar = e1 || e2 || e3;
    if (erroCarregar) console.error('[Financia+] Erro ao carregar CRM:', erroCarregar.message);
    setLeadsRaw(ls || []);
    setVeiculos(vs || []);
    setVendas(vd || []);
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Normaliza o lead para exibição (resolve carro/valor/origem/vendedor).
  const leads = useMemo(() => {
    void tick;
    return (demo ? leadsDemo() : leadsRaw).map((ld) => {
      const base = { ...ld, origem: ld.canal_origem, vendedorNome: nomeVendedor(ld.vendedor_id) };
      if (demo) return { ...base, carLabel: ld.car_label, valor: ld.valor };
      const v = veiculos.find((x) => x.id === ld.veiculo_id);
      return { ...base, carLabel: v?.modelo || '—', valor: v?.pedido || 0 };
    });
  }, [demo, leadsRaw, veiculos, tick]);

  // Métricas
  const leadsMes = leads.filter((x) => mesDe(x.criado_em) === MES_ATUAL).length;
  const vendasMes = vendas.filter((x) => mesDe(x.data_venda) === MES_ATUAL).length;
  const conversao = leadsMes > 0 ? Math.round((vendasMes / leadsMes) * 100) + '%' : '0%';
  const abertasEtapas = ['novo', 'conversa', 'negociacao', 'agendado', 'ficha'];
  const negociosAbertos = leads.filter((x) => abertasEtapas.includes(x.etapa)).length;

  // Canal que mais vendeu — agrupa as vendas do mês por origem_lead.
  function canalMaisVendeu(mes) {
    const vs = vendas.filter((v) => mesDe(v.data_venda) === mes);
    if (!vs.length) return { canal: null, count: 0, total: 0 };
    const cont = {};
    for (const v of vs) { const c = v.origem_lead || 'outro'; cont[c] = (cont[c] || 0) + 1; }
    const [canal, count] = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
    return { canal, count, total: vs.length };
  }
  const canalTopMes = canalMaisVendeu(MES_ATUAL);

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
      canal_origem: dados.origem,
      vendedor_id: dados.vendedor_id || null,
      etapa: 'novo',
      veiculo_id: dados.veiculo_id || null,
    });
    if (!error) await carregar();
    return { error };
  }

  // Distribuição automática: simula um lead chegando de um canal → entra em "Novo
  // lead" já com o vendedor responsável pela regra do canal.
  function simularLead(canal) {
    const nomes = ['Carlos Aguiar', 'Fernanda Lima', 'Paulo Sérgio', 'Beatriz Nunes', 'Diego Ramos'];
    const nome = nomes[Math.floor(Math.random() * nomes.length)];
    if (demo) {
      const lead = novoLeadDistribuido({ nome, telefone: '(11) 9' + Math.floor(10000000 + Math.random() * 8e7), canal, carLabel: 'A definir', valor: 0 });
      setLeadsDemo([lead, ...leadsDemo()]);
      setTick((t) => t + 1);
      return lead;
    }
    return null;
  }

  // Histórico: demo usa seed; real agrega leads x vendas por mês (últimos meses).
  const historico = useMemo(
    () => (demo ? historicoCrm : historicoReal(leads, vendas)),
    [demo, leads, vendas]
  );

  // Conversas (inbox) — cada conversa resolve o lead pelo nome (demo).
  const conversas = useMemo(
    () =>
      demo
        ? conversasDemo().map((c) => ({ ...c, lead: leads.find((l) => l.nome === c.leadNome) || null }))
        : [],
    [demo, leads, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function enviarMensagem(conversa, texto, tipo = 'texto') {
    if (demo) {
      enviarMensagemDemo(conversa.id, texto, tipo);
      setTick((t) => t + 1);
    }
    // real: insert em "mensagem" + envio via getConectorMensageria (fase futura)
  }

  function definirRegra(canal, regra) { setRegra(canal, regra); setTick((t) => t + 1); }

  return {
    demo, loading, leads, leadsMes, conversao, negociosAbertos, canalTopMes,
    leadsPorEtapa, moverLead, addLead, veiculos, historico,
    conversas, enviarMensagem,
    // distribuição
    getRegras, definirRegra, simularLead,
  };
}

function historicoReal(leads, vendas) {
  const meses = {};
  for (const l of leads) {
    const m = mesDe(l.criado_em);
    if (!m) continue;
    (meses[m] ||= { leads: 0, vendas: 0, canais: {} }).leads++;
  }
  for (const v of vendas) {
    const m = mesDe(v.data_venda);
    if (!m) continue;
    const b = (meses[m] ||= { leads: 0, vendas: 0, canais: {} });
    b.vendas++;
    const c = v.origem_lead || 'outro';
    b.canais[c] = (b.canais[c] || 0) + 1;
  }
  return Object.entries(meses)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mes, b]) => {
      const top = Object.entries(b.canais).sort((x, y) => y[1] - x[1])[0];
      return {
        mes,
        leads: b.leads,
        vendas: b.vendas,
        conversao: b.leads > 0 ? Math.round((b.vendas / b.leads) * 100) + '%' : '0%',
        canalTop: top ? top[0] : null,
      };
    });
}
