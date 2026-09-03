import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { demoVeiculos } from '../estoque/demoData';
import { addDoc as addDocFicha } from '../estoque/demoDocs';
import { getModeloLoja, conteudoAtivo, conteudoPadrao, salvarEditadoDemo, definirOrigemDemo, voltarPadraoDemo, enviarProprioDemo } from './demoModelos';
import { getIdentidade } from '../../lib/lojaIdentidade';
import { anexarCompra } from '../../lib/veiculoValores';
import { uploadAssinatura } from '../../lib/storage';

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
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (demo) {
      const id = getIdentidade();
      setConfig({ assinatura_nome: id.nome, assinatura_cnpj: id.cnpj });
      setVeiculos(demoVeiculos());
      setDocumentos(docsDemoSeed.map((d) => ({ ...d })));
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: cfg }, { data: vs }, { data: ds }] = await Promise.all([
      supabase.from('loja_config').select('*').eq('loja_id', lojaId).maybeSingle(),
      supabase.from('veiculos').select('*'),
      supabase.from('documentos').select('*').order('criado_em', { ascending: false }),
    ]);
    setConfig(cfg || { assinatura_nome: loja?.nome || '', assinatura_cnpj: '' });
    setVeiculos(await anexarCompra(vs || []));
    setDocumentos(ds || []);
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

  // Registra o documento gerado (o PDF/DOCX é baixado pelo navegador). Retorna o doc.
  async function registrarDocumento({ tipo, cliente, veiculo, extra, titulo }) {
    if (demo) {
      const doc = {
        id: 'demo-' + Date.now(), tipo, cliente_nome: cliente.nome, titulo,
        criado_em: new Date().toISOString().slice(0, 10),
        assinatura_status: 'nao_enviado',
        veiculo_codigo: veiculo?.codigo || null,
      };
      setDocumentos((arr) => [doc, ...arr]);
      return { error: null, doc };
    }
    const { data: doc, error } = await supabase
      .from('documentos')
      .insert({
        loja_id: lojaId,
        tipo,
        veiculo_id: veiculo?.id || null,
        cliente_nome: cliente.nome || null,
        cliente_cpf: cliente.cpf || null,
        dados: { ...extra, titulo },
      })
      .select()
      .single();
    // Achado (31/08-01/09/2026): faltava o .select().single() — sem o `doc`
    // de volta, ContratosPage.gerar() fazia setAssinaturaDoc(undefined) e o
    // modal de assinatura NUNCA abria fora do modo demo.
    if (!error) await carregar();
    return { error, doc };
  }

  // ---- Modelos da loja (Padrão FINANCIA+ × Seu modelo) ----
  // (No modo real, persistir em contrato_modelo; aqui o demo é a fonte.)
  const [, forcarModelos] = useState(0);
  const info = (tipo) => getModeloLoja(tipo);
  const conteudoAtivoDe = (tipo) => conteudoAtivo(tipo);
  const conteudoPadraoDe = (tipo) => conteudoPadrao(tipo);

  function salvarModeloEditado(tipo, conteudo) {
    salvarEditadoDemo(tipo, conteudo);
    forcarModelos((n) => n + 1);
  }
  function definirOrigemModelo(tipo, origem) {
    definirOrigemDemo(tipo, origem);
    forcarModelos((n) => n + 1);
  }
  function voltarPadraoModelo(tipo) {
    voltarPadraoDemo(tipo);
    forcarModelos((n) => n + 1);
  }
  function enviarModeloProprio(tipo, file) {
    enviarProprioDemo(tipo, file?.name || 'modelo');
    forcarModelos((n) => n + 1);
  }
  // compat: indica se há modelo do lojista (editado ou enviado) para um tipo
  function modeloDe(tipo) {
    const m = getModeloLoja(tipo);
    if (m.origem === 'enviado' && m.arquivoEnviado) return { arquivo_nome: m.arquivoEnviado.nome };
    if (m.origem === 'editado' && m.conteudoEditado) return { arquivo_nome: 'modelo editado' };
    return null;
  }

  // Registro de aceite do cliente por uma das 3 vias. HOJE isso é um
  // registro INTERNO — sem identificação do signatário, hash do documento,
  // carimbo de tempo ou log (nenhuma plataforma de assinatura eletrônica
  // está integrada; achado de 31/08-01/09/2026, ver cérebro/Gestão). Nada
  // aqui tem valor de assinatura eletrônica avançada nem gera trilha de
  // auditoria de verdade.
  // "impressao" fica Pendente (até anexar o físico); as demais ficam
  // Assinado. Via "aparelho": se vier `assinaturaBlob` (o traço desenhado
  // no canvas), sobe pro Storage privado — é só o registro visual do
  // traço, guardado como tal, nunca prometido como mais que isso.
  async function concluirAssinatura(doc, via, veiculo, assinaturaBlob) {
    const status = via === 'impressao' ? 'pendente' : 'assinado';
    const codigo = veiculo?.codigo || doc?.veiculo_codigo;
    if (codigo) addDocFicha(codigo, { tipo: doc.tipo, nome_arquivo: 'documento-assinado.pdf', status });

    if (demo) {
      setDocumentos((arr) => arr.map((d) => (d.id === doc.id ? { ...d, assinatura_status: status } : d)));
      return { status };
    }

    let assinatura_imagem_path;
    if (assinaturaBlob) {
      const { path, error: erroUpload } = await uploadAssinatura({ blob: assinaturaBlob, lojaId, documentoId: doc.id });
      if (erroUpload) return { error: erroUpload };
      assinatura_imagem_path = path;
    }

    const { error } = await supabase
      .from('documentos')
      .update({ assinatura_status: status, ...(assinatura_imagem_path ? { assinatura_imagem_path } : {}) })
      .eq('id', doc.id);
    if (!error) await carregar();
    return { error, status };
  }

  return {
    demo, loading, config, veiculos, documentos, salvarConfig, registrarDocumento,
    concluirAssinatura,
    // modelos
    modeloDe, modeloInfo: info, conteudoAtivoDe, conteudoPadraoDe,
    salvarModeloEditado, definirOrigemModelo, voltarPadraoModelo, enviarModeloProprio,
  };
}
