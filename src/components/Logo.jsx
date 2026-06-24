// Wordmark FINANCIA+ HUB AUTOMOTIVO (recriação vetorial da logo).
// tone="light"  -> texto claro, para fundos escuros (sidebar navy)
// tone="dark"   -> texto escuro, para fundos claros (tela de login)
// Para usar o arquivo de imagem original, troque o conteúdo por:
//   <img src="/logo.svg" alt="Financia+ Hub Automotivo" className={className} />
// (basta colocar o arquivo em public/).
export default function Logo({ tone = 'light', sub = true, size = 18, className = '' }) {
  const main = tone === 'light' ? 'text-white' : 'text-navy';
  const subCls = tone === 'light' ? 'text-white/45' : 'text-muted-2';
  return (
    <div className={['flex flex-col leading-none select-none', className].join(' ')}>
      <div className="font-extrabold" style={{ fontSize: size, letterSpacing: '-0.01em' }}>
        <span className={main}>FINANCIA</span>
        <span style={{ color: '#5EA0E0' }}>+</span>
      </div>
      {sub && (
        <div className={['font-semibold mt-[5px]', subCls].join(' ')} style={{ fontSize: Math.max(8, size * 0.48), letterSpacing: '0.26em' }}>
          HUB AUTOMOTIVO
        </div>
      )}
    </div>
  );
}
