// Desempenho dos vendedores por mês (demo). No real, isto é computado das vendas
// registradas (vendedor_id + valor_venda + data_venda), guardando o histórico mensal.
export const desempenhoDemo = [
  { mes: '2026-06', nome: 'Junho', vendedores: [
    { nome: 'Lucas', vendas: 3, faturamento: 312000 },
    { nome: 'Pereira', vendas: 2, faturamento: 198000 },
    { nome: 'Rogério (dono)', vendas: 1, faturamento: 61500 },
  ] },
  { mes: '2026-05', nome: 'Maio', vendedores: [
    { nome: 'Pereira', vendas: 5, faturamento: 540000 },
    { nome: 'Lucas', vendas: 4, faturamento: 402000 },
    { nome: 'Rogério (dono)', vendas: 3, faturamento: 251000 },
  ] },
  { mes: '2026-04', nome: 'Abril', vendedores: [
    { nome: 'Lucas', vendas: 6, faturamento: 610000 },
    { nome: 'Pereira', vendas: 3, faturamento: 288000 },
  ] },
];

// Computa o ranking mês a mês a partir das vendas reais (modo Supabase).
export function computarDesempenho(vendas, equipe) {
  const nomePorId = Object.fromEntries((equipe || []).map((u) => [u.id, u.nome]));
  const NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const meses = {};
  for (const v of vendas || []) {
    const mes = (v.data_venda || '').slice(0, 7);
    if (!mes) continue;
    const nome = nomePorId[v.vendedor_id] || 'Sem vendedor';
    meses[mes] ||= {};
    meses[mes][nome] ||= { nome, vendas: 0, faturamento: 0 };
    meses[mes][nome].vendas += 1;
    meses[mes][nome].faturamento += Number(v.valor_venda) || 0;
  }
  return Object.entries(meses)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mes, byNome]) => ({
      mes,
      nome: NOMES[parseInt(mes.slice(5, 7), 10) - 1],
      vendedores: Object.values(byNome).sort((a, b) => b.vendas - a.vendas),
    }));
}
