import { jsPDF } from 'jspdf';
import { fmt } from '../../lib/format';
import { MODELOS } from './modelos';

const corpoPorTipo = {
  compra_venda: (v) =>
    `Pelo presente instrumento particular, a loja vendedora e o(a) comprador(a) abaixo qualificado(a) ` +
    `ajustam a compra e venda do veículo descrito acima, pelo valor de ${fmt(v.valor)}, livre e ` +
    `desembaraçado de quaisquer ônus, dando-se plena e geral quitação ao final do pagamento.`,
  recibo_sinal: (v, x) =>
    `Recebemos do(a) cliente a quantia de ${fmt(parseFloat(x.valor_sinal) || 0)} a título de SINAL e ` +
    `princípio de pagamento para a reserva do veículo descrito acima (valor total ${fmt(v.valor)}). ` +
    `O sinal será abatido do valor final no ato da compra.`,
  consignacao: (v, x) =>
    `O(A) consignante ${x.consignante_nome || '—'} (CPF ${x.consignante_cpf || '—'}) entrega o veículo ` +
    `descrito acima à loja para venda em consignação, autorizando o anúncio e a negociação pelo valor de ` +
    `${fmt(v.valor)}, ficando a loja responsável pela intermediação.`,
  test_drive: (v, x) =>
    `O(A) condutor(a) (CNH ${x.cnh || '—'}) declara estar realizando test drive do veículo descrito acima ` +
    `e assume total responsabilidade por danos, multas e ocorrências durante o período do teste.`,
  procuracao: (v, x) =>
    `Outorga-se poderes para representar o(a) outorgante junto ao Detran e demais órgãos para a finalidade ` +
    `de "${x.finalidade || 'transferência'}" do veículo descrito acima.`,
  nota_entrada: (v, x) =>
    `A loja declara ter adquirido do(a) vendedor(a) particular ${x.vendedor_nome || '—'} (CPF ` +
    `${x.vendedor_cpf || '—'}) o veículo descrito acima pelo valor de ${fmt(v.compra || v.valor)}.`,
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
