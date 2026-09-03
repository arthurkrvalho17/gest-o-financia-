import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { parseBR } from '../../lib/format';
import { CANAIS_ANUNCIO } from '../../integracoes/canais';
import { parseFabMod } from '../../lib/veiculoAno';
import { validarCamposRenave } from './validacaoRenave';
import { buscarCep } from '../../lib/cep';

const VAZIO = {
  codigo: '', modelo: '', fab_mod: '', cor: '', placa: '', renavam: '', chassi: '', km: '',
  combustivel: '', versao: '', portas: '', tipo: 'proprio', compra: '', pedido: '', minimo: '', descricao: '',
  consignante_nome: '', consignante_cnpj: '', consignante_tel: '', consignante_endereco: '',
  // RENAVE (ADR-16) — ano_fabricacao/ano_modelo autopreenchidos a partir de
  // fab_mod (ao sair do campo), mas continuam editáveis por cima.
  ano_fabricacao: '', ano_modelo: '', codigo_fipe: '', chave_nfe_compra: '',
  // Origem do veículo — de quem a loja comprou (alimenta client + nfe/purchase
  // da Renave Fácil quando o RENAVE estiver ativo; opcional do contrário).
  vendedor_origem_nome: '', vendedor_origem_cpf_cnpj: '',
  vendedor_origem_cep: '', vendedor_origem_logradouro: '', vendedor_origem_numero: '',
  vendedor_origem_complemento: '', vendedor_origem_bairro: '', vendedor_origem_cidade: '', vendedor_origem_uf: '',
};

export default function AddVeiculoModal({ open, ehDono = true, canaisConectados = {}, onClose, onSave }) {
  const [f, setF] = useState(VAZIO);
  const [fotos, setFotos] = useState([]); // {file, url, nome} — a primeira é a capa
  const [dragIdx, setDragIdx] = useState(null);
  const [crlv, setCrlv] = useState(null); // nome do arquivo CRLV-e anexado
  const [publicarEm, setPublicarEm] = useState([]); // canais marcados para publicar ao salvar
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [buscandoCepOrigem, setBuscandoCepOrigem] = useState(false);
  const [erroCepOrigem, setErroCepOrigem] = useState('');
  const renaveAtivo = !!canaisConectados.renave;

  function moverFoto(from, to) {
    if (from === to || from == null || to == null) return;
    setFotos((arr) => {
      const novo = [...arr];
      const [item] = novo.splice(from, 1);
      novo.splice(to, 0, item);
      return novo;
    });
  }

  useEffect(() => {
    if (open) {
      setF(VAZIO);
      setFotos([]);
      setCrlv(null);
      setPublicarEm([]);
      setErro('');
      setAviso('');
    }
  }, [open]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function addFotos(fileList) {
    const novas = Array.from(fileList || []).map((file) => ({ file, url: URL.createObjectURL(file), nome: file.name }));
    setFotos((arr) => [...arr, ...novas]);
  }

  // Deriva ano_fabricacao/ano_modelo de fab_mod ao sair do campo — só
  // preenche se o lojista ainda não tiver digitado nada nos dois (nunca
  // sobrescreve um ajuste manual).
  function handleFabModBlur() {
    if (f.ano_fabricacao || f.ano_modelo) return;
    const { anoFabricacao, anoModelo } = parseFabMod(f.fab_mod);
    if (anoFabricacao) set('ano_fabricacao', String(anoFabricacao));
    if (anoModelo) set('ano_modelo', String(anoModelo));
  }

  async function handleCepOrigemBlur() {
    const digitos = f.vendedor_origem_cep.replace(/\D/g, '');
    if (digitos.length !== 8) return;
    setBuscandoCepOrigem(true);
    setErroCepOrigem('');
    const r = await buscarCep(digitos);
    setBuscandoCepOrigem(false);
    if (r.erro) { setErroCepOrigem(r.erro); return; }
    set('vendedor_origem_logradouro', r.logradouro);
    set('vendedor_origem_bairro', r.bairro);
    set('vendedor_origem_cidade', r.cidade);
    set('vendedor_origem_uf', r.uf);
  }

  function salvar() {
    if (!f.modelo.trim()) {
      setErro('Informe ao menos o modelo do veículo.');
      return;
    }
    const candidato = {
      placa: f.placa.trim(),
      renavam: f.renavam.trim(),
      chassi: f.chassi.trim(),
      ano_fabricacao: parseInt(f.ano_fabricacao, 10) || null,
      ano_modelo: parseInt(f.ano_modelo, 10) || null,
    };
    const erroRenave = validarCamposRenave(candidato, renaveAtivo);
    if (erroRenave) {
      setErro(erroRenave);
      return;
    }
    onSave({
      codigo: f.codigo.trim() || null,
      modelo: f.modelo.trim(),
      fab_mod: f.fab_mod.trim() || null,
      cor: f.cor.trim() || null,
      placa: f.placa.trim().toUpperCase() || null,
      renavam: f.renavam.trim() || null,
      chassi: f.chassi.trim() || null,
      km: parseInt(String(f.km).replace(/\D/g, ''), 10) || null,
      combustivel: f.combustivel.trim() || null,
      versao: f.versao.trim() || null,
      portas: parseInt(String(f.portas).replace(/\D/g, ''), 10) || null,
      tipo: f.tipo,
      // RENAVE (ADR-16): dados de fabricação/FIPE/NF-e de compra e origem do
      // veículo — nunca obrigatórios no banco; só validados acima quando a
      // loja tem o canal RENAVE conectado.
      ano_fabricacao: candidato.ano_fabricacao,
      ano_modelo: candidato.ano_modelo,
      codigo_fipe: f.codigo_fipe.trim() || null,
      chave_nfe_compra: f.chave_nfe_compra.trim() || null,
      vendedor_origem_nome: f.vendedor_origem_nome.trim() || null,
      vendedor_origem_cpf_cnpj: f.vendedor_origem_cpf_cnpj.trim() || null,
      vendedor_origem_cep: f.vendedor_origem_cep.replace(/\D/g, '') || null,
      vendedor_origem_logradouro: f.vendedor_origem_logradouro.trim() || null,
      vendedor_origem_numero: f.vendedor_origem_numero.trim() || null,
      vendedor_origem_complemento: f.vendedor_origem_complemento.trim() || null,
      vendedor_origem_bairro: f.vendedor_origem_bairro.trim() || null,
      vendedor_origem_cidade: f.vendedor_origem_cidade.trim() || null,
      vendedor_origem_uf: f.vendedor_origem_uf.trim() || null,
      compra: ehDono ? parseBR(f.compra) : 0,
      pedido: parseBR(f.pedido),
      minimo: parseBR(f.minimo),
      descricao: f.descricao.trim() || null,
      // consignante (empresa dona) — só quando consignado; alimenta a consignação
      consignante_nome: f.tipo === 'consignado' ? f.consignante_nome.trim() || null : null,
      consignante_cnpj: f.tipo === 'consignado' ? f.consignante_cnpj.trim() || null : null,
      consignante_tel: f.tipo === 'consignado' ? f.consignante_tel.trim() || null : null,
      consignante_endereco: f.tipo === 'consignado' ? f.consignante_endereco.trim() || null : null,
      fotos: fotos.map((x, i) => ({ file: x.file || null, url: x.url, nome: x.nome, ordem: i })),
      crlv, // {file, name} do CRLV-e (useEstoque faz o upload)
      publicarEm, // canais para publicar após salvar (assíncrono, status por canal)
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar veículo"
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>Cancelar</button>
          <button className="inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]" onClick={salvar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
            Confirmar e salvar
          </button>
        </>
      }
    >
      {/* Atalhos de preenchimento (opcionais) */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setAviso('Consulta por placa: integração em breve. Por enquanto, preencha manualmente.')}
          className="flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] font-semibold text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg py-2.5 hover:bg-[#dde9f6]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          Buscar pela placa
        </button>
        <label className="flex-1 inline-flex items-center justify-center gap-2 text-[12.5px] font-semibold text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg py-2.5 hover:bg-[#dde9f6] cursor-pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
          {crlv ? 'CRLV-e anexado ✓' : 'Enviar CRLV-e (PDF)'}
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            setCrlv({ file, name: file.name });
            setAviso('CRLV-e anexado — será guardado na ficha do carro. (A leitura automática dos campos entra em breve; preencha manualmente por ora.)');
          }} />
        </label>
      </div>
      {aviso && <div className="text-[12px] text-amber bg-amber-soft rounded-lg px-3 py-2.5 mb-3 -mt-1">{aviso}</div>}

      <div className="grid grid-cols-2 gap-3">
        <F label="Modelo" full><I v={f.modelo} on={(v) => set('modelo', v)} ph="Ex: Corolla GLI Flex" /></F>
        <F label="Placa"><I v={f.placa} on={(v) => set('placa', v)} ph="ABC1D23" /></F>
        <F label="RENAVAM"><I v={f.renavam} on={(v) => set('renavam', v)} ph="00000000000" /></F>
        <F label="Fab/Modelo">
          <input value={f.fab_mod} onChange={(e) => set('fab_mod', e.target.value)} onBlur={handleFabModBlur} placeholder="2021/2022"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </F>
        <F label="Cor"><I v={f.cor} on={(v) => set('cor', v)} ph="Prata" /></F>
        <F label="Chassi"><I v={f.chassi} on={(v) => set('chassi', v)} ph="9BW..." /></F>
        <F label="Quilometragem"><I v={f.km} on={(v) => set('km', v)} ph="0" cls="num" /></F>
        <F label={`Ano de fabricação${renaveAtivo ? ' *' : ''}`}><I v={f.ano_fabricacao} on={(v) => set('ano_fabricacao', v)} ph="2021" cls="num" /></F>
        <F label={`Ano modelo${renaveAtivo ? ' *' : ''}`}><I v={f.ano_modelo} on={(v) => set('ano_modelo', v)} ph="2022" cls="num" /></F>
        <F label="Código FIPE"><I v={f.codigo_fipe} on={(v) => set('codigo_fipe', v)} ph="opcional" /></F>
        <F label="Chave da NF-e de compra"><I v={f.chave_nfe_compra} on={(v) => set('chave_nfe_compra', v)} ph="opcional — se já tiver a nota" /></F>
        <F label="Combustível"><I v={f.combustivel} on={(v) => set('combustivel', v)} ph="Flex" /></F>
        <F label="Versão"><I v={f.versao} on={(v) => set('versao', v)} ph="Ex: GLI, XEI 2.0" /></F>
        <F label="Portas"><I v={f.portas} on={(v) => set('portas', v)} ph="4" cls="num" /></F>
        <F label="Código"><I v={f.codigo} on={(v) => set('codigo', v)} ph="opcional" /></F>
        <F label="Tipo">
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white">
            <option value="proprio">Próprio</option>
            <option value="consignado">Consignado</option>
          </select>
        </F>
        {ehDono && <F label={f.tipo === 'consignado' ? 'Repasse ao dono' : 'Valor de compra'}><I v={f.compra} on={(v) => set('compra', v)} ph="R$ 0,00" cls="num" /></F>}
        <F label="Valor pedido (anúncio)"><I v={f.pedido} on={(v) => set('pedido', v)} ph="R$ 0,00" cls="num" /></F>
        <F label="Valor mínimo de venda"><I v={f.minimo} on={(v) => set('minimo', v)} ph="R$ 0,00" cls="num" /></F>
        <F label="Descrição do anúncio" full>
          <textarea value={f.descricao} onChange={(e) => set('descricao', e.target.value)} rows={2} placeholder="Único dono, revisões em dia, pneus novos…"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full resize-y" />
        </F>
      </div>

      {/* Consignante (empresa dona) — só quando consignado; alimenta o contrato de consignação */}
      {f.tipo === 'consignado' && (
        <div className="mt-3.5 border border-border rounded-lg p-3.5 bg-[#FAFBFD]">
          <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mb-2.5">Consignante (dono — empresa)</div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Razão social" full><I v={f.consignante_nome} on={(v) => set('consignante_nome', v)} ph="Empresa proprietária" /></F>
            <F label="CNPJ"><I v={f.consignante_cnpj} on={(v) => set('consignante_cnpj', v)} ph="00.000.000/0001-00" /></F>
            <F label="Telefone"><I v={f.consignante_tel} on={(v) => set('consignante_tel', v)} ph="(00) 00000-0000" /></F>
            <F label="Endereço completo" full><I v={f.consignante_endereco} on={(v) => set('consignante_endereco', v)} ph="Endereço da empresa" /></F>
          </div>
          <p className="text-[11px] text-muted-2 mt-2">Esses dados entram automaticamente no contrato de consignação deste carro.</p>
        </div>
      )}

      {/* Origem do veículo — de quem a loja comprou (RENAVE, ADR-16: alimenta
          client + nfe/purchase quando o canal RENAVE estiver conectado).
          Sempre opcional aqui — sem RENAVE ativo, nada disso é obrigatório. */}
      <div className="mt-3.5 border border-border rounded-lg p-3.5 bg-[#FAFBFD]">
        <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mb-2.5">Origem do veículo (de quem a loja comprou)</div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Nome/Razão social" full><I v={f.vendedor_origem_nome} on={(v) => set('vendedor_origem_nome', v)} ph="Vendedor anterior" /></F>
          <F label="CPF/CNPJ"><I v={f.vendedor_origem_cpf_cnpj} on={(v) => set('vendedor_origem_cpf_cnpj', v)} ph="000.000.000-00" /></F>
          <F label="CEP">
            <input value={f.vendedor_origem_cep} onChange={(e) => set('vendedor_origem_cep', e.target.value)} onBlur={handleCepOrigemBlur}
              className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
            {buscandoCepOrigem && <span className="text-[11px] text-muted-2">Buscando endereço…</span>}
            {erroCepOrigem && <span className="text-[11px] text-red">{erroCepOrigem}</span>}
          </F>
          <F label="Número"><I v={f.vendedor_origem_numero} on={(v) => set('vendedor_origem_numero', v)} /></F>
          <F label="Logradouro" full><I v={f.vendedor_origem_logradouro} on={(v) => set('vendedor_origem_logradouro', v)} ph="Preenchido automaticamente pelo CEP" /></F>
          <F label="Complemento"><I v={f.vendedor_origem_complemento} on={(v) => set('vendedor_origem_complemento', v)} ph="opcional" /></F>
          <F label="Bairro"><I v={f.vendedor_origem_bairro} on={(v) => set('vendedor_origem_bairro', v)} /></F>
          <F label="Cidade"><I v={f.vendedor_origem_cidade} on={(v) => set('vendedor_origem_cidade', v)} /></F>
          <F label="UF"><I v={f.vendedor_origem_uf} on={(v) => set('vendedor_origem_uf', v)} ph="SP" /></F>
        </div>
        <p className="text-[11px] text-muted-2 mt-2">Opcional — usado para o cadastro de entrada no RENAVE quando o canal estiver conectado.</p>
      </div>

      {/* Fotos — arraste para reordenar; a primeira é a capa */}
      <div className="mt-3.5">
        <label className="text-[11.5px] font-semibold text-muted">Fotos do carro <span className="font-normal text-muted-2">· arraste para reordenar (a 1ª é a capa)</span></label>
        <div className="mt-1.5 flex flex-wrap gap-2 items-center">
          {fotos.map((foto, i) => (
            <div key={i} draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { moverFoto(dragIdx, i); setDragIdx(null); }}
              onDragEnd={() => setDragIdx(null)}
              className={['w-16 h-16 rounded-lg overflow-hidden border relative cursor-grab active:cursor-grabbing', i === 0 ? 'border-blue ring-2 ring-blue/30' : 'border-border'].join(' ')}>
              <img src={foto.url} alt={foto.nome} className="w-full h-full object-cover pointer-events-none" />
              {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-blue text-white text-[9px] font-bold text-center py-px">CAPA</span>}
              <button onClick={() => setFotos((arr) => arr.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 bg-navy/70 text-white w-4 h-4 rounded grid place-items-center text-[11px] leading-none">×</button>
            </div>
          ))}
          <label className="w-16 h-16 rounded-lg border border-dashed border-border grid place-items-center text-muted-2 hover:border-blue hover:text-blue cursor-pointer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M12 5v14M5 12h14" /></svg>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFotos(e.target.files)} />
          </label>
        </div>
      </div>

      {/* Publicar ao salvar — só canais conectados habilitam (regra: ligar canal a canal).
          A publicação é assíncrona: o carro salva na hora e o status por canal fica no
          modal Publicar/status. */}
      <div className="mt-3.5">
        <label className="text-[11.5px] font-semibold text-muted">Publicar anúncio em <span className="font-normal text-muted-2">· opcional, roda após salvar</span></label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {CANAIS_ANUNCIO.map((c) => {
            const conectado = !!canaisConectados[c.chave];
            const marcado = publicarEm.includes(c.chave);
            return (
              <label key={c.chave}
                className={['flex items-center gap-2.5 border rounded-lg px-3 py-2.5',
                  !conectado ? 'opacity-55 cursor-not-allowed bg-bg border-border'
                    : marcado ? 'border-blue bg-blue-soft cursor-pointer'
                    : 'border-border cursor-pointer hover:border-[#CBD5E1]'].join(' ')}>
                <input type="checkbox" disabled={!conectado} checked={marcado}
                  onChange={() => setPublicarEm((arr) => marcado ? arr.filter((k) => k !== c.chave) : [...arr, c.chave])}
                  className="accent-[#185FA5] w-3.5 h-3.5" />
                <span className="w-6 h-6 rounded-md grid place-items-center flex-shrink-0 font-bold text-[10px]" style={{ background: c.cor, color: c.corTexto }}>{c.nome[0]}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold truncate">{c.nome}</span>
                  {!conectado && <span className="block text-[10px] text-muted-2">conecte em Configurações</span>}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {erro && <div className="text-[12.5px] text-red bg-red-soft rounded-lg px-3 py-2.5 mt-3">{erro}</div>}
    </Modal>
  );
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
  return (
    <input value={v} onChange={(e) => on(e.target.value)} placeholder={ph}
      className={`${cls} text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full`} />
  );
}
