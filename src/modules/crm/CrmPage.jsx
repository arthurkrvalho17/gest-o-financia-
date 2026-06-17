import { Topbar } from '../../components/Layout';
import Placeholder from '../../components/Placeholder';
import { IconCrm } from '../../components/icons';

export default function CrmPage() {
  return (
    <>
      <Topbar titulo="CRM" sub="Funil de negociações e pós-venda" />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="bg-white border border-border rounded-card shadow-card">
          <Placeholder
            Icon={IconCrm}
            titulo="Módulo CRM"
            descricao="Funil kanban de leads, pós-venda e métricas (leads do mês, conversão) com histórico mês a mês."
            fase="Fase 4"
          />
        </div>
      </div>
    </>
  );
}
