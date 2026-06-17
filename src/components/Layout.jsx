import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}

// Cabeçalho padrão de cada página (topbar do protótipo).
export function Topbar({ titulo, sub, acao }) {
  return (
    <header className="flex items-center justify-between gap-4 px-7 py-[18px] border-b border-border bg-white sticky top-0 z-10">
      <div>
        <h1 className="text-[19px] font-bold tracking-tight text-navy">{titulo}</h1>
        {sub && <div className="text-[12.5px] text-muted mt-px">{sub}</div>}
      </div>
      {acao}
    </header>
  );
}
