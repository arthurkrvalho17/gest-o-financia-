import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { brl, fmt, parseBR, ddmm, hojeISO } from '../../lib/format';
import { buscarCep } from '../../lib/cep';

const FORMAS = [
  { v: 'avista', label: 'À vista' },
  { v: 'financiamento', label: 'Financiamento' },
  { v: 'consorcio', label: 'Consórcio' },
];

// Origem do lead (tráfego pago + portais integrados + complementares).
const ORIGENS_VENDA = [
  { v: 'traf_pago', label: 'Tráfego pago' },
  { v: 'mercado_livre', label: 'Mercado Livre' },
  { v: 'olx', label: 'OLX' },
  { v: 'webmotors', label: 'Webmotors' },
  { v: 'instagram', label: 'Instagram' },
  { v: 'indicacao', label: 'Indicação' },
  { v: 'balcao', label: 'Balcão / loja' },
  { v: 'outro', label: 'Outro' },
];

export default function RegistrarVendaModal({ open, veiculo, custos, equipe = [], ehDono = true, onClose, onConfirm }) {
  const [valorStr, setValorStr] = useState('');
  const [data, setData] = useState(hojeISO());
  const [comprador, setComprador] = useState('');
  const [compradorCpf, setCompradorCpf] = useState('');
  const [forma, setForma] = useState('avista');
  const [origemLead, setOrigemLead] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [obs, setObs] = useState('');
  // Endereço do comprador — exigido pela Spedy para emitir a NF-e
  // (receiver.address). CEP busca o resto automaticamente (ViaCEP);
  // número é sempre digitado à mão.
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cidadeIbge, setCidadeIbge] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState('');

  useEffect(() => {
    if (open && veiculo) {
      setValorStr((veiculo.pedido || 0).toLocaleString('pt-BR'));
      setData(hojeISO());
      setComprador('');
      setCompradorCpf('');
      setForma('avista');
      setOrigemLead('');
      setVendedor('');
      setObs('');
      setCep(''); setLogradouro(''); setNumero(''); setBairro(''); setCidade(''); setUf(''); setCidadeIbge('');
      setErroCep('');
    }
  }, [open, veiculo]);

  async function handleCepBlur() {
    const digitos = cep.replace(/\D/g, '');
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    setErroCep('');
    const r = await buscarCep(digitos);
    setBuscandoCep(false);
    if (r.erro) { setErroCep(r.erro); return; }
    setLogradouro(r.logradouro);
    setBairro(r.bairro);
    setCidade(r.cidade);
    setUf(r.uf);
    setCidadeIbge(r.cidadeIbge);
  }

  const valor = parseBR(valorStr);
  const lucro = useMemo(
    () => valor - (veiculo?.compra || 0) - (custos || 0),
    [valor, veiculo, custos]
  );
  const abaixoMin = veiculo && valor > 0 && valor < (veiculo.minimo || 0);
  const consignado = veiculo?.tipo === 'consignado';
  const rotuloCompra = consignado ? 'Repasse ao dono' : 'Comprado por';

  if (!veiculo) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar venda"
      maxWidth={460}
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>Cancelar</button>
          <button
            className="inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]"
            onClick={() =>
              onConfirm({
                valor_venda: valor || veiculo.pedido,
                data_venda: data,
                comprador_nome: comprador,
                comprador_cpf: compradorCpf || null,
                forma_pagamento: forma,
                origem_lead: origemLead || null,
                vendedor_id: vendedor || null,
                observacao: obs || null,
                comprador_cep: cep.replace(/\D/g, '') || null,
                comprador_logradouro: logradouro || null,
                comprador_numero: numero || null,
                comprador_bairro: bairro || null,
                comprador_cidade: cidade || null,
                comprador_cidade_ibge: cidadeIbge || null,
                comprador_uf: uf || null,
              })
            }
          >
            Confirmar venda
          </button>
        </>
      }
    >
      <div className="text-[12.5px] text-muted mb-4 leading-relaxed">
        <b className="text-navy">{veiculo.modelo}</b> · {veiculo.placa}
        <br />
        {ehDono && <>{rotuloCompra} {fmt(veiculo.compra)} · preparação {fmt(custos)} · </>}
        mínimo {fmt(veiculo.minimo)}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor real da venda">
          <input value={valorStr} onChange={(e) => setValorStr(e.target.value)}
            className="num text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Field>
        <Field label="Data da venda">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Field>
        <Field label="Vendedor" full>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white">
            <option value="">— selecione o vendedor —</option>
            {equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </Field>
        <Field label="Comprador">
          <input value={comprador} onChange={(e) => setComprador(e.target.value)} placeholder="Nome do cliente"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Field>
        <Field label="CPF/CNPJ do comprador">
          <input value={compradorCpf} onChange={(e) => setCompradorCpf(e.target.value)} placeholder="Necessário para emitir a NF-e"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Field>
        <Field label="CEP do comprador">
          <input value={cep} onChange={(e) => setCep(e.target.value)} onBlur={handleCepBlur} placeholder="Necessário para emitir a NF-e"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
          {buscandoCep && <span className="text-[11px] text-muted-2">Buscando endereço…</span>}
          {erroCep && <span className="text-[11px] text-red">{erroCep}</span>}
        </Field>
        <Field label="Número">
          <input value={numero} onChange={(e) => setNumero(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Field>
        <Field label="Logradouro" full>
          <input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} placeholder="Preenchido automaticamente pelo CEP"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Field>
        <Field label="Bairro">
          <input value={bairro} onChange={(e) => setBairro(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full" />
        </Field>
        <Field label="Cidade/UF">
          <input value={cidade && uf ? `${cidade}/${uf}` : ''} readOnly
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none bg-[#F7F9FC] w-full" />
        </Field>
        <Field label="Forma de pagamento">
          <select value={forma} onChange={(e) => setForma(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white">
            {FORMAS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Origem do lead">
          <select value={origemLead} onChange={(e) => setOrigemLead(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white">
            <option value="">— de onde veio —</option>
            {ORIGENS_VENDA.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Observação (opcional)" full>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Ex: entrega na próxima semana, levou tapetes…"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full resize-y" />
        </Field>
      </div>

      {abaixoMin && (
        <div className="bg-amber-soft text-amber text-[12px] font-semibold px-3 py-2.5 rounded-lg mt-3.5 flex gap-2 items-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px] flex-shrink-0">
            <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          Abaixo do mínimo definido ({fmt(veiculo.minimo)})
        </div>
      )}

      {ehDono && (
        <>
          <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-border">
            <span className="text-[13px] text-muted font-semibold">{consignado ? 'Comissão desta venda' : 'Lucro desta venda'}</span>
            <b className="text-[22px] font-extrabold num" style={{ color: lucro < 0 ? '#B91C1C' : '#15803D' }}>{brl(lucro)}</b>
          </div>
          <p className="text-[11px] text-muted-2 mt-2">
            Venda registrada em {ddmm(data)} · {consignado ? 'comissão' : 'lucro'} = venda − {consignado ? 'repasse' : 'compra'} − preparação.
          </p>
        </>
      )}
    </Modal>
  );
}

function Field({ label, full, children }) {
  return (
    <div className={['flex flex-col gap-1.5', full ? 'col-span-2' : ''].join(' ')}>
      <label className="text-[11.5px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}
