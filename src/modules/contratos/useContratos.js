import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVeiculos } from '../estoque/demoData';

const docsDemoSeed = [
  { id: 'd1', tipo: 'compra_venda', cliente_nome: 'Sandra Mello', titulo: 'Honda Civic Touring · Sandra Mello', criado_em: '2026-06-08' },
  { id: 'd2', tipo: 'recibo_sinal', cliente_nome: 'Juliana Reis', titulo: 'VW Nivus · Juliana Reis', criado_em: '2026-06-06' },
  { id: 'd3', tipo: 'compra_venda', cliente_nome: 'Eduardo Pinto', titulo: 'Chevrolet Tracker · Eduardo Pinto', criado_em: '2026-05-28' },
  { id: 'd4', tipo: 'nota_entrada', cliente_nome: 'compra de particular', titulo: 'Fiat Pulse · compra de particular', criado_em: '2026-05-21' },
];

export function useContratos() {
  const { usuario, loja } = useAuth();
  const lojaId = usuario?.loja_id;
  const demo = !supabaseConfigurado;

  const [config, setConfig] = useState({ assinatura_nome: '', assinatura_cnpj: '' });
  const [veiculos, setVeiculos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [modelosLoja, setModelosLoja] = useState({}); // tipo -> { arquivo_nome }
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (demo) {
      setConfig({ assinatura_nome: 'Auto Mendes Veículos', assinatura_cnpj: '00.000.000/0001-00' });
      setVeiculos(demoVeiculos());
      setDocumentos(docsDemoSeed.map((d) => ({ ...d })));
      setModelosLoja({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: cfg }, { data: vs }, { data: ds }, { data: ms }] = await Promise.all([
      supabase.from('loja_config').select('*').eq('loja_id', lojaId).maybeSingle(),
      supabase.from('veiculos').select('*'),
      supabase.from('documentos').select('*').order('criado_em', { ascending: false }),
      supabase.from('modelos_documento').select('*'),
    ]);
    setConfig(cfg || { assinatura_nome: loja?.nome || '', assinatura_cnpj: '' });
    setVeiculos(vs || []);
    setDocumentos(ds || []);
    const mp = {};
    for (const m of ms || []) mp[m.tipo] = m;
    setModelosLoja(mp);
    setLoading(false);
  }, [demo, lojaId, loja]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvarConfig(patch) {
    const novo = { ...config, ...patch };
    setConfig(novo);
    if (demo) return { error: null };
    const { error } = await supabase
      .from('loja_config')
      .upsert({ loja_id: lojaId, ...novo }, { onConflict: 'loja_id' });
    return { error };
  }

  // Registra o documento gerado (o PDF em si é baixado pelo navegador).
  async function registrarDocumento({ tipo, cliente, veiculo, extra, titulo }) {
    if (demo) {
      setDocumentos((arr) => [
        { id: 'demo-' + Date.now(), tipo, cliente_nome: cliente.nome, titulo, criado_em: new Date().toISOString().slice(0, 10) },
        ...arr,
      ]);
      return { error: null };
    }
    const { error } = await supabase.from('documentos').insert({
      loja_id: lojaId,
      tipo,
      veiculo_id: veiculo?.id || null,
      cliente_nome: cliente.nome || null,
      cliente_cpf: cliente.cpf || null,
      dados: { ...extra, titulo },
    });
    if (!error) await carregar();
    return { error };
  }

  function modeloDe(tipo) {
    return modelosLoja[tipo] || null;
  }

  // Sobe o modelo do lojista para um tipo. (Upload real ao Storage fica para
  // a fase pós-MVP; aqui registramos o nome do arquivo + mapeamento por placeholders.)
  async function uploadModelo(tipo, file) {
    const arquivo_nome = file?.name || 'modelo';
    if (demo) {
      setModelosLoja((m) => ({ ...m, [tipo]: { tipo, arquivo_nome } }));
      return { error: null };
    }
    const { error } = await supabase
      .from('modelos_documento')
      .upsert({ loja_id: lojaId, tipo, arquivo_url: arquivo_nome, mapeamento_campos: { modo: 'placeholders' } }, { onConflict: 'loja_id,tipo' });
    if (!error) await carregar();
    return { error };
  }

  async function removerModelo(tipo) {
    if (demo) {
      setModelosLoja((m) => { const n = { ...m }; delete n[tipo]; return n; });
      return { error: null };
    }
    const { error } = await supabase.from('modelos_documento').delete().eq('loja_id', lojaId).eq('tipo', tipo);
    if (!error) await carregar();
    return { error };
  }

  return { demo, loading, config, veiculos, documentos, salvarConfig, registrarDocumento, modeloDe, uploadModelo, removerModelo };
}
