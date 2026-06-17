import { Topbar } from '../../components/Layout';
import Placeholder from '../../components/Placeholder';
import { IconEstoque } from '../../components/icons';
import { useAuth } from '../../auth/AuthContext';

export default function EstoquePage() {
  const { loja, usuario } = useAuth();

  return (
    <>
      <Topbar
        titulo="Estoque"
        sub="Fase 0 — fundação pronta. O módulo de estoque chega na Fase 1."
      />
      <div className="px-7 py-6 max-w-[1240px]">
        {/* Prova do isolamento por loja (entregável da Fase 0) */}
        <div className="bg-white border border-border rounded-card shadow-card p-6 mb-6">
          <div className="flex items-center gap-2 text-green text-[12.5px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-green inline-block" />
            Sessão ativa · isolamento por loja funcionando
          </div>
          <h2 className="text-[22px] font-bold tracking-tight text-navy mt-2">
            {loja?.nome || '—'}
          </h2>
          <p className="text-[13px] text-muted mt-1">
            Logado como <b className="text-navy">{usuario?.nome || usuario?.email}</b>
            {usuario?.papel ? ` · ${usuario.papel}` : ''}
          </p>
          <p className="text-[12.5px] text-muted-2 mt-3 leading-relaxed max-w-[560px]">
            Você só enxerga os dados desta loja. Crie uma segunda conta (outra loja) e
            confirme que nada de uma aparece na outra — esse é o teste mais importante do
            sistema (RLS no Supabase).
          </p>
        </div>

        <div className="bg-white border border-border rounded-card shadow-card">
          <Placeholder
            Icon={IconEstoque}
            titulo="Módulo Estoque"
            descricao="A tabela densa de veículos (à venda / vendidos), cadastro de carro e registro de venda entram aqui."
            fase="Fase 1"
          />
        </div>
      </div>
    </>
  );
}
