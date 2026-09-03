import { supabase } from './supabase';

// Anexa `compra` aos veículos vindos de `veiculos.select('*')`.
// A coluna saiu de `veiculos` (migration 0026): agora vive em
// `veiculo_valor_compra`, protegida por RLS que exige loja + papel='dono'.
// Um funcionário autenticado recebe [] desse select (RLS, não o React) —
// o merge abaixo então cai no default 0 para cada veículo, o mesmo
// comportamento que o front já tinha antes, só que garantido pelo banco.
export async function anexarCompra(veiculos) {
  if (!veiculos?.length) return veiculos || [];
  const { data } = await supabase.from('veiculo_valor_compra').select('veiculo_id, compra');
  const porVeiculo = new Map((data || []).map((r) => [r.veiculo_id, Number(r.compra) || 0]));
  return veiculos.map((v) => ({ ...v, compra: porVeiculo.get(v.id) ?? 0 }));
}
