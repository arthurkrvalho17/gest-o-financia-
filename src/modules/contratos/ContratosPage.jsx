import { Topbar } from '../../components/Layout';
import Placeholder from '../../components/Placeholder';
import { IconContratos } from '../../components/icons';

export default function ContratosPage() {
  return (
    <>
      <Topbar titulo="Contratos" sub="Geração de documentos e recibos" />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="bg-white border border-border rounded-card shadow-card">
          <Placeholder
            Icon={IconContratos}
            titulo="Módulo Contratos"
            descricao="Gerador de documentos (compra e venda, recibo de sinal, consignação...) com assinatura da loja e carro do estoque."
            fase="Fase 5"
          />
        </div>
      </div>
    </>
  );
}
