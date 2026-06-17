import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { brl, fmt, parseBR, ddmm, hojeISO } from '../../lib/format';

const FORMAS = [
  { v: 'avista', label: 'À vista' },
  { v: 'financiamento', label: 'Financiamento' },
  { v: 'consorcio', label: 'Consórcio' },
];

export default function RegistrarVendaModal({ open, veiculo, custos, onClose, onConfirm }) {
  const [valorStr, setValorStr] = useState('');
  const [data, setData] = useState(hojeISO());
  const [comprador, setComprador] = useState('');
  const [forma, setForma] = useState('avista');

  useEffect(() => {
    if (open && veiculo) {
      setValorStr((veiculo.pedido || 0).toLocaleString('pt-BR'));
      setData(hojeISO());
      setComprador('');
      setForma('avista');
    }
  }, [open, veiculo]);

  const valor = parseBR(valorStr);
  const lucro = useMemo(
    () => valor - (veiculo?.compra || 0) - (custos || 0),
    [valor, veiculo, custos]
  );
  const abaixoMin = veiculo && valor > 0 && valor < (veiculo.minimo || 0);

  if (!veiculo) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar venda"
      maxWidth={460}
      footer={
        <>
          <button className="text-[12.5px] text-blue font-medium" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="inline-flex items-center gap-2 bg-green hover:bg-[#126b34] text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]"
            onClick={() =>
              onConfirm({
                valor_venda: valor || veiculo.pedido,
                data_venda: data,
                comprador_nome: comprador,
                forma_pagamento: forma,
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
        Comprado por {fmt(veiculo.compra)} · preparação {fmt(custos)} · mínimo{' '}
        {fmt(veiculo.minimo)}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor real da venda" full={false}>
          <input
            value={valorStr}
            onChange={(e) => setValorStr(e.target.value)}
            className="num text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full"
          />
        </Field>
        <Field label="Data da venda">
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full"
          />
        </Field>
        <Field label="Comprador" full>
          <input
            value={comprador}
            onChange={(e) => setComprador(e.target.value)}
            placeholder="Nome do cliente"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full"
          />
        </Field>
        <Field label="Forma de pagamento" full>
          <select
            value={forma}
            onChange={(e) => setForma(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue w-full bg-white"
          >
            {FORMAS.map((f) => (
              <option key={f.v} value={f.v}>
                {f.label}
              </option>
            ))}
          </select>
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

      <div className="flex items-center justify-between mt-4 pt-3.5 border-t border-border">
        <span className="text-[13px] text-muted font-semibold">Lucro desta venda</span>
        <b
          className="text-[22px] font-extrabold num"
          style={{ color: lucro < 0 ? '#B91C1C' : '#15803D' }}
        >
          {brl(lucro)}
        </b>
      </div>
      <p className="text-[11px] text-muted-2 mt-2">
        Venda registrada em {ddmm(data)} · lucro = venda − compra − preparação.
      </p>
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
