import { useState, useEffect } from 'react';
import { supabase, supabaseConfigurado } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';

// Emissão de NF-e (Spedy — ADR-17). Diferente dos canais de anúncio: não há
// conta para a loja criar em lugar nenhum — o Financia+ é a empresa Owner na
// Spedy e provisiona a sub-empresa da loja com os próprios dados de cadastro.
// A loja só precisa enviar o certificado digital A1 (.pfx) e a configuração
// tributária (config_fiscal), confirmada com o contador.
export function useSpedyAuth() {
  const { loja } = useAuth();
  const lojaId = loja?.id;
  const [status, setStatus] = useState('carregando');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!supabaseConfigurado || !lojaId) return;
    let ativo = true;
    supabase
      .from('canal_credencial')
      .select('status')
      .eq('loja_id', lojaId)
      .eq('canal', 'spedy')
      .maybeSingle()
      .then(({ data }) => {
        if (ativo) setStatus(data?.status || 'desconectado');
      });
    return () => { ativo = false; };
  }, [lojaId]);

  async function provisionar() {
    setErro('');
    const { data, error } = await supabase.functions.invoke('spedy-api', { body: { action: 'provisionar' } });
    if (error) {
      const msg = await extrairErro(error);
      setErro(msg);
      return { error: new Error(msg) };
    }
    setStatus('conectado');
    return { data };
  }

  // Reaplica série/numeração/environmentType na Spedy (a action 'configurar'
  // roda sozinha após o provisionamento; isto é o replay manual se falhar
  // ou se o ambiente mudar).
  async function reconfigurar() {
    setErro('');
    const { data, error } = await supabase.functions.invoke('spedy-api', { body: { action: 'configurar' } });
    if (error) {
      const msg = await extrairErro(error);
      setErro(msg);
      return { error: new Error(msg) };
    }
    return { data };
  }

  async function enviarCertificado({ file, password }) {
    setErro('');
    const fileBase64 = await fileToBase64(file);
    const { data, error } = await supabase.functions.invoke('spedy-api', {
      body: { action: 'certificado', fileBase64, filename: file.name, password },
    });
    if (error) {
      const msg = await extrairErro(error);
      setErro(msg);
      return { error: new Error(msg) };
    }
    // data: { ok, expiraEm, titular, emissor, ativo } — nunca o arquivo/senha.
    return { error: null, data };
  }

  async function salvarConfigFiscal(configFiscal) {
    if (!loja?.id) return { error: new Error('Sem loja ativa.') };
    const { error } = await supabase
      .from('loja_config')
      .upsert({ loja_id: loja.id, config_fiscal: configFiscal }, { onConflict: 'loja_id' });
    return { error };
  }

  async function desconectar() {
    if (!loja?.id) return;
    await supabase.from('canal_credencial').delete().eq('loja_id', loja.id).eq('canal', 'spedy');
    setStatus('desconectado');
  }

  return { status, erro, provisionar, reconfigurar, enviarCertificado, salvarConfigFiscal, desconectar };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extrairErro(error) {
  try {
    const detalhe = await error.context.json();
    return detalhe.erro || detalhe.message || error.message;
  } catch {
    return error.message;
  }
}
