import { useState } from 'react';
import { useAuth } from './AuthContext';
import { supabaseConfigurado } from '../lib/supabase';
import Logo from '../components/Logo';

export default function Login() {
  const { entrar, cadastrar } = useAuth();
  const [modo, setModo] = useState('entrar'); // entrar | cadastrar
  const [form, setForm] = useState({
    nomeLoja: '',
    nome: '',
    email: '',
    senha: '',
  });
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErro('');
    setAviso('');
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await entrar(form.email, form.senha);
        if (error) throw error;
        // O AuthProvider detecta a sessão e o App troca para o app logado.
      } else {
        const { data, error } = await cadastrar({
          email: form.email,
          senha: form.senha,
          nome: form.nome,
          nomeLoja: form.nomeLoja,
        });
        if (error) throw error;
        if (!data.session) {
          // Confirmação de e-mail está ligada no Supabase.
          setAviso(
            'Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre. ' +
              '(Para testes, você pode desligar "Confirm email" em Authentication → Providers → Email.)'
          );
          setModo('entrar');
        }
      }
    } catch (err) {
      setErro(traduzErro(err?.message || 'Algo deu errado.'));
    } finally {
      setEnviando(false);
    }
  }

  const ehCadastro = modo === 'cadastrar';

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-6">
          <Logo tone="dark" size={26} />
        </div>

        <div className="bg-white border border-border rounded-card shadow-card p-7">
          <h1 className="text-lg font-bold text-navy">
            {ehCadastro ? 'Criar sua loja' : 'Entrar'}
          </h1>
          <p className="text-[13px] text-muted mt-1">
            {ehCadastro
              ? 'Cadastre sua loja e comece a gerenciar o estoque.'
              : 'Acesse o painel da sua loja.'}
          </p>

          {!supabaseConfigurado && (
            <div className="mt-4 text-[12.5px] text-amber bg-amber-soft border border-[#F0DEC4] rounded-lg px-3 py-2.5 leading-relaxed">
              ⚠️ Supabase não configurado. Preencha <code>VITE_SUPABASE_URL</code> e{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> no <code>.env.local</code> e reinicie o{' '}
              <code>npm run dev</code>.
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3.5">
            {ehCadastro && (
              <>
                <Campo
                  label="Nome da loja"
                  value={form.nomeLoja}
                  onChange={(v) => set('nomeLoja', v)}
                  placeholder="Ex: Auto Mendes"
                  required
                />
                <Campo
                  label="Seu nome"
                  value={form.nome}
                  onChange={(v) => set('nome', v)}
                  placeholder="Ex: Rogério Mendes"
                  required
                />
              </>
            )}
            <Campo
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(v) => set('email', v)}
              placeholder="voce@email.com"
              required
            />
            <Campo
              label="Senha"
              type="password"
              value={form.senha}
              onChange={(v) => set('senha', v)}
              placeholder="mínimo 6 caracteres"
              required
            />

            {erro && (
              <div className="text-[12.5px] text-red bg-red-soft border border-[#F3D4D4] rounded-lg px-3 py-2.5">
                {erro}
              </div>
            )}
            {aviso && (
              <div className="text-[12.5px] text-blue bg-blue-soft border border-[#D3E3F2] rounded-lg px-3 py-2.5 leading-relaxed">
                {aviso}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="mt-1 w-full bg-blue hover:bg-blue-hover disabled:opacity-60 text-white font-semibold text-[14px] py-2.5 rounded-lg transition-colors"
            >
              {enviando ? 'Aguarde…' : ehCadastro ? 'Criar loja e entrar' : 'Entrar'}
            </button>
          </form>

          <div className="mt-5 text-center text-[13px] text-muted">
            {ehCadastro ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
            <button
              type="button"
              onClick={() => {
                setErro('');
                setAviso('');
                setModo(ehCadastro ? 'entrar' : 'cadastrar');
              }}
              className="text-blue font-semibold"
            >
              {ehCadastro ? 'Entrar' : 'Criar loja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, type = 'text', value, onChange, placeholder, required }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="text-[13.5px] px-3 py-2.5 border border-border rounded-lg outline-none focus:border-blue bg-white text-navy"
      />
    </label>
  );
}

function traduzErro(msg) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/user already registered/i.test(msg)) return 'Este e-mail já tem conta. Tente entrar.';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/failed to fetch/i.test(msg)) return 'Sem conexão com o Supabase. Confira as chaves no .env.local.';
  return msg;
}
