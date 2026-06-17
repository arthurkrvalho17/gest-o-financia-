import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';

const CORES = ['#B5704A', '#185FA5', '#15803D', '#B45309', '#B91C1C', '#7C3AED', '#475569'];

export default function MarcadorModal({ open, veiculo, onClose, onSave, onClear }) {
  const [texto, setTexto] = useState('');
  const [cor, setCor] = useState('#185FA5');

  useEffect(() => {
    if (open && veiculo) {
      setTexto(veiculo.marcador_texto || '');
      setCor(veiculo.marcador_cor || '#185FA5');
    }
  }, [open, veiculo]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Marcador"
      maxWidth={380}
      footer={
        <>
          <button className="text-[12.5px] text-red font-medium" onClick={onClear}>
            Remover
          </button>
          <button
            className="bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]"
            onClick={() => onSave(texto.trim(), cor)}
          >
            Salvar marcador
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-[11.5px] font-semibold text-muted">Texto do marcador</label>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex: REPASSE, OFERTA, REVISADO"
          className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue"
        />
      </div>
      <div className="mt-4">
        <label className="text-[11.5px] font-semibold text-muted">Cor</label>
        <div className="flex gap-2 mt-2">
          {CORES.map((c) => (
            <button
              key={c}
              onClick={() => setCor(c)}
              style={{ background: c }}
              className={[
                'w-[30px] h-[30px] rounded-lg border-2',
                c === cor ? 'border-navy' : 'border-transparent',
              ].join(' ')}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
