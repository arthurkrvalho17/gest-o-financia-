import { useState, useEffect } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';

// Conexão Webmotors: diferente de OLX/ML (OAuth com redirect), a credencial da
// loja é o usuário "Integrador de API" — criado pela própria loja no Cockpit
// Webmotors (CRM > Usuários > perfil "Integrador de API"; 1 por loja). O dono
// digita usuário e senha num formulário e salvamos em canal_credencial.
export function useWebmotorsAuth() {
  const { loja } = useAuth();
  const [status, setStatus] = useState('carregando');
  const [erroConexao, setErroConexao] = useState('');

  useEffect(() => {
    if (!supabaseConfigurado || !loja?.id) return;
    carregarStatus();
  }, [loja?.id]);

  async function carregarStatus() {
    const { data } = await supabase
      .from('canal_credencial')
      .select('status')
      .eq('loja_id', loja.id)
      .eq('canal', 'webmotors')
      .maybeSingle();
    setStatus(data?.status || 'desconectado');
  }

  // Salva a credencial do Integrador de API. Entra como "conectado"; se a
  // homologação Sensedia do app ainda não saiu, a publicação devolve o aviso.
  async function conectar({ usuario, senha }) {
    if (!loja?.id) return { error: new Error('Sem loja ativa.') };
    if (!usuario?.trim() || !senha) {
      const error = new Error('Informe o usuário e a senha do Integrador de API.');
      setErroConexao(error.message);
      return { error };
    }
    const { error } = await supabase.from('canal_credencial').upsert(
      {
        loja_id: loja.id,
        canal: 'webmotors',
        credenciais: { usuario: usuario.trim(), senha },
        status: 'conectado',
        conectado_em: new Date().toISOString(),
      },
      { onConflict: 'loja_id,canal' }
    );
    if (error) setErroConexao(error.message);
    else setStatus('conectado');
    return { error };
  }

  async function desconectar() {
    if (!loja?.id) return;
    await supabase
      .from('canal_credencial')
      .delete()
      .eq('loja_id', loja.id)
      .eq('canal', 'webmotors');
    setStatus('desconectado');
  }

  return { status, erroConexao, conectar, desconectar };
}
