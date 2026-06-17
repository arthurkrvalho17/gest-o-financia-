import { useEffect } from 'react';

// Overlay + card central, fiel ao protótipo. Fecha no ESC e no clique fora.
export default function Modal({ open, onClose, title, children, footer, maxWidth = 520 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-[rgba(10,22,40,.45)] flex items-start justify-center px-5 py-10 z-50 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="bg-white rounded-2xl w-full shadow-[0_20px_60px_rgba(10,22,40,.25)] overflow-hidden"
        style={{ maxWidth }}
      >
        <div className="flex items-center justify-between px-[22px] py-[18px] border-b border-border">
          <h3 className="text-base font-bold text-navy">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted w-[30px] h-[30px] rounded-md grid place-items-center text-lg hover:bg-bg"
          >
            ×
          </button>
        </div>
        <div className="p-[22px]">{children}</div>
        {footer && (
          <div className="flex items-center justify-between gap-3 px-[22px] py-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
