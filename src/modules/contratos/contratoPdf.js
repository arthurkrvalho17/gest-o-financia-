import { jsPDF } from 'jspdf';
import { fmt } from '../../lib/format';
import { MODELOS } from './modelos';

const m = (x, k) => (parseFloat(x[k]) || 0);

const corpoPorTipo = {
  compra_venda: (v, x) =>
    `Pelo presente instrumento particular, a loja vendedora e o(a) comprador(a) abaixo qualificado(a) ` +
    `ajustam a compra e venda do veículo descrito acima, pelo valor de ${fmt(m(x, 'valor_venda') || v.valor)}` +
    `${x.forma_pagamento ? ` (${x.forma_pagamento})` : ''}, livre e desembaraçado de quaisquer ônus, ` +
    `dando-se plena e geral quitação ao final do pagamento.${x.garantia ? ` Garantia: ${x.garantia}.` : ''}`,
  recibo_sinal: (v, x) =>
    `Recebemos do(a) cliente a quantia de ${fmt(m(x, 'sinal_recebido'))} a título de SINAL (arras) e ` +
    `princípio de pagamento para a reserva do veículo descrito acima (valor total ${fmt(m(x, 'valor_total') || v.valor)}, ` +
    `saldo de ${fmt(m(x, 'saldo_restante'))}). Sinal regido pelos arts. 417–420 do Código Civil.`,
  consignacao: (v, x) =>
    `O(A) consignante ${x.consignante_nome || '—'} (${x.consignante_doc || '—'}) entrega o veículo ` +
    `descrito acima à loja para venda em consignação pelo valor pretendido de ${fmt(m(x, 'valor_pretendido') || v.valor)}, ` +
    `com repasse ao dono de ${fmt(m(x, 'valor_repasse'))} e comissão da loja de ${fmt(m(x, 'comissao'))}.`,
  test_drive: (v, x) =>
    `O(A) condutor(a) (CNH ${x.cnh_numero || '—'}, cat. ${x.cnh_categoria || '—'}) realiza test drive do veículo ` +
    `descrito acima em ${x.data_hora || '—'}. ${x.declaracao || 'Assume total responsabilidade por danos, multas e ocorrências durante o teste.'}`,
  procuracao: (v, x) =>
    `${x.poderes || 'Outorga-se poderes para representar o(a) outorgante junto ao Detran.'} ` +
    `Outorgado: ${x.outorgado_nome || '—'} (CPF ${x.outorgado_cpf || '—'}). Validade: ${x.validade || 'indeterminada'}.`,
  nota_entrada: (v, x) =>
    `A loja declara ter adquirido do(a) vendedor(a) particular ${x.vendedor_nome || '—'} (CPF ` +
    `${x.vendedor_cpf || '—'}) o veículo descrito acima pelo valor de ${fmt(m(x, 'valor_compra') || v.compra || v.valor)} ` +
    `em ${x.data_entrada || '—'}.`,
};

// Gera e baixa o PDF do documento. Retorna o nome do arquivo.
export function gerarPdf({ tipo, config, cliente, veiculo, extra, dataStr }) {
  const modelo = MODELOS[tipo];
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const M = 56; // margem
  const W = doc.internal.pageSize.getWidth();
  let y = 64;

  // Cabeçalho — assinatura/identidade da loja
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(config.assinatura_nome || 'Minha loja', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  if (config.assinatura_cnpj) doc.text(`CNPJ ${config.assinatura_cnpj}`, M, y + 14);
  doc.setTextColor(0);

  // Título
  y += 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(modelo.nome.toUpperCase(), W / 2, y, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(dataStr, W / 2, y + 16, { align: 'center' });
  doc.setTextColor(0);

  // Seções
  y += 48;
  y = secao(doc, M, y, 'CLIENTE', [
    ['Nome', cliente.nome || '—'],
    ['CPF', cliente.cpf || '—'],
    ['Telefone', cliente.telefone || '—'],
  ]);

  y += 12;
  y = secao(doc, M, y, 'VEÍCULO', [
    ['Modelo', veiculo?.modelo || '—'],
    ['Ano', veiculo?.fab_mod || '—'],
    ['Placa', veiculo?.placa || '—'],
    ['Cor', veiculo?.cor || '—'],
    ['Valor', veiculo ? fmt(veiculo.valor) : '—'],
  ]);

  // Corpo do contrato
  y += 18;
  doc.setFontSize(10.5);
  const corpo = (corpoPorTipo[tipo] || corpoPorTipo.compra_venda)(veiculo || {}, extra || {});
  const linhas = doc.splitTextToSize(corpo, W - M * 2);
  doc.text(linhas, M, y);
  y += linhas.length * 15;

  // Assinatura
  y += 70;
  doc.setDrawColor(20);
  doc.line(M, y, M + 230, y);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(config.assinatura_nome || 'Minha loja', M, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Assinatura da loja', M, y + 30);

  const nomeArq = `${tipo}-${(cliente.nome || 'cliente').replace(/\s+/g, '_').toLowerCase()}.pdf`;
  doc.save(nomeArq);
  return nomeArq;
}

function secao(doc, x, y, titulo, pares) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(titulo, x, y);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  let yy = y + 18;
  for (const [k, v] of pares) {
    doc.setTextColor(120);
    doc.text(`${k}:`, x, yy);
    doc.setTextColor(0);
    doc.text(String(v), x + 90, yy);
    yy += 18;
  }
  return yy;
}
