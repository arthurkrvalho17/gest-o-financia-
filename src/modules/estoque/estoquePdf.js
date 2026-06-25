import { jsPDF } from 'jspdf';
import { fmt, ddmm, diasDesde } from '../../lib/format';
import { getIdentidade } from '../../lib/lojaIdentidade';

// Carrega uma imagem (url/blob) como dataURL via canvas. Best-effort: retorna
// null se falhar (ex.: CORS no Storage real). No real, a geração é server-side.
function carregarImagem(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve({ dataURL: c.toDataURL('image/jpeg', 0.8), w: img.naturalWidth, h: img.naturalHeight });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function cabecalho(doc, config, titulo) {
  const M = 48, W = doc.internal.pageSize.getWidth();
  const id = getIdentidade();
  // Logo/nome da loja em destaque
  if (id.logoDataUrl) {
    try { doc.addImage(id.logoDataUrl, 'PNG', M, 28, 130, 42); } catch { /* ignora */ }
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(10, 22, 40);
    doc.text(id.nome || config?.assinatura_nome || 'Minha loja', M, 50);
  }
  // "feito com Financia+" pequeno
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150);
  doc.text('feito com Financia+', W - M, 44, { align: 'right' });
  // Título do documento
  doc.setTextColor(10, 22, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titulo, M, 92);
  doc.setTextColor(0);
  return 92;
}

// PDF da ficha de UM carro. valores conforme regra 6.5 (ehDono).
export async function gerarFichaPdf({ veiculo, config, ehDono, custos = 0, comCapa = true }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const M = 48, W = doc.internal.pageSize.getWidth();
  let y = cabecalho(doc, config, `${veiculo.modelo} ${veiculo.fab_mod || ''}`.trim());
  y += 20;

  if (comCapa) {
    const capa = veiculo.fotos?.[0]?.url;
    const img = await carregarImagem(capa);
    if (img) {
      const w = W - M * 2, h = Math.min(220, (img.h / img.w) * w);
      doc.addImage(img.dataURL, 'JPEG', M, y, w, h);
      y += h + 18;
    }
  }

  const dados = [
    ['Fab/Mod', veiculo.fab_mod], ['Cor', veiculo.cor], ['Placa', veiculo.placa],
    ['RENAVAM', veiculo.renavam], ['Chassi', veiculo.chassi],
    ['Quilometragem', veiculo.km != null ? Number(veiculo.km).toLocaleString('pt-BR') + ' km' : null],
    ['Combustível', veiculo.combustivel], ['Tipo', veiculo.tipo === 'consignado' ? 'Consignado' : 'Próprio'],
    ['Entrada', ddmm(veiculo.entrada)], ['Tempo de estoque', diasDesde(veiculo.entrada) + ' dias'],
  ].filter(([, v]) => v);

  doc.setFontSize(11);
  for (const [k, v] of dados) {
    doc.setTextColor(120); doc.text(`${k}:`, M, y);
    doc.setTextColor(0); doc.text(String(v), M + 130, y);
    y += 19;
  }

  // Valores (regra 6.5)
  y += 8; doc.setDrawColor(225); doc.line(M, y, W - M, y); y += 22;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  const valores = [
    ...(ehDono ? [['Valor de compra', fmt(veiculo.compra)]] : []),
    ['Valor mínimo', fmt(veiculo.minimo)],
    ['Valor de venda', fmt(veiculo.pedido)],
    ...(ehDono ? [['Lucro estimado', fmt((veiculo.pedido || 0) - (veiculo.compra || 0) - custos)]] : []),
  ];
  for (const [k, v] of valores) {
    doc.setTextColor(120); doc.setFont('helvetica', 'normal'); doc.text(`${k}:`, M, y);
    doc.setTextColor(10, 22, 40); doc.setFont('helvetica', 'bold'); doc.text(String(v), M + 130, y);
    y += 20;
  }

  if (veiculo.descricao) {
    y += 10; doc.setFont('helvetica', 'bold'); doc.setTextColor(120); doc.setFontSize(10); doc.text('DESCRIÇÃO', M, y); y += 16;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0); doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(veiculo.descricao, W - M * 2), M, y);
  }

  doc.save(`ficha-${(veiculo.modelo || 'carro').replace(/\s+/g, '_').toLowerCase()}.pdf`);
}

const FAIXAS = [
  { label: 'Até R$ 30.000', min: 0, max: 30000 },
  { label: 'R$ 30.000 a R$ 60.000', min: 30000, max: 60000 },
  { label: 'R$ 60.000 a R$ 100.000', min: 60000, max: 100000 },
  { label: 'Acima de R$ 100.000', min: 100000, max: Infinity },
];

// PDF do estoque (catálogo) agrupado por faixa de preço.
export async function gerarEstoquePdf({ veiculos, config, comCapa = true }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const M = 48, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  let y = cabecalho(doc, config, 'Catálogo de estoque'); y += 18;

  // pré-carrega capas (se pedido)
  const capas = {};
  if (comCapa) {
    for (const v of veiculos) {
      if (v.fotos?.[0]?.url) capas[v.id] = await carregarImagem(v.fotos[0].url);
    }
  }

  for (const faixa of FAIXAS) {
    const lista = veiculos.filter((v) => (v.pedido || 0) >= faixa.min && (v.pedido || 0) < faixa.max);
    if (lista.length === 0) continue;
    if (y > H - 90) { doc.addPage(); y = 56; }
    doc.setFillColor(232, 240, 248); doc.rect(M, y - 12, W - M * 2, 22, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(24, 95, 165);
    doc.text(`${faixa.label}  ·  ${lista.length} veículo(s)`, M + 8, y + 3);
    doc.setTextColor(0); y += 28;

    for (const v of lista) {
      const rowH = comCapa ? 56 : 30;
      if (y > H - rowH - 30) { doc.addPage(); y = 56; }
      let x = M;
      if (comCapa) {
        const img = capas[v.id];
        if (img) { doc.addImage(img.dataURL, 'JPEG', x, y, 72, 48); }
        else { doc.setDrawColor(225); doc.rect(x, y, 72, 48); doc.setFontSize(7); doc.setTextColor(170); doc.text('sem foto', x + 22, y + 26); doc.setTextColor(0); }
        x += 84;
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(v.modelo || '—', x, y + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
      const meta = [v.fab_mod, v.cor, v.tipo === 'consignado' ? 'Consignado' : 'Próprio', v.km != null ? Number(v.km).toLocaleString('pt-BR') + ' km' : null].filter(Boolean).join(' · ');
      doc.text(meta, x, y + 27);
      doc.setTextColor(24, 95, 165); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(fmt(v.pedido), W - M, y + 18, { align: 'right' });
      doc.setTextColor(0);
      y += rowH;
    }
    y += 10;
  }

  doc.save('catalogo-estoque.pdf');
}
