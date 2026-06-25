import { jsPDF } from 'jspdf';
import { fmt } from '../../lib/format';

// Mesmo motor de template para PDF e DOCX: preenche o {{placeholders}} do modelo
// (Padrão FINANCIA+ ou Seu modelo) com os dados do cliente/veículo/negociação.
export function montarDados({ config, cliente, veiculo, extra, dataStr }) {
  const v = veiculo || {};
  const x = extra || {};
  return {
    loja_nome: config?.assinatura_nome || 'Minha loja',
    loja_cnpj: config?.assinatura_cnpj || '—',
    data: dataStr,
    cliente_nome: cliente?.nome || '—',
    cliente_cpf: cliente?.cpf || '—',
    cliente_nascimento: cliente?.nascimento || '—',
    cliente_telefone: cliente?.telefone || '—',
    cliente_endereco: x.endereco || '—',
    veiculo_modelo: v.modelo || '—',
    veiculo_ano: v.fab_mod || '—',
    veiculo_placa: v.placa || '—',
    veiculo_renavam: v.renavam || '—',
    veiculo_chassi: v.chassi || '—',
    veiculo_km: v.km != null ? Number(v.km).toLocaleString('pt-BR') : '—',
    veiculo_cor: v.cor || '—',
    valor: fmt(parseFloat(x.valor_venda) || v.valor || 0),
  };
}

export function preencher(conteudo, dados) {
  return String(conteudo || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (dados[k] != null ? dados[k] : `{{${k}}}`));
}

const slug = (s) => String(s || 'documento').replace(/\s+/g, '_').toLowerCase();

// PDF a partir do texto do modelo (com cabeçalho FINANCIA+).
export function exportarPdf({ conteudo, dados, tipoNome, clienteNome }) {
  const texto = preencher(conteudo, dados);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const M = 48, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(24, 95, 165);
  doc.text('FINANCIA', M, 48);
  doc.setTextColor(94, 160, 224); doc.text('+', M + doc.getTextWidth('FINANCIA'), 48);
  doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  let y = 84;
  for (const linha of doc.splitTextToSize(texto, W - M * 2)) {
    if (y > H - 50) { doc.addPage(); y = 56; }
    doc.text(linha, M, y); y += 16;
  }
  doc.save(`${slug(tipoNome)}-${slug(clienteNome)}.pdf`);
}

// DOCX editável: gera um .doc (HTML que o Word abre) com o mesmo conteúdo.
export function exportarDocx({ conteudo, dados, tipoNome, clienteNome }) {
  const texto = preencher(conteudo, dados).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:12pt;white-space:pre-wrap;line-height:1.5">${texto}</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${slug(tipoNome)}-${slug(clienteNome)}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
