import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';

// Assinatura do cliente por 3 vias. O documento já sai assinado pela loja.
export default function AssinaturaModal({ open, onClose, onConcluir }) {
  const [via, setVia] = useState(null); // null | aparelho | link | impressao
  useEffect(() => { if (open) setVia(null); }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Assinatura do cliente" maxWidth={460}>
      <div className="text-[12.5px] text-muted mb-4 leading-relaxed">
        O documento já está <b className="text-navy">assinado pela loja</b>. Escolha como o cliente assina —
        assinatura eletrônica avançada (Lei 14.063/2020), com trilha de auditoria.
      </div>

      {!via && (
        <div className="flex flex-col gap-2.5">
          <ViaBtn onClick={() => setVia('aparelho')} titulo="Assinar agora, neste aparelho" desc="Presencial — o cliente assina no celular do vendedor" />
          <ViaBtn onClick={() => setVia('link')} titulo="Enviar link para o cliente" desc="Por WhatsApp/e-mail; ele assina pelo próprio celular" />
          <ViaBtn onClick={() => setVia('impressao')} titulo="Imprimir para assinar" desc="Assinatura física — fica Pendente até anexar o documento" />
        </div>
      )}

      {via === 'aparelho' && <CanvasAssinatura onVoltar={() => setVia(null)} onConfirmar={() => onConcluir('aparelho')} />}

      {via === 'link' && (
        <div className="text-center py-4">
          <p className="text-[13px] text-muted mb-4">Enviar o link de assinatura para o cliente:</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => onConcluir('link')} className="bg-[#25D366] text-white font-semibold text-[13px] px-4 py-2.5 rounded-lg">WhatsApp</button>
            <button onClick={() => onConcluir('link')} className="bg-blue text-white font-semibold text-[13px] px-4 py-2.5 rounded-lg">E-mail</button>
          </div>
          <button onClick={() => setVia(null)} className="text-[12.5px] text-blue font-medium mt-4">Voltar</button>
        </div>
      )}

      {via === 'impressao' && (
        <div className="text-center py-4">
          <p className="text-[13px] text-muted mb-4 leading-relaxed">Imprima o documento para assinatura física. Ele fica como <b className="text-amber">Pendente</b> na ficha do carro até você anexar o documento assinado.</p>
          <button onClick={() => window.print()} className="bg-white border border-border text-navy font-semibold text-[13px] px-4 py-2.5 rounded-lg mr-2">Imprimir</button>
          <button onClick={() => onConcluir('impressao')} className="bg-blue text-white font-semibold text-[13px] px-4 py-2.5 rounded-lg">Marcar como pendente</button>
          <div><button onClick={() => setVia(null)} className="text-[12.5px] text-blue font-medium mt-4">Voltar</button></div>
        </div>
      )}
    </Modal>
  );
}

function ViaBtn({ titulo, desc, onClick }) {
  return (
    <button onClick={onClick} className="text-left border border-border rounded-[10px] px-4 py-3 hover:border-blue hover:bg-bg">
      <div className="font-semibold text-[13.5px]">{titulo}</div>
      <div className="text-[11.5px] text-muted-2 mt-0.5">{desc}</div>
    </button>
  );
}

function CanvasAssinatura({ onVoltar, onConfirmar }) {
  const ref = useRef(null);
  const desenhando = useRef(false);
  const [temAssinatura, setTem] = useState(false);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0A1628';
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const t = e.touches?.[0];
      return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top };
    };
    const start = (e) => { desenhando.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e) => { if (!desenhando.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setTem(true); e.preventDefault(); };
    const end = () => { desenhando.current = false; };
    c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    c.addEventListener('touchstart', start); c.addEventListener('touchmove', move); window.addEventListener('touchend', end);
    return () => { c.removeEventListener('mousedown', start); c.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end); c.removeEventListener('touchstart', start); c.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
  }, []);

  function limpar() {
    const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setTem(false);
  }

  return (
    <div>
      <p className="text-[12.5px] text-muted mb-2">Assine no quadro abaixo:</p>
      <canvas ref={ref} width={400} height={150} className="w-full border border-border rounded-lg bg-[#FAFBFD] touch-none cursor-crosshair" />
      <div className="flex items-center justify-between mt-3">
        <button onClick={onVoltar} className="text-[12.5px] text-blue font-medium">Voltar</button>
        <div className="flex gap-2">
          <button onClick={limpar} className="text-[12.5px] font-semibold text-muted border border-border rounded-lg px-3 py-2">Limpar</button>
          <button onClick={onConfirmar} disabled={!temAssinatura}
            className={['text-[13px] font-semibold px-4 py-2 rounded-lg text-white', temAssinatura ? 'bg-green hover:bg-[#126b34]' : 'bg-muted-2 cursor-not-allowed'].join(' ')}>
            Confirmar assinatura
          </button>
        </div>
      </div>
    </div>
  );
}
