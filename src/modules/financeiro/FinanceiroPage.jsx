import { Topbar } from '../../components/Layout';
import Placeholder from '../../components/Placeholder';
import { IconFinanceiro } from '../../components/icons';

export default function FinanceiroPage() {
  return (
    <>
      <Topbar titulo="Financeiro" sub="Despesas, faturamento e lucro do mês" />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="bg-white border border-border rounded-card shadow-card">
          <Placeholder
            Icon={IconFinanceiro}
            titulo="Módulo Financeiro"
            descricao="KPIs do mês, despesas em 3 categorias e histórico mês a mês editável."
            fase="Fase 3"
          />
        </div>
      </div>
    </>
  );
}
