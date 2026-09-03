import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';

// Aceite do cliente por 3 vias. O documento já sai assinado pela loja.
//
// Achado (31/08-01/09/2026): esta tela afirmava "assinatura eletrônica
// avançada (Lei 14.063/2020), com trilha de auditoria" — nada disso existe
// hoje. Não há identificação do signatário, hash do documento, carimbo de
// tempo nem log; nenhuma plataforma de assinatura eletrônica está
// integrada (o README já reconhecia isso como "hoje simulada"). O texto
// abaixo descreve só o que o sistema realmente faz: um registro interno de
// aceite, sem validade jurídica de assinatura avançada.
export default function AssinaturaModal({ open, onClose, onConcluir }) {
  const [via, setVia] = useState(null); // null | aparelho | link | impressao
  useEffect(() => { if (open) setVia(null); }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Aceite do cliente" maxWidth={460}>
      <div className="text-[12.5px] text-muted mb-4 leading-relaxed">
        O documento já está <b className="text-navy">assinado pela loja</b>. Escolha como o cliente
        confirma o aceite — hoje isso fica registrado internamente no sistema, sem valor de
        assinatura eletrônica avançada; essa funcionalidade será habilitada em breve.
      </div>

      {!via && (
        <div className="flex flex-col gap-2.5">
          <ViaBtn onClick={() => setVia('aparelho')} titulo="Assinar agora, neste aparelho" desc="Presencial — o cliente desenha o aceite no celular do vendedor" />
          <ViaBtn disabled titulo="Enviar link para o cliente" desc="Em breve — hoje o envio ainda seria manual (WhatsApp/e-mail por fora do sistema)" />
          <ViaBtn onClick={() => setVia('impressao')} titulo="Imprimir para assinar" desc="Assinatura física — fica Pendente até anexar o documento" />
        </div>
      )}

      {via === 'aparelho' && <CanvasAssinatura onVoltar={() => setVia(null)} onConfirmar={(blob) => onConcluir('aparelho', blob)} />}

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

function ViaBtn({ titulo, desc, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'text-left border rounded-[10px] px-4 py-3',
        disabled ? 'border-border bg-bg cursor-not-allowed opacity-70' : 'border-border hover:border-blue hover:bg-bg',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-[13.5px]">{titulo}</span>
        {disabled && <span className="text-[10px] font-semibold text-muted-2 bg-white border border-border rounded-full px-2 py-[1px]">Em breve</span>}
      </div>
      <div className="text-[11.5px] text-muted-2 mt-0.5">{desc}</div>
    </button>
  );
}

function CanvasAssinatura({ onVoltar, onConfirmar }) {
  const ref = useRef(null);
  const desenhando = useRef(false);
  const [temAssinatura, setTem] = useState(false);
  const [salvando, setSalvando] = useState(false);

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

  // Sobe o traço de verdade (canvas → blob → Storage privado, ver
  // uploadAssinatura). Antes disso, o desenho era só descartado — a tela
  // mudava de status, mas nada do que o cliente desenhou sobrevivia.
  function confirmar() {
    const c = ref.current;
    setSalvando(true);
    c.toBlob((blob) => {
      setSalvando(false);
      onConfirmar(blob);
    }, 'image/png');
  }

  return (
    <div>
      <p className="text-[12.5px] text-muted mb-2">
        Peça para o cliente desenhar o aceite no quadro abaixo — é um registro visual, guardado
        junto com o documento, sem valor de assinatura eletrônica avançada.
      </p>
      <canvas ref={ref} width={400} height={150} className="w-full border border-border rounded-lg bg-[#FAFBFD] touch-none cursor-crosshair" />
      <div className="flex items-center justify-between mt-3">
        <button onClick={onVoltar} className="text-[12.5px] text-blue font-medium">Voltar</button>
        <div className="flex gap-2">
          <button onClick={limpar} disabled={salvando} className="text-[12.5px] font-semibold text-muted border border-border rounded-lg px-3 py-2 disabled:opacity-60">Limpar</button>
          <button onClick={confirmar} disabled={!temAssinatura || salvando}
            className={['text-[13px] font-semibold px-4 py-2 rounded-lg text-white', temAssinatura && !salvando ? 'bg-green hover:bg-[#126b34]' : 'bg-muted-2 cursor-not-allowed'].join(' ')}>
            {salvando ? 'Salvando…' : 'Confirmar aceite'}
          </button>
        </div>
      </div>
    </div>
  );
}
