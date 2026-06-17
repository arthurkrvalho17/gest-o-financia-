import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';

export default function LembreteModal({ open, item, onClose, onSave, onRemove }) {
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('09:00');

  useEffect(() => {
    if (open && item) {
      setDia(item.lembrete_dia || '');
      setHora(item.lembrete_hora || '09:00');
    }
  }, [open, item]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lembrete de pagamento"
      maxWidth={380}
      footer={
        <>
          {item?.lembrete_ativo ? (
            <button className="text-[12.5px] text-red font-medium" onClick={onRemove}>
              Remover lembrete
            </button>
          ) : (
            <span />
          )}
          <button
            className="bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]"
            onClick={() => onSave(Number(dia) || 1, hora || '09:00')}
          >
            Ativar lembrete
          </button>
        </>
      }
    >
      <p className="text-[13px] text-muted mb-4">
        Avisar para pagar <b className="text-navy">{item?.descricao || 'esta despesa'}</b>:
      </p>
      <div className="flex gap-3">
        <label className="flex flex-col gap-1.5 flex-1">
          <span className="text-[11.5px] font-semibold text-muted">Todo dia</span>
          <input type="number" min="1" max="31" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="15"
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue" />
        </label>
        <label className="flex flex-col gap-1.5 flex-1">
          <span className="text-[11.5px] font-semibold text-muted">Horário</span>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)}
            className="text-[13.5px] px-[11px] py-2.5 border border-border rounded-lg outline-none focus:border-blue" />
        </label>
      </div>
    </Modal>
  );
}
