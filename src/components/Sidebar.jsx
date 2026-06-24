import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Logo from './Logo';
import {
  IconEstoque,
  IconPreparacao,
  IconCrm,
  IconFinanceiro,
  IconContratos,
  IconNotaFiscal,
  IconFinanciamento,
  IconConexoes,
  IconConfig,
  IconSair,
} from './icons';

const itensOperacao = [
  { to: '/estoque', label: 'Estoque', Icon: IconEstoque },
  { to: '/preparacao', label: 'Preparação', Icon: IconPreparacao },
  { to: '/crm', label: 'CRM', Icon: IconCrm },
];

// Financeiro e Conexões são só do dono (soDono: true).
const itensGestao = [
  { to: '/financeiro', label: 'Financeiro', Icon: IconFinanceiro, soDono: true },
  { to: '/contratos', label: 'Contratos', Icon: IconContratos },
  { to: '/conexoes', label: 'Conexões', Icon: IconConexoes, soDono: true },
  { to: '/configuracoes', label: 'Configurações', Icon: IconConfig, soDono: true },
];

function iniciais(nome) {
  if (!nome) return '··';
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function Sidebar() {
  const { loja, sair, ehDono, demo, usuario, definirPapelDemo } = useAuth();
  const gestaoVisivel = itensGestao.filter((i) => !i.soDono || ehDono);

  const linkClass = ({ isActive }) =>
    [
      'flex items-center gap-3 px-3 py-2.5 rounded-[9px] font-medium text-[13.5px] w-full text-left transition-colors',
      isActive
        ? 'bg-blue text-white font-semibold'
        : 'text-white/70 hover:bg-white/[0.07] hover:text-white',
    ].join(' ');

  return (
    <aside className="w-[236px] flex-shrink-0 bg-navy flex flex-col sticky top-0 h-screen border-r border-white/[0.07]">
      {/* Marca */}
      <div className="px-[22px] pt-[22px] pb-[18px] border-b border-white/[0.08]">
        <Logo tone="light" size={19} />
      </div>

      {/* Navegação */}
      <nav className="px-3 py-3.5 flex flex-col gap-0.5 flex-1 overflow-y-auto">
        <div className="text-[11px] font-semibold text-white/[0.42] uppercase tracking-wider px-3 pt-2.5 pb-1.5">
          Operação
        </div>
        {itensOperacao.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon className="w-[18px] h-[18px] flex-shrink-0" /> {label}
          </NavLink>
        ))}

        <div className="text-[11px] font-semibold text-white/[0.42] uppercase tracking-wider px-3 pt-2.5 pb-1.5">
          Gestão
        </div>
        {gestaoVisivel.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon className="w-[18px] h-[18px] flex-shrink-0" /> {label}
          </NavLink>
        ))}

        <SidebarSoon Icon={IconNotaFiscal} label="Nota Fiscal" tag="plano+" />

        <div className="text-[11px] font-semibold text-white/[0.42] uppercase tracking-wider px-3 pt-2.5 pb-1.5">
          Outros produtos
        </div>
        <SidebarSoon Icon={IconFinanciamento} label="Financiamento" tag="em breve" />
      </nav>

      {/* Seletor de papel (só no modo demonstração) */}
      {demo && (
        <div className="px-3.5 pt-3 border-t border-white/[0.08]">
          <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Ver como (demo)</div>
          <div className="flex bg-white/[0.06] rounded-lg p-0.5 gap-0.5">
            {[['dono', 'Dono'], ['funcionario', 'Funcionário']].map(([p, lbl]) => (
              <button key={p} onClick={() => definirPapelDemo(p)}
                className={['flex-1 text-[11.5px] font-semibold py-1.5 rounded-md transition',
                  (usuario?.papel || 'dono') === p ? 'bg-blue text-white' : 'text-white/60 hover:text-white'].join(' ')}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé: loja + sair */}
      <div className="p-3.5 border-t border-white/[0.08] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-white/[0.12] text-white grid place-items-center font-bold text-[13px]">
          {iniciais(loja?.nome)}
        </div>
        <div className="text-[12.5px] leading-tight min-w-0 flex-1">
          <b className="font-semibold text-white block truncate">{loja?.nome || 'Minha loja'}</b>
          <span className="text-white/50 block">Plano Gestão</span>
        </div>
        <button
          onClick={sair}
          title="Sair"
          className="text-white/50 hover:text-white hover:bg-white/[0.1] p-1.5 rounded-md transition-colors"
        >
          <IconSair className="w-[18px] h-[18px]" />
        </button>
      </div>
    </aside>
  );
}

function SidebarSoon({ Icon, label, tag }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-[9px] font-medium text-[13.5px] text-white/[0.36] cursor-default">
      <Icon className="w-[18px] h-[18px] flex-shrink-0" /> {label}
      <span className="ml-auto text-[10px] font-semibold text-white/50 bg-white/[0.08] px-1.5 py-0.5 rounded">
        {tag}
      </span>
    </div>
  );
}
