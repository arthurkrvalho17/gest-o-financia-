import { Topbar } from '../../components/Layout';
import Placeholder from '../../components/Placeholder';
import { IconPreparacao } from '../../components/icons';

export default function PreparacaoPage() {
  return (
    <>
      <Topbar titulo="Preparação" sub="Gastos de preparação por carro" />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="bg-white border border-border rounded-card shadow-card">
          <Placeholder
            Icon={IconPreparacao}
            titulo="Módulo Preparação"
            descricao="Lista dos carros do estoque e a planilha de gastos de cada um, que alimenta o custo e o lucro."
            fase="Fase 2"
          />
        </div>
      </div>
    </>
  );
}
