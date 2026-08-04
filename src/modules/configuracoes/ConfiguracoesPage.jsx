import { useState, useEffect } from 'react';
import { Topbar } from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { brl } from '../../lib/format';
import { getEquipeDemo, addVendedorDemo, removeVendedorDemo } from '../estoque/demoData';
import { CANAIS_ANUNCIO, CANAIS_MENSAGERIA } from '../../integracoes/canais';
import { statusConexao, setStatusConexao } from '../../integracoes/demoIntegr';
import { getIdentidade, setIdentidade } from '../../lib/lojaIdentidade';
import { useAuth } from '../../auth/AuthContext';
import { useOlxAuth } from '../../integracoes/olx/useOlxAuth';
import { useMLAuth } from '../../integracoes/mercado_livre/useMLAuth';
import { useWebmotorsAuth } from '../../integracoes/webmotors/useWebmotorsAuth';
import { useSpedyAuth } from '../../integracoes/spedy/useSpedyAuth';
import Modal from '../../components/Modal';
import { uploadLogo } from '../../lib/storage';
import { supabase } from '../../lib/supabase';

const STATUS_CX = {
  carregando: { label: '…', cls: 'bg-[#EEF2F7] text-muted', dot: '#CBD5E1' },
  conectado: { label: 'Conectado', cls: 'bg-green-soft text-green', dot: '#15803D' },
  desconectado: { label: 'Desconectado', cls: 'bg-[#EEF2F7] text-muted', dot: '#94A3B8' },
  homologacao: { label: 'Em homologação', cls: 'bg-amber-soft text-amber', dot: '#B45309' },
  erro: { label: 'Erro', cls: 'bg-red-soft text-red', dot: '#B91C1C' },
  // OLX: token expira em ~12h e não há refresh — reconectar é o único caminho
  expirado: { label: 'Expirada — reconecte', cls: 'bg-red-soft text-red', dot: '#B91C1C' },
};

// Plano demo (no real vem de loja_plano + provedor de cobrança, ex.: Asaas)
const PLANO_DEMO = {
  plano: 'Gestão', valor_mensal: 149, proxima_cobranca: '10/07/2026', forma_pagamento: 'Cartão de crédito',
};

export default function ConfiguracoesPage() {
  const toast = useToast();
  const { demo, loja } = useAuth();
  const olx = useOlxAuth();
  const ml = useMLAuth();
  const wm = useWebmotorsAuth();
  const spedy = useSpedyAuth();
  const [, force] = useState(0);
  const [complementos, setComplementos] = useState({ ia: false, multicanal: true, nf: false });
  const [novoVendedor, setNovoVendedor] = useState('');
  const [wmModal, setWmModal] = useState(false);
  const [wmForm, setWmForm] = useState({ usuario: '', senha: '' });
  const [nfModal, setNfModal] = useState(false);
  const [certForm, setCertForm] = useState({ file: null, senha: '' });
  const [configFiscalTexto, setConfigFiscalTexto] = useState('');

  useEffect(() => {
    if (olx.erroConexao) toast(`Erro OLX: ${olx.erroConexao}`);
  }, [olx.erroConexao]);
  useEffect(() => {
    if (ml.erroConexao) toast(`Erro Mercado Livre: ${ml.erroConexao}`);
  }, [ml.erroConexao]);
  useEffect(() => {
    if (spedy.status === 'conectado') setComplementos((c) => ({ ...c, nf: true }));
  }, [spedy.status]);

  // Canais com conexão real implementada (fora do demo)
  const authReal = { olx, mercado_livre: ml, webmotors: wm };

  const equipe = getEquipeDemo();

  function addVendedor() {
    if (!novoVendedor.trim()) return;
    addVendedorDemo({ nome: novoVendedor.trim() });
    setNovoVendedor('');
    force((n) => n + 1);
    toast('Vendedor adicionado — já aparece no registro de venda');
  }
  function removeVendedor(id, nome) {
    removeVendedorDemo(id);
    force((n) => n + 1);
    toast(`${nome} removido`);
  }
  function toggleComplemento(k) {
    if (k === 'nf') return toggleComplementoNf();
    setComplementos((c) => ({ ...c, [k]: !c[k] }));
  }
  async function toggleComplementoNf() {
    const ligar = !complementos.nf;
    setComplementos((c) => ({ ...c, nf: ligar }));
    if (!ligar || demo) { setNfModal(false); return; }
    if (spedy.status === 'conectado') { setNfModal(true); return; }
    const { error } = await spedy.provisionar();
    if (error) { toast(`Erro Spedy: ${error.message}`); setComplementos((c) => ({ ...c, nf: false })); return; }
    toast('Empresa provisionada na Spedy — envie o certificado digital e a configuração tributária');
    setNfModal(true);
  }
  async function enviarCertificadoSpedy() {
    if (!certForm.file || !certForm.senha) { toast('Selecione o arquivo .pfx e informe a senha'); return; }
    const { error } = await spedy.enviarCertificado({ file: certForm.file, password: certForm.senha });
    if (error) { toast(`Erro ao enviar certificado: ${error.message}`); return; }
    setCertForm({ file: null, senha: '' });
    toast('Certificado enviado');
  }
  async function salvarConfigFiscalSpedy() {
    let configFiscal;
    try { configFiscal = JSON.parse(configFiscalTexto); }
    catch { toast('JSON inválido — confira a formatação'); return; }
    const { error } = await spedy.salvarConfigFiscal(configFiscal);
    if (error) { toast(`Erro ao salvar: ${error.message}`); return; }
    toast('Configuração tributária salva');
  }
  function conectar(canal, nome) {
    // Webmotors não usa redirect OAuth: abre o formulário do Integrador de API
    if (!demo && canal === 'webmotors') { setWmModal(true); return; }
    if (!demo && authReal[canal]) { authReal[canal].conectar(); return; }
    setStatusConexao(canal, 'conectado');
    force((n) => n + 1);
    toast(`${nome} conectado (demo)`);
  }
  async function conectarWebmotors() {
    const { error } = await wm.conectar(wmForm);
    if (error) { toast(`Erro Webmotors: ${error.message}`); return; }
    setWmModal(false);
    setWmForm({ usuario: '', senha: '' });
    toast('Webmotors conectada');
  }
  async function desconectar(canal, nome) {
    if (!demo && authReal[canal]) { await authReal[canal].desconectar(); toast(`${nome} desconectado`); return; }
    setStatusConexao(canal, 'desconectado');
    force((n) => n + 1);
    toast(`${nome} desconectado`);
  }

  return (
    <>
      <Topbar titulo="Configurações" sub="Identidade, assinatura, vendedores e conexões da loja" />
      <div className="px-7 py-6 max-w-[1240px]">
       {/* Identidade da loja (logo nos documentos) */}
       <div className="bg-white border border-border rounded-card shadow-card overflow-hidden mb-[18px]">
         <div className="px-[18px] py-[15px] border-b border-border">
           <h2 className="text-[14.5px] font-semibold">Identidade da loja</h2>
           <span className="text-[12px] text-muted-2">aparece em destaque no cabeçalho dos documentos (com "Financia+" pequeno ao lado)</span>
         </div>
         <div className="p-[18px] flex items-center gap-5 flex-wrap">
           <div className="w-[140px] h-[60px] rounded-lg border border-border bg-bg grid place-items-center overflow-hidden flex-shrink-0">
             {getIdentidade().logoDataUrl
               ? <img src={getIdentidade().logoDataUrl} alt="logo" className="max-w-full max-h-full object-contain" />
               : <span className="text-[12px] text-muted-2">sem logo</span>}
           </div>
           <div className="flex-1 grid grid-cols-2 gap-3 min-w-[260px]">
             <label className="flex flex-col gap-1.5"><span className="text-[11.5px] font-semibold text-muted">Nome / razão social</span>
               <input value={getIdentidade().nome} onChange={(e) => { setIdentidade({ nome: e.target.value }); force((n) => n + 1); }} className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue" /></label>
             <label className="flex flex-col gap-1.5"><span className="text-[11.5px] font-semibold text-muted">CNPJ</span>
               <input value={getIdentidade().cnpj} onChange={(e) => { setIdentidade({ cnpj: e.target.value }); force((n) => n + 1); }} className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue" /></label>
             <label className="flex flex-col gap-1.5 col-span-2"><span className="text-[11.5px] font-semibold text-muted">Endereço (sede)</span>
               <input value={getIdentidade().endereco} onChange={(e) => { setIdentidade({ endereco: e.target.value }); force((n) => n + 1); }} className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue" /></label>
             <label className="flex flex-col gap-1.5"><span className="text-[11.5px] font-semibold text-muted">Cidade / UF</span>
               <input value={getIdentidade().cidade_uf} onChange={(e) => { setIdentidade({ cidade_uf: e.target.value }); force((n) => n + 1); }} className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue" /></label>
           </div>
           <label className="text-[12.5px] font-semibold text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3.5 py-2.5 cursor-pointer hover:bg-[#dde9f6] self-end">
             Enviar logo
             <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
               const file = e.target.files?.[0]; if (!file) return;
               if (demo) {
                 const reader = new FileReader();
                 reader.onload = () => { setIdentidade({ logoDataUrl: reader.result }); force((n) => n + 1); toast('Logo atualizada'); };
                 reader.readAsDataURL(file);
                 return;
               }
               const { url, path, error } = await uploadLogo({ file, lojaId: loja?.id });
               if (error) { toast(`Erro no upload da logo: ${error.message}`); return; }
               await supabase.from('loja_config').upsert({ loja_id: loja.id, logo_url: url, logo_path: path }, { onConflict: 'loja_id' });
               setIdentidade({ logoDataUrl: url });
               force((n) => n + 1);
               toast('Logo atualizada');
             }} />
           </label>
         </div>
       </div>

       <div className="grid grid-cols-2 gap-[18px] max-[1000px]:grid-cols-1">
        {/* 3.1 Assinatura / Plano */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
          <div className="px-[18px] py-[15px] border-b border-border"><h2 className="text-[14.5px] font-semibold">Assinatura / Plano</h2></div>
          <div className="p-[18px]">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[12px] text-muted">Plano atual</div>
                <div className="text-[22px] font-bold text-navy">{PLANO_DEMO.plano}</div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-bold text-blue num">{brl(PLANO_DEMO.valor_mensal)}</div>
                <div className="text-[11.5px] text-muted-2">por mês</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 text-[13px]">
              <Info k="Próxima cobrança" v={PLANO_DEMO.proxima_cobranca} />
              <Info k="Forma de pagamento" v={PLANO_DEMO.forma_pagamento} />
              <Info k="Usuários ativos" v={`${equipe.length}`} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => toast('Mudar de plano: em breve')} className="flex-1 text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg py-2.5">Mudar de plano</button>
              <button onClick={() => toast('Gerenciar pagamento: em breve')} className="flex-1 text-[12.5px] font-semibold text-navy bg-white border border-border rounded-lg py-2.5 hover:bg-bg">Gerenciar pagamento</button>
            </div>

            <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mt-6 mb-2">Complementos</div>
            <Toggle label="IA de pré-venda (WhatsApp)" on={complementos.ia} onClick={() => toggleComplemento('ia')} />
            <Toggle label="Publicação multicanal" on={complementos.multicanal} onClick={() => toggleComplemento('multicanal')} />
            <Toggle label="Nota Fiscal" on={complementos.nf} onClick={() => toggleComplemento('nf')} />
          </div>
        </div>

        {/* 3.2 Vendedores */}
        <div className="bg-white border border-border rounded-card shadow-card overflow-hidden self-start">
          <div className="px-[18px] py-[15px] border-b border-border flex items-center justify-between">
            <h2 className="text-[14.5px] font-semibold">Vendedores</h2>
            <span className="text-[12px] text-muted-2">aparecem no registro de venda</span>
          </div>
          {equipe.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-[18px] py-3 border-b border-border">
              <div className="w-8 h-8 rounded-full bg-blue-soft text-blue grid place-items-center font-bold text-[12px]">
                {u.nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-[13.5px]">{u.nome}</div>
                <span className={['text-[10.5px] font-semibold px-1.5 py-px rounded', u.papel === 'dono' ? 'bg-blue-soft text-blue' : 'bg-[#EEF2F7] text-muted'].join(' ')}>
                  {u.papel === 'dono' ? 'Dono' : 'Vendedor'}
                </span>
              </div>
              {u.papel !== 'dono' && (
                <button onClick={() => removeVendedor(u.id, u.nome)} className="text-muted-2 hover:text-red hover:bg-red-soft rounded-md px-2 py-1 text-[16px] leading-none">×</button>
              )}
            </div>
          ))}
          <div className="flex gap-2 p-[18px]">
            <input value={novoVendedor} onChange={(e) => setNovoVendedor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addVendedor()}
              placeholder="Nome do vendedor" className="flex-1 text-[13px] px-3 py-2.5 border border-border rounded-lg outline-none focus:border-blue" />
            <button onClick={addVendedor} className="text-[13px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-4">Adicionar</button>
          </div>
          <div className="px-[18px] pb-3 text-[11px] text-muted-2 leading-snug">
            Vendedores são usuários da loja (mesma base do login). No sistema real, adicionar envia um convite de acesso.
          </div>
        </div>
       </div>

       {/* Conexões */}
       <div className="bg-white border border-border rounded-card shadow-card overflow-hidden mt-[18px]">
         <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-border">
           <h2 className="text-[14.5px] font-semibold">Conexões</h2>
           <span className="text-[12px] text-muted-2">as contas são da sua loja — o FINANCIA+ só orquestra</span>
         </div>
         <div className="px-[18px] py-2 text-[11.5px] text-muted-2 border-b border-border">Canais de anúncio</div>
         {CANAIS_ANUNCIO.map((c) => (
           <LinhaConexao
             key={c.chave}
             canal={c}
             statusReal={!demo && authReal[c.chave] ? authReal[c.chave].status : undefined}
             onConectar={conectar}
             onDesconectar={desconectar}
           />
         ))}
         <div className="px-[18px] py-2 text-[11.5px] text-muted-2 border-b border-border border-t">Mensageria</div>
         {CANAIS_MENSAGERIA.map((c) => <LinhaConexao key={c.chave} canal={c} onConectar={conectar} onDesconectar={desconectar} />)}
       </div>

       {/* Emissão de NF-e (Spedy) — sem cadastro em portal nenhum; o Financia+
           provisiona a sub-empresa da loja. Só falta certificado + config fiscal. */}
       {!demo && complementos.nf && (
         <div className="bg-white border border-border rounded-card shadow-card overflow-hidden mt-[18px]">
           <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-border">
             <h2 className="text-[14.5px] font-semibold">Emissão de NF-e</h2>
             <span className={['inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-[2px] rounded-full', (STATUS_CX[spedy.status] || STATUS_CX.desconectado).cls].join(' ')}>
               <span className="w-1.5 h-1.5 rounded-full" style={{ background: (STATUS_CX[spedy.status] || STATUS_CX.desconectado).dot }} />
               {(STATUS_CX[spedy.status] || STATUS_CX.desconectado).label}
             </span>
           </div>
           <div className="p-[18px] text-[12.5px] text-muted leading-relaxed">
             Empresa provisionada na Spedy automaticamente com os dados de cadastro da loja.
             Falta enviar o certificado digital A1 e confirmar com o contador a configuração
             tributária de venda de veículo usado (CFOP, ICMS, PIS/COFINS) antes de habilitar
             a emissão automática de verdade.
             <button onClick={() => setNfModal(true)} className="block mt-3 text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-3.5 py-2">
               Configurar certificado e tributação
             </button>
           </div>
         </div>
       )}
      </div>

      {/* Conectar Webmotors — usuário Integrador de API do Cockpit da loja */}
      <Modal
        open={wmModal}
        onClose={() => setWmModal(false)}
        title="Conectar Webmotors"
        maxWidth={440}
        footer={
          <>
            <button onClick={() => setWmModal(false)} className="text-[12.5px] font-semibold text-muted hover:underline px-2">Cancelar</button>
            <button onClick={conectarWebmotors} className="text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-3.5 py-2">Conectar</button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted leading-relaxed mb-4">
          Use o usuário <strong>"Integrador de API"</strong> da sua loja — criado no Cockpit
          Webmotors em <em>Usuários → Novo usuário → perfil Integrador de API</em> (cada loja
          tem um). A conta é da sua loja; o FINANCIA+ só orquestra.
        </p>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold text-muted">Usuário (Integrador de API)</span>
            <input
              value={wmForm.usuario}
              onChange={(e) => setWmForm((f) => ({ ...f, usuario: e.target.value }))}
              className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold text-muted">Senha</span>
            <input
              type="password"
              value={wmForm.senha}
              onChange={(e) => setWmForm((f) => ({ ...f, senha: e.target.value }))}
              className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue"
            />
          </label>
        </div>
      </Modal>

      {/* Certificado digital + configuração tributária da Spedy (ADR-17) */}
      <Modal
        open={nfModal}
        onClose={() => setNfModal(false)}
        title="Emissão de NF-e — Spedy"
        maxWidth={520}
        footer={<button onClick={() => setNfModal(false)} className="text-[12.5px] font-semibold text-muted hover:underline px-2">Fechar</button>}
      >
        <div className="mb-5">
          <h4 className="text-[13px] font-semibold text-navy mb-1.5">Certificado digital (A1)</h4>
          <p className="text-[12px] text-muted-2 mb-2.5">Enviado direto para a Spedy — o Financia+ não guarda o arquivo.</p>
          <div className="grid gap-2.5">
            <input type="file" accept=".pfx,.p12" onChange={(e) => setCertForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="text-[12.5px]" />
            <input type="password" placeholder="Senha do certificado" value={certForm.senha}
              onChange={(e) => setCertForm((f) => ({ ...f, senha: e.target.value }))}
              className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue" />
            <button onClick={enviarCertificadoSpedy} className="text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-3.5 py-2 self-start">
              Enviar certificado
            </button>
          </div>
        </div>
        <div>
          <h4 className="text-[13px] font-semibold text-navy mb-1.5">Configuração tributária (config_fiscal)</h4>
          <p className="text-[12px] text-muted-2 mb-2.5">
            CFOP, ICMS, PIS/COFINS de venda de veículo usado — <strong>confirme com o contador da
            loja</strong> antes de salvar; o Financia+ não define esses valores sozinho.
          </p>
          <textarea
            value={configFiscalTexto}
            onChange={(e) => setConfigFiscalTexto(e.target.value)}
            rows={8}
            placeholder={'{\n  "ncm": "87032310",\n  "cfop": 5502,\n  "icms": { "origin": 0, "csosn": 400 },\n  "pis": { "cst": 7 },\n  "cofins": { "cst": 7 }\n}'}
            className="w-full text-[12px] font-mono px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue resize-y"
          />
          <button onClick={salvarConfigFiscalSpedy} className="mt-2.5 text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-3.5 py-2">
            Salvar configuração
          </button>
        </div>
      </Modal>
    </>
  );
}

function LinhaConexao({ canal, statusReal, onConectar, onDesconectar }) {
  const statusKey = statusReal ?? statusConexao(canal.chave);
  const st = STATUS_CX[statusKey] || STATUS_CX.desconectado;
  const conectado = statusKey === 'conectado';
  return (
    <div className="flex items-center gap-3.5 px-[18px] py-3 border-b border-border last:border-b-0">
      <div className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 font-bold text-[12px]" style={{ background: canal.cor, color: canal.corTexto }}>{canal.nome[0]}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] flex items-center gap-2">
          {canal.nome}
          <span className={['inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-[2px] rounded-full', st.cls].join(' ')}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} /> {st.label}
          </span>
        </div>
        <div className="text-[11px] text-muted-2 mt-0.5 leading-snug">{canal.nota}</div>
      </div>
      {conectado
        ? <button onClick={() => onDesconectar(canal.chave, canal.nome)} className="text-[12.5px] font-semibold text-red hover:underline px-2">Desconectar</button>
        : <button onClick={() => onConectar(canal.chave, canal.nome)} className="text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-3.5 py-2">Conectar</button>}
    </div>
  );
}

function Info({ k, v }) {
  return <div><div className="text-[11px] text-muted-2">{k}</div><div className="font-semibold text-navy">{v}</div></div>;
}
function Toggle({ label, on, onClick }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-navy">{label}</span>
      <button onClick={onClick} className={['w-10 h-6 rounded-full transition relative', on ? 'bg-blue' : 'bg-[#CBD5E1]'].join(' ')}>
        <span className={['absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all', on ? 'left-[18px]' : 'left-0.5'].join(' ')} />
      </button>
    </div>
  );
}
