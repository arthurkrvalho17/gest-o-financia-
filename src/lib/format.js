// Formatação pt-BR usada em todo o app.

// R$ sem centavos (para valores "redondos" de carro): R$ 62.900
export const fmt = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR');

// R$ com centavos: R$ 1.234,56
export const brl = (n) =>
  'R$ ' +
  Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Valor com sinal explícito e arredondado: -4775 -> "− R$ 4.775" ; 8900 -> "+ R$ 8.900"
export const fmtSinal = (n) => (Number(n) < 0 ? '− ' : '+ ') + 'R$ ' + Math.round(Math.abs(Number(n) || 0)).toLocaleString('pt-BR');

// R$ arredondado (sem centavos), para KPIs e totais consolidados
export const fmtR = (n) => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');

// "1.234,56" (string digitada) -> 1234.56 (number)
export const parseBR = (s) =>
  parseFloat(
    String(s ?? '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '')
  ) || 0;

// Data ISO (YYYY-MM-DD) -> "DD/MM"; vazio -> ""
export function ddmm(iso) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso + 'T00:00:00') : iso;
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

// Hoje em ISO (YYYY-MM-DD)
export function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

// Diferença em dias entre uma data ISO e hoje
export function diasDesde(iso) {
  if (!iso) return 0;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}
