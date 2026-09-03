import { useState } from 'react';
import { useAuth } from './AuthContext';
import Logo from '../components/Logo';

function checarSenha(senha) {
  return {
    minChar: senha.length >= 8,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    numero: /[0-9]/.test(senha),
    especial: /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(senha),
  };
}

function senhaValida(check) {
  return Object.values(check).every(Boolean);
}

function Campo({ label, erro, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">
        {label} <span className="text-red-500" aria-hidden="true">*</span>
      </span>
      {children}
      {erro && <span role="alert" className="text-[11px] text-red-500">{erro}</span>}
    </div>
  );
}

function Olho() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OlhoFechado() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function SenhaInput({ label, value, onChange, onBlur, erro, autoComplete }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <Campo label={label} erro={erro}>
      <div className="relative">
        <input
          type={mostrar ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={!!erro}
          autoComplete={autoComplete}
          className={`w-full text-[13.5px] px-3 py-2.5 pr-10 border rounded-lg outline-none transition-colors bg-white text-navy
            ${erro ? 'border-red-400 focus:border-red-500' : 'border-border focus:border-blue'}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setMostrar((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy transition-colors"
          aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {mostrar ? <OlhoFechado /> : <Olho />}
        </button>
      </div>
    </Campo>
  );
}

function SenhaChecklist({ check }) {
  const itens = [
    { key: 'minChar', label: 'Mínimo 8 caracteres' },
    { key: 'maiuscula', label: 'Uma letra maiúscula (A–Z)' },
    { key: 'minuscula', label: 'Uma letra minúscula (a–z)' },
    { key: 'numero', label: 'Um número (0–9)' },
    { key: 'especial', label: 'Um caractere especial (!@#$%...)' },
  ];
  return (
    <div className="bg-[#F7F9FC] border border-border rounded-lg px-3.5 py-2.5 flex flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold text-muted uppercase tracking-wider mb-0.5">
        Requisitos da senha
      </span>
      {itens.map(({ key, label }) => (
        <div
          key={key}
          className={`flex items-center gap-2 text-[12px] transition-colors ${
            check[key] ? 'text-green-600 font-medium' : 'text-muted'
          }`}
        >
          <span className="w-3.5 text-center font-bold">{check[key] ? '✓' : '○'}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

export default function RedefinirSenha() {
  const { redefinirSenha, sair } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const check = checarSenha(senha);

  async function handleSubmit(ev) {
    ev.preventDefault();
    const e = {};
    if (!senhaValida(check)) e.senha = 'A senha não atende todos os requisitos acima.';
    if (!confirmar) e.confirmar = 'Confirme sua nova senha.';
    else if (confirmar !== senha) e.confirmar = 'As senhas não coincidem.';
    if (Object.keys(e).length) { setErros(e); return; }

    setEnviando(true);
    setErroGeral('');
    const { error } = await redefinirSenha(senha);
    setEnviando(false);

    if (error) {
      setErroGeral('Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.');
    } else {
      setSucesso(true);
      setTimeout(() => sair(), 3000);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[460px]">

        <div className="flex justify-center mb-6">
          <Logo tone="dark" size={26} />
        </div>

        <div className="bg-white border border-border rounded-card shadow-card p-7">
          <div className="mb-5">
            <h1 className="text-lg font-bold text-navy">Redefinir senha</h1>
            <p className="text-[13px] text-muted mt-1">Escolha uma senha forte para sua conta.</p>
          </div>

          {sucesso ? (
            <div role="status" className="text-[13px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 leading-relaxed">
              ✓ Senha redefinida com sucesso! Você será redirecionado para o login em instantes…
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <SenhaInput
                label="Nova senha"
                value={senha}
                onChange={(e) => { setSenha(e.target.value); setErros((r) => ({ ...r, senha: '' })); }}
                onBlur={() => {
                  if (senha && !senhaValida(check))
                    setErros((r) => ({ ...r, senha: 'A senha não atende todos os requisitos.' }));
                }}
                erro={erros.senha}
                autoComplete="new-password"
              />

              {senha.length > 0 && <SenhaChecklist check={check} />}

              <SenhaInput
                label="Confirmar nova senha"
                value={confirmar}
                onChange={(e) => { setConfirmar(e.target.value); setErros((r) => ({ ...r, confirmar: '' })); }}
                onBlur={() => {
                  if (confirmar && confirmar !== senha)
                    setErros((r) => ({ ...r, confirmar: 'As senhas não coincidem.' }));
                }}
                erro={erros.confirmar}
                autoComplete="new-password"
              />

              {erroGeral && (
                <div role="alert" className="text-[12.5px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-relaxed">
                  {erroGeral}
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="mt-1 w-full bg-blue hover:bg-blue-hover disabled:opacity-60 text-white font-semibold text-[14px] py-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue focus:ring-offset-2"
              >
                {enviando ? 'Aguarde…' : 'Salvar nova senha'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[11.5px] text-muted">
          © {new Date().getFullYear()} Financia+. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
