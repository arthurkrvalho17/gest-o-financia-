import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVeiculos } from '../estoque/demoData';
import { addDoc as addDocFicha } from '../estoque/demoDocs';

const docsDemoSeed = [
  { id: 'd1', tipo: 'compra_venda', cliente_nome: 'Sandra Mello', titulo: 'Honda Civic Touring · Sandra Mello', criado_em: '2026-06-08', assinatura_status: 'assinado', veiculo_codigo: '8147112' },
  { id: 'd2', tipo: 'recibo_sinal', cliente_nome: 'Juliana Reis', titulo: 'VW Nivus · Juliana Reis', criado_em: '2026-06-06', assinatura_status: null },
  { id: 'd3', tipo: 'compra_venda', cliente_nome: 'Eduardo Pinto', titulo: 'Chevrolet Tracker · Eduardo Pinto', criado_em: '2026-05-28', assinatura_status: 'aguardando', veiculo_codigo: '8148990' },
  { id: 'd4', tipo: 'nota_entrada', cliente_nome: 'compra de particular', titulo: 'Fiat Pulse · compra de particular', criado_em: '2026-05-21', assinatura_status: null },
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
        { id: 'demo-' + Date.now(), tipo, cliente_nome: cliente.nome, titulo,
          criado_em: new Date().toISOString().slice(0, 10),
          assinatura_status: tipo === 'compra_venda' ? 'nao_enviado' : null,
          veiculo_codigo: veiculo?.codigo || null },
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

  // Fluxo de assinatura eletrônica (avançada, Lei 14.063/2020) via plataforma
  // externa (ex.: ZapSign). Demo simula: nao_enviado → aguardando → assinado.
  // Ao assinar, o PDF lacrado + auditoria são guardados na ficha do carro.
  function avancarAssinatura(doc) {
    let novoStatus, msg;
    if (!doc.assinatura_status || doc.assinatura_status === 'nao_enviado') {
      novoStatus = 'aguardando';
      msg = 'Enviado ao cliente para assinar (link por WhatsApp/e-mail)';
    } else if (doc.assinatura_status === 'aguardando') {
      novoStatus = 'assinado';
      msg = 'Assinado pelo cliente · PDF + auditoria guardados na ficha do carro';
      // guarda na ficha do carro (PDF lacrado + relatório de auditoria)
      if (doc.veiculo_codigo) {
        addDocFicha(doc.veiculo_codigo, { tipo: 'compra_venda', nome_arquivo: 'contrato-assinado.pdf', status: 'assinado' });
        addDocFicha(doc.veiculo_codigo, { tipo: 'outro', nome_arquivo: 'trilha-auditoria.pdf', status: 'anexado' });
      }
    } else {
      return { msg: 'Documento já assinado' };
    }
    if (demo) {
      setDocumentos((arr) => arr.map((d) => (d.id === doc.id ? { ...d, assinatura_status: novoStatus } : d)));
    }
    return { msg };
  }

  return { demo, loading, config, veiculos, documentos, salvarConfig, registrarDocumento, modeloDe, uploadModelo, removerModelo, avancarAssinatura };
}
