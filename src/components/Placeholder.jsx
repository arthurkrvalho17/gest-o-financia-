// Tela vazia de módulo — usada na Fase 0. Cada fase seguinte substitui
// o conteúdo da sua página pelo módulo real.
export default function Placeholder({ Icon, titulo, descricao, fase }) {
  return (
    <div className="text-center py-[60px] px-5 text-muted">
      <div className="w-[54px] h-[54px] rounded-[14px] bg-blue-soft text-blue grid place-items-center mx-auto mb-4">
        {Icon && <Icon className="w-[26px] h-[26px]" />}
      </div>
      <h3 className="text-base font-bold text-navy">{titulo}</h3>
      <p className="text-[13px] mt-1.5 max-w-[420px] mx-auto leading-relaxed">{descricao}</p>
      {fase && (
        <span className="inline-block mt-4 text-[11.5px] font-semibold text-blue bg-blue-soft border border-[#D3E3F2] rounded-md px-2.5 py-1">
          Será construído na {fase}
        </span>
      )}
    </div>
  );
}
