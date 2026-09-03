import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { fmt, ddmm, diasDesde, corTempoEstoque } from '../../lib/format';
import { getDocs, labelTipoDoc } from './demoDocs';
import { gerarFichaPdf } from './estoquePdf';

const SIT = { estoque: 'Estoque', reservado: 'Reservado', preparacao: 'Preparação', vendido: 'Vendido', repasse: 'Repasse' };
const ST_DOC = { anexado: 'Anexado', assinado: 'Assinado', pendente: 'Aguardando' };

// Ficha do veículo — abre ao clicar no nome do carro. Modal de tamanho normal.
export default function FichaCarroModal({ open, veiculo, ehDono, custos = 0, config, onClose }) {
  const [comCapa, setComCapa] = useState(true);
  const [capaSel, setCapaSel] = useState(0);

  useEffect(() => { if (open) setCapaSel(0); }, [open, veiculo]);
  if (!veiculo) return null;

  const fotos = veiculo.fotos || [];
  const docs = getDocs(veiculo.codigo);
  const dias = diasDesde(veiculo.entrada);

  const dados = [
    ['Fab/Mod', veiculo.fab_mod], ['Cor', veiculo.cor], ['Placa', veiculo.placa],
    ['RENAVAM', veiculo.renavam], ['Chassi', veiculo.chassi],
    ['Quilometragem', veiculo.km != null ? Number(veiculo.km).toLocaleString('pt-BR') + ' km' : null],
    ['Combustível', veiculo.combustivel], ['Versão', veiculo.versao], ['Portas', veiculo.portas],
    ['Tipo', veiculo.tipo === 'consignado' ? 'Consignado' : 'Próprio'],
    ['Entrada', ddmm(veiculo.entrada)], ['Situação', SIT[veiculo.situacao] || veiculo.situacao],
    // RENAVE (ADR-16) — só aparecem quando preenchidos (dados.filter abaixo já
    // esconde campo vazio, mesmo padrão do resto desta lista).
    ['Ano fabricação', veiculo.ano_fabricacao], ['Ano modelo', veiculo.ano_modelo],
    ['Código FIPE', veiculo.codigo_fipe], ['Chave NF-e de compra', veiculo.chave_nfe_compra],
  ];

  const temOrigemVeiculo = veiculo.vendedor_origem_nome || veiculo.vendedor_origem_cpf_cnpj || veiculo.vendedor_origem_logradouro;
  const origemVeiculo = [
    ['Nome/Razão social', veiculo.vendedor_origem_nome], ['CPF/CNPJ', veiculo.vendedor_origem_cpf_cnpj],
    ['Endereço', [veiculo.vendedor_origem_logradouro, veiculo.vendedor_origem_numero].filter(Boolean).join(', ') || null],
    ['Complemento', veiculo.vendedor_origem_complemento], ['Bairro', veiculo.vendedor_origem_bairro],
    ['Cidade/UF', [veiculo.vendedor_origem_cidade, veiculo.vendedor_origem_uf].filter(Boolean).join('/') || null],
    ['CEP', veiculo.vendedor_origem_cep],
  ];

  const valores = [
    ...(ehDono ? [['Compra', fmt(veiculo.compra)]] : []),
    ['Mínimo', fmt(veiculo.minimo)],
    ['Venda', fmt(veiculo.pedido)],
    ...(ehDono ? [['Lucro estimado', fmt((veiculo.pedido || 0) - (veiculo.compra || 0) - custos)]] : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${veiculo.modelo}${veiculo.fab_mod ? ' · ' + veiculo.fab_mod : ''}`}
      maxWidth={640}
      footer={
        <>
          <label className="flex items-center gap-2 text-[12.5px] text-muted cursor-pointer">
            <input type="checkbox" checked={comCapa} onChange={(e) => setComCapa(e.target.checked)} />
            Com foto de capa
          </label>
          <button onClick={() => gerarFichaPdf({ veiculo: { ...veiculo, fotos }, config, ehDono, custos, comCapa })}
            className="inline-flex items-center gap-2 bg-blue hover:bg-blue-hover text-white font-semibold text-[13px] px-[15px] py-2.5 rounded-[9px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            Gerar PDF da ficha
          </button>
        </>
      }
    >
      {/* Galeria */}
      {fotos.length > 0 ? (
        <div className="mb-4">
          <div className="rounded-lg overflow-hidden border border-border aspect-[16/9] bg-bg">
            <img src={fotos[capaSel]?.url} alt={veiculo.modelo} className="w-full h-full object-cover" />
          </div>
          {fotos.length > 1 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {fotos.map((f, i) => (
                <button key={i} onClick={() => setCapaSel(i)}
                  className={['w-14 h-14 rounded-md overflow-hidden border-2', i === capaSel ? 'border-blue' : 'border-transparent'].join(' ')}>
                  <img src={f.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-dashed border-border aspect-[16/9] grid place-items-center text-muted-2 text-[13px] bg-bg">
          Sem fotos cadastradas
        </div>
      )}

      {/* Dados */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
        {dados.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-border/60 pb-1">
            <span className="text-muted">{k}</span><span className="font-medium text-navy">{v}</span>
          </div>
        ))}
        <div className="flex justify-between border-b border-border/60 pb-1">
          <span className="text-muted">Tempo de estoque</span>
          <span className="font-bold num" style={{ color: corTempoEstoque(dias) }}>{dias} dias</span>
        </div>
      </div>

      {/* Valores (regra 6.5) */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {valores.map(([k, v]) => (
          <div key={k} className="bg-bg rounded-lg px-3 py-2">
            <div className="text-[11px] text-muted-2">{k}</div>
            <div className="font-bold text-navy num">{v}</div>
          </div>
        ))}
      </div>

      {veiculo.descricao && <p className="text-[12.5px] text-muted mt-3 leading-relaxed">{veiculo.descricao}</p>}

      {/* Origem do veículo — de quem a loja comprou (RENAVE, ADR-16) */}
      {temOrigemVeiculo && (
        <div className="mt-4">
          <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mb-2">Origem do veículo (de quem a loja comprou)</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
            {origemVeiculo.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-border/60 pb-1">
                <span className="text-muted">{k}</span><span className="font-medium text-navy">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documentos */}
      <div className="mt-4">
        <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.04em] mb-2">Documentos</div>
        {docs.length === 0 ? (
          <div className="text-[12.5px] text-muted-2">Nenhum documento anexado. Use o ícone de documentos na linha do estoque.</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-3 py-2 text-[12.5px] odd:bg-[#FAFBFD] border-b border-border last:border-b-0">
                <span className="font-medium">{labelTipoDoc(d.tipo)}</span>
                <span className="text-muted-2">{ST_DOC[d.status] || d.status} · {ddmm(d.data)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
