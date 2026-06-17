import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  const toast = useCallback((texto) => {
    setMsg(texto);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className={[
          'fixed bottom-6 left-1/2 -translate-x-1/2 bg-navy text-white px-[18px] py-3 rounded-[10px]',
          'text-[13px] font-medium flex items-center gap-2.5 z-[60] transition-all duration-200',
          show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none',
        ].join(' ')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="#5FD08C" strokeWidth="2.5" className="w-4 h-4">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span>{msg}</span>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
