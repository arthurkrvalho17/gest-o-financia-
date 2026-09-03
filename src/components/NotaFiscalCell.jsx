import { useRef, useState } from 'react';
import Modal from './Modal';
import { urlAssinada } from '../lib/storage';

// Botão de nota fiscal de uma despesa. Sem anexo → "Anexar"; com anexo → "Ver NF".
// Aceita imagem (JPG/PNG) e PDF. onAttach(file) é assíncrono (demo grava dataURL,
// real sobe ao Storage). É opcional — o lojista anexa quando quiser.
// `path` (real): a URL de exibição é gerada na hora — a gravada no banco expira.
export default function NotaFiscalCell({ url, path = null, tipo, onAttach }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(false);
  const [urlFresca, setUrlFresca] = useState(null);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    await onAttach(file);
    setBusy(false);
  }

  async function abrir() {
    setUrlFresca(path ? await urlAssinada('notas-fiscais', path, url) : url);
    setVer(true);
  }

  const src = urlFresca || url;

  return (
    <>
      {url || path ? (
        <button onClick={abrir} title="Ver nota fiscal"
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-green bg-green-soft hover:bg-[#d6efdf] rounded-md px-2.5 py-1.5 whitespace-nowrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          Ver NF
        </button>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={busy} title="Anexar nota fiscal (imagem ou PDF)"
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-blue bg-blue-soft hover:bg-[#dde9f6] rounded-md px-2.5 py-1.5 whitespace-nowrap disabled:opacity-60">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
          {busy ? 'Enviando…' : 'Anexar'}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={onPick} />

      <Modal open={ver} onClose={() => setVer(false)} title="Nota fiscal" maxWidth={640}>
        <div className="flex flex-col gap-3">
          {tipo === 'pdf'
            ? <iframe src={src} title="Nota fiscal (PDF)" className="w-full h-[60vh] rounded-lg border border-border" />
            : <img src={src} alt="Nota fiscal" className="w-full max-h-[60vh] object-contain rounded-lg border border-border bg-bg" />}
          <div className="flex items-center justify-between">
            <a href={src} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-blue hover:underline">Abrir em nova aba ▸</a>
            <button onClick={() => { setVer(false); inputRef.current?.click(); }}
              className="text-[12.5px] font-semibold text-navy bg-white border border-border rounded-lg px-3 py-1.5 hover:bg-bg">Trocar nota</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
