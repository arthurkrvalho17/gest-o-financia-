import { useEffect, useState } from 'react';
import { Topbar } from '../../components/Layout';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { fmt, ddmm } from '../../lib/format';
import { IconContratos } from '../../components/icons';
import { useContratos } from './useContratos';
import { MODELOS, ORDEM_MODELOS, camposExtra } from './modelos';
import { montarDados, exportarPdf, exportarDocx } from './gerarDocumento';
import ModeloModal from './ModeloModal';
import AssinaturaModal from './AssinaturaModal';

export default function ContratosPage() {
  const ct = useContratos();
  const toast = useToast();
  const [tipo, setTipo] = useState(null);
  const [modeloAlvo, setModeloAlvo] = useState(null);
  const [histAberto, setHistAberto] = useState(false);

  if (tipo) return <Gerador ct={ct} tipo={tipo} onVoltar={() => setTipo(null)} />;

  return (
    <>
      <Topbar titulo="Contratos" sub="Documentos e recibos · a assinatura da loja já vai inclusa" />
      <div className="px-7 py-6 max-w-[1240px]">
        {ct.demo && <DemoBanner />}

        <Painel titulo="Gerar documento" hint="a assinatura da loja já vai inclusa">
          <div className="grid grid-cols-3 gap-3.5 p-[18px] max-[900px]:grid-cols-1">
            {ORDEM_MODELOS.map((k) => (
              <button key={k} onClick={() => setTipo(k)}
                className="text-left bg-white border border-border rounded-xl p-4 flex gap-3 items-start hover:border-blue hover:shadow-[0_2px_12px_rgba(10,22,40,.06)] transition">
                <span className="w-9 h-9 rounded-[9px] bg-blue-soft text-blue grid place-items-center flex-shrink-0">
                  <IconContratos className="w-[18px] h-[18px]" />
                </span>
                <span>
                  <span className="block font-semibold text-[13.5px]">{MODELOS[k].nome}</span>
                  <span className="block text-[11.5px] text-muted-2 mt-0.5 leading-snug">{MODELOS[k].desc}</span>
                  <span className="block text-[10.5px] font-semibold mt-1.5 text-muted-2">
                    {ct.modeloDe(k) ? `📄 Seu modelo: ${ct.modeloDe(k).arquivo_nome}` : 'Modelo padrão FINANCIA+'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Painel>

        {/* Modelos da loja */}
        <Painel titulo="Modelos da loja" hint="clique para ver, editar ou enviar o seu" className="mt-[18px]">
          {ORDEM_MODELOS.map((k) => {
            const m = ct.modeloDe(k);
            return (
              <button key={k} onClick={() => setModeloAlvo(k)}
                className="w-full text-left flex items-center gap-3.5 px-[18px] py-3 border-b border-border last:border-b-0 hover:bg-bg">
                <span className="w-[34px] h-[34px] rounded-[9px] bg-blue-soft text-blue grid place-items-center flex-shrink-0">
                  <IconContratos className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13.5px]">{MODELOS[k].nome}</div>
                  <div className="text-[11.5px] mt-px">
                    {m ? <span className="text-green font-semibold">Seu modelo: {m.arquivo_nome}</span>
                       : <span className="text-muted-2">Usando modelo padrão FINANCIA+</span>}
                  </div>
                </div>
                <span className="text-blue font-semibold text-[12px]">Abrir ▸</span>
              </button>
            );
          })}
          <div className="px-[18px] py-2.5 text-[11.5px] text-muted bg-[#FAFBFD] flex gap-2 items-start leading-snug">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[14px] h-[14px] flex-shrink-0 text-blue mt-px"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            Cada modelo tem a versão <b>Padrão FINANCIA+</b> e a <b>Sua</b> (editada/enviada) — você alterna entre as duas. Os campos <code>{'{{ }}'}</code> são preenchidos na geração.
          </div>
        </Painel>

        <button onClick={() => setHistAberto(true)}
          className="w-full text-left bg-white border border-border rounded-card shadow-card mt-[18px] px-[18px] py-4 flex items-center gap-3.5 hover:bg-bg">
          <span className="w-[38px] h-[38px] rounded-[9px] bg-blue-soft text-blue grid place-items-center flex-shrink-0">
            <IconContratos className="w-[18px] h-[18px]" />
          </span>
          <div className="flex-1">
            <div className="font-semibold text-[13.5px]">Histórico</div>
            <div className="text-[11.5px] text-muted-2 mt-px">todos os documentos já gerados · {ct.documentos.length}</div>
          </div>
          <span className="text-blue font-semibold text-[12px]">Abrir ▸</span>
        </button>
      </div>

      <ModeloModal open={!!modeloAlvo} tipo={modeloAlvo} ct={ct} onClose={() => setModeloAlvo(null)} onToast={toast} />
      <HistoricoModal open={histAberto} documentos={ct.documentos} onClose={() => setHistAberto(false)} />
    </>
  );
}

// Histórico de documentos gerados — agrupado por tipo, com busca.
function HistoricoModal({ open, documentos, onClose }) {
  const [q, setQ] = useState('');
  const ST = { assinado: { l: 'Assinado', c: 'bg-green-soft text-green' }, aguardando: { l: 'Aguardando', c: 'bg-amber-soft text-amber' }, pendente: { l: 'Pendente', c: 'bg-amber-soft text-amber' }, nao_enviado: { l: 'Gerado', c: 'bg-bg text-muted' } };
  const termo = q.trim().toLowerCase();
  const filtrados = documentos.filter((d) => {
    if (!termo) return true;
    return [MODELOS[d.tipo]?.nome, d.titulo, d.cliente_nome, ddmm(d.criado_em)].filter(Boolean).join(' ').toLowerCase().includes(termo);
  });
  const porTipo = ORDEM_MODELOS.map((k) => ({ tipo: k, itens: filtrados.filter((d) => d.tipo === k) })).filter((g) => g.itens.length);

  return (
    <Modal open={open} onClose={onClose} title="Histórico de documentos" maxWidth={620}>
      <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-[11px] py-2 text-muted mb-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px]"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, carro, tipo ou data" className="bg-transparent outline-none text-[13px] text-navy w-full" />
      </div>
      {porTipo.length === 0 && <div className="text-center text-muted text-[13px] py-6">Nenhum documento encontrado.</div>}
      <div className="flex flex-col gap-4 max-h-[55vh] overflow-y-auto">
        {porTipo.map((g) => (
          <div key={g.tipo}>
            <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mb-1.5">{MODELOS[g.tipo]?.nome}</div>
            <div className="rounded-lg border border-border overflow-hidden">
              {g.itens.map((d) => {
                const st = ST[d.assinatura_status || 'nao_enviado'] || ST.nao_enviado;
                return (
                  <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 odd:bg-[#FAFBFD] border-b border-border last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{d.titulo || d.cliente_nome}</div>
                      <div className="text-[11px] text-muted-2">{ddmm(d.criado_em)}</div>
                    </div>
                    <span className={['text-[10.5px] font-semibold px-2 py-1 rounded-md', st.c].join(' ')}>{st.l}</span>
                    <button className="text-[12px] font-semibold text-blue hover:underline">Baixar</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Gerador({ ct, tipo, onVoltar }) {
  const toast = useToast();
  const modelo = MODELOS[tipo];
  const usandoModeloLoja = ct.modeloDe(tipo);
  const [cliente, setCliente] = useState({ nome: '', cpf: '', telefone: '', nascimento: '' });
  const [veicId, setVeicId] = useState('');
  const [extra, setExtra] = useState({});
  const [assinaturaDoc, setAssinaturaDoc] = useState(null);
  const setC = (k, v) => setCliente((p) => ({ ...p, [k]: v }));
  const setE = (k, v) => setExtra((p) => ({ ...p, [k]: v }));

  // Valores padrão dos campos (ex.: poderes da procuração).
  useEffect(() => {
    const init = {};
    for (const c of camposExtra(tipo)) if (c.valorPadrao) init[c.key] = c.valorPadrao;
    setExtra(init);
  }, [tipo]);

  const veicSel = ct.veiculos.find((v) => v.id === veicId);
  const veiculoDoc = veicSel
    ? { id: veicSel.id, codigo: veicSel.codigo, modelo: veicSel.modelo, fab_mod: veicSel.fab_mod, placa: veicSel.placa,
        cor: veicSel.cor, renavam: veicSel.renavam, chassi: veicSel.chassi, km: veicSel.km,
        combustivel: veicSel.combustivel, valor: veicSel.pedido, compra: veicSel.compra }
    : null;

  async function gerar(modo) {
    if (!cliente.nome.trim()) { toast('Informe o nome do cliente.'); return; }
    const dataStr = new Date().toLocaleDateString('pt-BR');
    const conteudo = ct.conteudoAtivoDe(tipo);
    const dados = montarDados({ config: ct.config, cliente, veiculo: veiculoDoc, extra, dataStr });
    const tipoNome = modelo.nome;
    const titulo = `${veiculoDoc?.modelo || 'Sem veículo'} · ${cliente.nome}`;
    if (modo === 'docx') {
      exportarDocx({ conteudo, dados, tipoNome, clienteNome: cliente.nome });
      await ct.registrarDocumento({ tipo, cliente, veiculo: veiculoDoc, extra, titulo });
      toast('DOCX gerado — edite no Word antes de assinar');
      onVoltar();
      return;
    }
    exportarPdf({ conteudo, dados, tipoNome, clienteNome: cliente.nome });
    const { doc } = await ct.registrarDocumento({ tipo, cliente, veiculo: veiculoDoc, extra, titulo });
    setAssinaturaDoc(doc); // abre o fluxo de assinatura
  }

  function concluirAssinatura(via) {
    const { status } = ct.concluirAssinatura(assinaturaDoc, via, veiculoDoc);
    setAssinaturaDoc(null);
    toast(status === 'assinado' ? 'Assinado · guardado na ficha do carro' : 'Aguardando assinatura física · pendente na ficha');
    onVoltar();
  }

  return (
    <>
      <Topbar titulo="Contratos" sub={modelo.nome} />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="flex items-center gap-3.5 mb-[18px]">
          <button onClick={onVoltar} className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px] hover:bg-bg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Voltar
          </button>
          <div>
            <h2 className="text-[17px] font-bold">{modelo.nome}</h2>
            <div className="text-[12px] text-muted">Preencha o cliente e selecione o carro — o resto é automático</div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-[18px] max-[900px]:grid-cols-1">
          <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
            <div className="px-[18px] py-[15px] border-b border-border"><h2 className="text-[14.5px] font-semibold">Dados do documento</h2></div>
            <div className="p-[18px]">
              {modelo.notaLegal && (
                <div className="text-[11.5px] text-amber bg-amber-soft rounded-lg px-3 py-2.5 mb-4 leading-snug">⚖️ {modelo.notaLegal}</div>
              )}

              <Legenda>Cliente</Legenda>
              <div className="grid grid-cols-2 gap-3">
                <F label="Nome completo" full><I v={cliente.nome} on={(v) => setC('nome', v)} ph="Nome do cliente" /></F>
                <F label="CPF"><I v={cliente.cpf} on={(v) => setC('cpf', v)} ph="000.000.000-00" /></F>
                <F label="Telefone"><I v={cliente.telefone} on={(v) => setC('telefone', v)} ph="(00) 00000-0000" /></F>
                <F label="Data de nascimento"><input type="date" value={cliente.nascimento} onChange={(e) => setC('nascimento', e.target.value)} className="inp" /></F>
              </div>

              <Legenda className="mt-[22px]">Veículo</Legenda>
              <F label="Selecione o carro do estoque" full>
                <select value={veicId} onChange={(e) => setVeicId(e.target.value)} className="inp">
                  <option value="">— escolher veículo do estoque —</option>
                  {ct.veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo} · {v.fab_mod} · {v.placa}</option>)}
                </select>
              </F>
              {veiculoDoc && (
                <div className="mt-3.5 bg-blue-soft rounded-[10px] p-3.5">
                  <div className="text-[10.5px] font-semibold text-blue flex items-center gap-1.5 mb-2.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
                    Preenchido do estoque automaticamente
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] font-semibold">
                    <Prev k="Modelo" v={veiculoDoc.modelo} /><Prev k="Ano" v={veiculoDoc.fab_mod} />
                    <Prev k="Placa" v={veiculoDoc.placa} /><Prev k="Cor" v={veiculoDoc.cor} />
                    <Prev k="RENAVAM" v={veiculoDoc.renavam} /><Prev k="Chassi" v={veiculoDoc.chassi} />
                    <Prev k="KM" v={veiculoDoc.km != null ? Number(veiculoDoc.km).toLocaleString('pt-BR') : '—'} />
                    <Prev k="Combustível" v={veiculoDoc.combustivel} />
                    <Prev k="Valor" v={fmt(veiculoDoc.valor)} />
                  </div>
                </div>
              )}

              {modelo.grupos.map((g) => (
                <div key={g.titulo}>
                  <Legenda className="mt-[22px]">{g.titulo}</Legenda>
                  <div className="grid grid-cols-2 gap-3">
                    {g.campos.map((c) => (
                      <F key={c.key} label={c.label} full={c.full || c.textarea}>
                        {c.textarea
                          ? <textarea value={extra[c.key] || ''} onChange={(e) => setE(c.key, e.target.value)} rows={2} className="inp resize-y" />
                          : <I v={extra[c.key] || ''} on={(v) => setE(c.key, v)} ph={c.dinheiro ? 'R$ 0,00' : ''} cls={c.dinheiro ? 'num' : ''} />}
                      </F>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-border rounded-card shadow-card overflow-hidden self-start">
            <div className="px-[18px] py-[15px] border-b border-border"><h2 className="text-[14.5px] font-semibold">Assinatura da loja</h2></div>
            <div className="p-[18px]">
              <div className="border border-border rounded-[10px] p-4 bg-bg text-center">
                <div className="italic font-bold text-[19px] text-navy">{ct.config.assinatura_nome || 'Minha loja'}</div>
                <div className="border-t-[1.5px] border-navy mx-6 my-1.5" />
                <div className="text-[11px] text-muted">{ct.config.assinatura_cnpj ? `CNPJ ${ct.config.assinatura_cnpj}` : 'CNPJ não configurado'}</div>
              </div>
              <div className={['text-[11.5px] font-semibold rounded-lg px-3 py-2 mt-3.5', usandoModeloLoja ? 'bg-green-soft text-green' : 'bg-blue-soft text-blue'].join(' ')}>
                {usandoModeloLoja ? `Usando o SEU modelo: ${usandoModeloLoja.arquivo_nome}` : 'Usando o modelo padrão FINANCIA+'}
              </div>
              <button onClick={() => gerar('pdf')} className="w-full justify-center inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] py-3 rounded-[9px] mt-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                Gerar PDF e assinar
              </button>
              <button onClick={() => gerar('docx')} className="w-full justify-center inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-[13px] py-2.5 rounded-[9px] mt-2 hover:bg-bg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>
                Gerar DOCX (editável)
              </button>
              <p className="text-[11px] text-muted-2 mt-2 leading-snug">DOCX para alterar algo pontual no Word antes de assinar.</p>
            </div>
          </div>
        </div>
      </div>
      <AssinaturaModal open={!!assinaturaDoc} onClose={() => setAssinaturaDoc(null)} onConcluir={concluirAssinatura} />
      <style>{`.inp{font-size:13.5px;padding:9px 11px;border:1px solid #E2E8F0;border-radius:8px;outline:none;background:#fff;width:100%}.inp:focus{border-color:#185FA5}`}</style>
    </>
  );
}

function DemoBanner() {
  return (
    <div className="mb-4 text-[12px] text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-2 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-blue inline-block" />
      Modo demonstração. Configure o Supabase no <code>.env.local</code> para dados reais.
    </div>
  );
}
function Painel({ titulo, hint, className = '', children }) {
  return (
    <div className={['bg-white border border-border rounded-card shadow-card overflow-hidden', className].join(' ')}>
      <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-border">
        <h2 className="text-[14.5px] font-semibold">{titulo}</h2>
        {hint && <span className="text-[12px] text-muted-2">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function Legenda({ children, className = '' }) {
  return <div className={['text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mb-3', className].join(' ')}>{children}</div>;
}
function F({ label, full, children }) {
  return (
    <div className={['flex flex-col gap-1.5', full ? 'col-span-2' : ''].join(' ')}>
      <label className="text-[11.5px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}
function I({ v, on, ph, cls = '' }) {
  return <input value={v} onChange={(e) => on(e.target.value)} placeholder={ph} className={`inp ${cls}`} />;
}
function Prev({ k, v }) {
  return <div><span className="block text-[10.5px] text-muted font-medium mb-px">{k}</span>{v || '—'}</div>;
}
