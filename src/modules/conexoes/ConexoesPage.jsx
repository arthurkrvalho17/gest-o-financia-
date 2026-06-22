import { useState } from 'react';
import { Topbar } from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { CANAIS_ANUNCIO, CANAIS_MENSAGERIA } from '../../integracoes/canais';
import { statusConexao, setStatusConexao } from '../../integracoes/demoIntegr';

const STATUS = {
  conectado: { label: 'Conectado', cls: 'bg-green-soft text-green', dot: '#15803D' },
  desconectado: { label: 'Desconectado', cls: 'bg-[#EEF2F7] text-muted', dot: '#94A3B8' },
  homologacao: { label: 'Em homologação', cls: 'bg-amber-soft text-amber', dot: '#B45309' },
  erro: { label: 'Erro', cls: 'bg-red-soft text-red', dot: '#B91C1C' },
};

export default function ConexoesPage() {
  const toast = useToast();
  const [, force] = useState(0);

  function conectar(canal, nome) {
    // No real: OAuth / Embedded Signup abre aqui. Demo: marca como conectado.
    setStatusConexao(canal, 'conectado');
    force((n) => n + 1);
    toast(`${nome} conectado (demo)`);
  }
  function desconectar(canal, nome) {
    setStatusConexao(canal, 'desconectado');
    force((n) => n + 1);
    toast(`${nome} desconectado`);
  }

  return (
    <>
      <Topbar titulo="Conexões" sub="As contas são da sua loja — o FINANCIA+ só orquestra" />
      <div className="px-7 py-6 max-w-[1240px]">
        <div className="mb-4 text-[12px] text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-2.5 flex items-start gap-2 leading-snug">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0 mt-px"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          Cada loja conecta as <b>próprias contas</b> (Mercado Livre, Webmotors, WhatsApp…). Os tokens ficam guardados com segurança e isolados por loja. Aqui é modo demonstração — a conexão real (OAuth/Embedded Signup) entra por fase, canal a canal.
        </div>

        <Secao titulo="Canais de anúncio" hint="publicar o estoque automaticamente">
          {CANAIS_ANUNCIO.map((c) => (
            <Linha key={c.chave} canal={c} onConectar={conectar} onDesconectar={desconectar} />
          ))}
        </Secao>

        <Secao titulo="Mensageria" hint="conversas no CRM" className="mt-[18px]">
          {CANAIS_MENSAGERIA.map((c) => (
            <Linha key={c.chave} canal={c} onConectar={conectar} onDesconectar={desconectar} />
          ))}
        </Secao>
      </div>
    </>
  );
}

function Secao({ titulo, hint, className = '', children }) {
  return (
    <div className={['bg-white border border-border rounded-card shadow-card overflow-hidden', className].join(' ')}>
      <div className="flex items-center justify-between px-[18px] py-[15px] border-b border-border">
        <h2 className="text-[14.5px] font-semibold">{titulo}</h2>
        <span className="text-[12px] text-muted-2">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Linha({ canal, onConectar, onDesconectar }) {
  const st = STATUS[statusConexao(canal.chave)] || STATUS.desconectado;
  const conectado = statusConexao(canal.chave) === 'conectado';
  return (
    <div className="flex items-center gap-3.5 px-[18px] py-3.5 border-b border-border last:border-b-0">
      <div className="w-9 h-9 rounded-[9px] grid place-items-center flex-shrink-0 font-bold text-[13px]"
        style={{ background: canal.cor, color: canal.corTexto }}>
        {canal.nome[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13.5px] flex items-center gap-2">
          {canal.nome}
          <span className={['inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2 py-[2px] rounded-full', st.cls].join(' ')}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} /> {st.label}
          </span>
        </div>
        <div className="text-[11.5px] text-muted-2 mt-0.5 leading-snug">{canal.nota}</div>
      </div>
      {conectado ? (
        <button onClick={() => onDesconectar(canal.chave, canal.nome)} className="text-[12.5px] font-semibold text-red hover:underline px-2">Desconectar</button>
      ) : (
        <button onClick={() => onConectar(canal.chave, canal.nome)} className="text-[12.5px] font-semibold text-white bg-blue hover:bg-blue-hover rounded-lg px-3.5 py-2">Conectar</button>
      )}
    </div>
  );
}
