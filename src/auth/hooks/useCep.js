import { useState } from 'react';

export function useCep() {
  const [buscando, setBuscando] = useState(false);
  const [erroCep, setErroCep] = useState('');

  async function buscarCep(cep) {
    const numeros = cep.replace(/\D/g, '');
    if (numeros.length !== 8) return null;
    setBuscando(true);
    setErroCep('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
      if (!res.ok) throw new Error('Falha na requisição');
      const data = await res.json();
      if (data.erro) {
        setErroCep('CEP não encontrado.');
        return null;
      }
      return {
        logradouro: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        uf: data.uf || '',
      };
    } catch {
      setErroCep('Não foi possível buscar o CEP. Preencha manualmente.');
      return null;
    } finally {
      setBuscando(false);
    }
  }

  return { buscarCep, buscando, erroCep, setErroCep };
}
