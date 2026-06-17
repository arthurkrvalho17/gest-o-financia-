import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [usuario, setUsuario] = useState(null); // linha em "usuarios"
  const [loja, setLoja] = useState(null); // linha em "lojas"
  const [carregando, setCarregando] = useState(true);

  // Busca o usuário (e a loja dele) a partir da sessão logada.
  async function carregarPerfil(sessaoAtual) {
    if (!sessaoAtual?.user) {
      setUsuario(null);
      setLoja(null);
      return;
    }
    const { data: u } = await supabase
      .from('usuarios')
      .select('id, loja_id, nome, email, papel')
      .eq('id', sessaoAtual.user.id)
      .maybeSingle();
    setUsuario(u || null);

    if (u?.loja_id) {
      const { data: l } = await supabase
        .from('lojas')
        .select('id, nome, cnpj')
        .eq('id', u.loja_id)
        .maybeSingle();
      setLoja(l || null);
    } else {
      setLoja(null);
    }
  }

  useEffect(() => {
    let ativo = true;

    // Modo demonstração: sem Supabase configurado, libera o app com uma
    // loja fictícia para a interface ser navegável antes de plugar o backend.
    if (!supabaseConfigurado) {
      setLoja({ id: 'demo', nome: 'Loja Demonstração' });
      setUsuario({ id: 'demo', loja_id: 'demo', nome: 'Você (demo)', papel: 'dono' });
      setCarregando(false);
      return () => {};
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      await carregarPerfil(data.session);
      setCarregando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, novaSessao) => {
      setSession(novaSessao);
      await carregarPerfil(novaSessao);
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function entrar(email, senha) {
    return supabase.auth.signInWithPassword({ email, password: senha });
  }

  async function cadastrar({ email, senha, nome, nomeLoja, cnpj }) {
    // O trigger handle_new_user() lê este metadata para criar a loja
    // e vincular o usuário a ela automaticamente.
    return supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, nome_loja: nomeLoja, cnpj: cnpj || '' },
      },
    });
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  const valor = { session, usuario, loja, carregando, entrar, cadastrar, sair };
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
