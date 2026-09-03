import { jsPDF } from 'jspdf';
import { fmt } from '../../lib/format';
import { getIdentidade } from '../../lib/lojaIdentidade';

// Cabeçalho dos documentos: LOGO/NOME DA LOJA em destaque + "feito com Financia+" pequeno.
export function cabecalhoLoja(doc, M = 48) {
  const id = getIdentidade();
  const W = doc.internal.pageSize.getWidth();
  if (id.logoDataUrl) {
    try { doc.addImage(id.logoDataUrl, 'PNG', M, 28, 130, 42); } catch { /* ignora */ }
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(10, 22, 40);
    doc.text(id.nome || 'Minha loja', M, 50);
    if (id.cnpj) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(130); doc.text(`CNPJ ${id.cnpj}`, M, 63); }
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
  doc.text('feito com Financia+', W - M, 44, { align: 'right' });
  doc.setTextColor(0);
  return 84;
}

// Mesmo motor de template para PDF e DOCX: preenche o {{placeholders}} do modelo
// (Padrão FINANCIA+ ou Seu modelo) com os dados do cliente/veículo/negociação.
export function montarDados({ config, cliente, veiculo, extra, dataStr }) {
  const v = veiculo || {};
  const x = extra || {};
  const c = cliente || {};
  const id = getIdentidade();
  const din = (k) => (x[k] != null && x[k] !== '' ? fmt(parseFloat(x[k]) || 0) : '—');
  const ou = (val, fb = '—') => (val != null && String(val).trim() !== '' ? val : fb);
  const naoConsta = (val) => ou(val, 'não consta');
  const agora = new Date();
  const ano = v.fab_mod || '—';
  return {
    ...x, // campos específicos do tipo (ex.: consignante_*, prazo) viram placeholders
    // valores monetários formatados
    valor_sinal: din('valor_sinal'),
    valor_pretendido: din('valor_pretendido'),
    valor_repasse: din('valor_repasse'),
    comissao: din('comissao'),
    valor_compra: din('valor_compra'),
    valor_venda: x.valor_venda ? fmt(parseFloat(x.valor_venda) || 0) : fmt(v.valor || 0),
    troca_valor: din('troca_valor'),
    observacoes: ou(x.observacoes),
    // loja (cadastro / identidade)
    loja_nome: config?.assinatura_nome || id.nome || 'Minha loja',
    loja_razao_social: config?.assinatura_nome || id.nome || 'Minha loja',
    loja_cnpj: config?.assinatura_cnpj || id.cnpj || '—',
    loja_endereco: ou(id.endereco),
    loja_cidade_uf: ou(id.cidade_uf),
    // datas / negociação
    data: dataStr,
    data_venda: ou(x.data_venda, dataStr),
    hora_venda: ou(x.hora_venda, agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
    forma_pagamento: ou(x.forma_pagamento),
    vendedor_nome: ou(x.vendedor_nome),
    // cliente
    cliente_nome: ou(c.nome),
    cliente_cpf: ou(c.cpf),
    cliente_nascimento: ou(c.nascimento),
    cliente_telefone: ou(c.telefone),
    cliente_email: ou(c.email),
    cliente_estado_civil: ou(c.estado_civil),
    cliente_endereco: ou(c.endereco),
    // procuração: outorgante = cliente; outorgado = extra
    outorgante_nome: ou(c.nome),
    outorgante_cpf: ou(c.cpf),
    outorgante_endereco: ou(c.endereco),
    outorgante_nacionalidade: ou(c.nacionalidade, 'brasileiro(a)'),
    outorgante_estado_civil: ou(c.estado_civil),
    outorgado_nome: ou(x.outorgado_nome),
    outorgado_cpf: ou(x.outorgado_cpf),
    outorgado_endereco: ou(x.outorgado_endereco),
    outorgado_nacionalidade: ou(x.outorgado_nacionalidade, 'brasileiro(a)'),
    outorgado_estado_civil: ou(x.outorgado_estado_civil),
    data_procuracao: ou(x.data_procuracao, dataStr),
    cidade_procuracao: ou(x.cidade_procuracao, id.cidade_uf),
    // veículo (cadastro do estoque)
    veiculo_marca: ou(v.marca),
    veiculo_modelo: ou(v.modelo),
    veiculo_ano: ano,
    veiculo_ano_fab_mod: ano,
    veiculo_placa: ou(v.placa),
    veiculo_renavam: ou(v.renavam),
    veiculo_chassi: ou(v.chassi),
    veiculo_km: v.km != null ? Number(v.km).toLocaleString('pt-BR') : '—',
    veiculo_cor: ou(v.cor),
    veiculo_combustivel: ou(v.combustivel),
    valor: fmt(parseFloat(x.valor_venda) || v.valor || 0),
    // situação de regularidade (Cláusula Nona) — "não consta" quando vazio
    tributos: naoConsta(x.tributos),
    furto: naoConsta(x.furto),
    multas_abertas: naoConsta(x.multas_abertas),
    alienacao: naoConsta(x.alienacao),
    registros_impeditivos: naoConsta(x.registros_impeditivos),
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
  let y = cabecalhoLoja(doc, M);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
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
