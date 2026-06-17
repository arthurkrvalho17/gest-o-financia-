import { useEffect, useState } from 'react';
import { Topbar } from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { fmt, ddmm } from '../../lib/format';
import { IconContratos } from '../../components/icons';
import { useContratos } from './useContratos';
import { MODELOS, ORDEM_MODELOS, camposExtra } from './modelos';
import { gerarPdf } from './contratoPdf';

export default function ContratosPage() {
  const ct = useContratos();
  const [tipo, setTipo] = useState(null);

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
        <Painel titulo="Modelos da loja" hint="suba o seu modelo (Word/PDF) por tipo" className="mt-[18px]">
          {ORDEM_MODELOS.map((k) => (
            <div key={k} className="flex items-center gap-3.5 px-[18px] py-3 border-b border-border last:border-b-0">
              <div className="flex-1">
                <div className="font-semibold text-[13.5px]">{MODELOS[k].nome}</div>
                <div className="text-[11.5px] mt-px">
                  {ct.modeloDe(k)
                    ? <span className="text-green font-semibold">Seu modelo: {ct.modeloDe(k).arquivo_nome}</span>
                    : <span className="text-muted-2">Usando modelo padrão FINANCIA+</span>}
                </div>
              </div>
              {ct.modeloDe(k) && (
                <button onClick={() => ct.removerModelo(k)} className="text-[12px] font-semibold text-red hover:underline">Remover</button>
              )}
              <label className="text-[12px] font-semibold text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-1.5 cursor-pointer hover:bg-[#dde9f6]">
                {ct.modeloDe(k) ? 'Trocar' : 'Subir modelo'}
                <input type="file" accept=".doc,.docx,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && ct.uploadModelo(k, e.target.files[0])} />
              </label>
            </div>
          ))}
          <div className="px-[18px] py-2.5 text-[11.5px] text-muted bg-[#FAFBFD] flex gap-2 items-start leading-snug">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[14px] h-[14px] flex-shrink-0 text-blue mt-px"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            No seu modelo, use marcadores como <code>{'{{nome}}'}</code>, <code>{'{{cpf}}'}</code>, <code>{'{{placa}}'}</code> nos lugares a preencher — a geração substitui automaticamente.
          </div>
        </Painel>

        <Painel titulo="Documentos gerados" className="mt-[18px]">
          {ct.documentos.length === 0 && <div className="px-[18px] py-8 text-center text-muted text-[13px]">Nenhum documento gerado ainda.</div>}
          {ct.documentos.map((d) => (
            <div key={d.id} className="flex items-center gap-3.5 px-[18px] py-3.5 border-b border-border last:border-b-0">
              <span className="w-[38px] h-[38px] rounded-[9px] bg-blue-soft text-blue grid place-items-center flex-shrink-0">
                <IconContratos className="w-[18px] h-[18px]" />
              </span>
              <div className="flex-1">
                <div className="font-semibold text-[13.5px]">{MODELOS[d.tipo]?.nome || d.tipo}</div>
                <div className="text-[11.5px] text-muted-2 mt-px">{d.titulo || d.cliente_nome} · {ddmm(d.criado_em)}</div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-[3px] rounded-md bg-bg text-muted">{MODELOS[d.tipo]?.nome?.split(' ')[0] || 'Doc'}</span>
            </div>
          ))}
        </Painel>
      </div>
    </>
  );
}

function Gerador({ ct, tipo, onVoltar }) {
  const toast = useToast();
  const modelo = MODELOS[tipo];
  const usandoModeloLoja = ct.modeloDe(tipo);
  const [cliente, setCliente] = useState({ nome: '', cpf: '', telefone: '' });
  const [veicId, setVeicId] = useState('');
  const [extra, setExtra] = useState({});
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
    ? { id: veicSel.id, modelo: veicSel.modelo, fab_mod: veicSel.fab_mod, placa: veicSel.placa, cor: veicSel.cor, valor: veicSel.pedido, compra: veicSel.compra }
    : null;

  function gerar() {
    if (!cliente.nome.trim()) { toast('Informe o nome do cliente.'); return; }
    const dataStr = new Date().toLocaleDateString('pt-BR');
    gerarPdf({ tipo, config: ct.config, cliente, veiculo: veiculoDoc, extra, dataStr });
    const titulo = `${veiculoDoc?.modelo || 'Sem veículo'} · ${cliente.nome}`;
    ct.registrarDocumento({ tipo, cliente, veiculo: veiculoDoc, extra, titulo });
    toast(usandoModeloLoja ? 'Documento gerado com o seu modelo' : 'Documento gerado com a assinatura da loja');
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
              <button onClick={gerar} className="w-full justify-center inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] py-3 rounded-[9px] mt-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                Gerar PDF
              </button>
            </div>
          </div>
        </div>
      </div>
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
