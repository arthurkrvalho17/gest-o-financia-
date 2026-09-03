import { useState } from 'react';
import { useAuth } from './AuthContext';
import { supabaseConfigurado } from '../lib/supabase';
import Logo from '../components/Logo';
import { useCep } from './hooks/useCep';

// ── Máscaras ────────────────────────────────────────────────────────────────
function mascaraCelular(v) {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (!n) return '';
  if (n.length <= 2) return `(${n}`;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

function mascaraCep(v) {
  const n = v.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 5) return n;
  return `${n.slice(0, 5)}-${n.slice(5)}`;
}

function mascaraCnpj(v) {
  // Remove separadores, converte para maiúsculo, mantém apenas alfanumérico (A-Z0-9)
  const alfanum = v
    .replace(/[.\-/\s]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14);

  // Posições 1-12: alfanumérico livre; posições 13-14 (DVs): apenas dígitos
  const base = alfanum.slice(0, 12);
  const dv = alfanum.slice(12).replace(/\D/g, '').slice(0, 2);
  const n = base + dv;

  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

// ── Validadores ─────────────────────────────────────────────────────────────
function validarEmail(v) {
  if (!v) return 'E-mail é obrigatório.';
  if (/\s/.test(v)) return 'E-mail não pode ter espaços.';
  const partes = v.split('@');
  if (partes.length !== 2) return 'E-mail deve conter exatamente um @.';
  const [usuario, dominio] = partes;
  if (!usuario) return 'Informe o usuário antes do @.';
  if (!dominio || !dominio.includes('.')) return 'Informe um domínio válido (ex: gmail.com).';
  return '';
}

function validarCelular(v) {
  if (!v) return 'Celular é obrigatório.';
  if (!/^\(\d{2}\) \d{4,5}-\d{4}$/.test(v)) return 'Formato esperado: (DD) NNNNN-NNNN.';
  return '';
}

function validarCep(v) {
  if (!v) return 'CEP é obrigatório.';
  if (!/^\d{5}-\d{3}$/.test(v)) return 'Formato esperado: 00000-000.';
  return '';
}

function validarCnpj(v) {
  if (!v) return 'CNPJ é obrigatório.';

  // Remove máscara e normaliza para maiúsculo
  const limpo = v.replace(/[.\-/\s]/g, '').toUpperCase();

  if (limpo.length !== 14) return 'CNPJ deve ter 14 caracteres.';

  // Posições 1-12: alfanumérico (A-Z ou 0-9); posições 13-14: apenas dígitos
  if (!/^[A-Z0-9]{12}\d{2}$/.test(limpo)) return 'CNPJ inválido.';

  // Rejeita CNPJs com todos os caracteres iguais (ex: 00000000000000)
  if (/^(.)\1{13}$/.test(limpo)) return 'CNPJ inválido.';

  // Conversão ASCII adaptada (vigente a partir de jul/2026):
  // '0'→0 … '9'→9, 'A'→17, 'B'→18 … 'Z'→42  (charCode − 48)
  const vals = [...limpo].map(c => c.charCodeAt(0) - 48);

  // 1º dígito verificador — pesos [5,4,3,2,9,8,7,6,5,4,3,2] sobre posições 1-12
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma1 = pesos1.reduce((s, p, i) => s + vals[i] * p, 0);
  const dv1 = soma1 % 11 < 2 ? 0 : 11 - (soma1 % 11);

  // 2º dígito verificador — pesos [6,5,4,3,2,9,8,7,6,5,4,3] sobre posições 1-12,
  // mais o dv1 calculado (não o do input) com peso 2
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3];
  const soma2 = pesos2.reduce((s, p, i) => s + vals[i] * p, 0) + dv1 * 2;
  const dv2 = soma2 % 11 < 2 ? 0 : 11 - (soma2 % 11);

  if (dv1 !== vals[12] || dv2 !== vals[13]) return 'CNPJ inválido.';

  return '';
}

// Checklist de requisitos da senha
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

function traduzErro(msg) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/user already registered/i.test(msg)) return 'Este e-mail já tem conta. Tente entrar.';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/failed to fetch/i.test(msg)) return 'Sem conexão com o servidor. Verifique as chaves no .env.local.';
  return msg;
}

// ── Sub-componentes ─────────────────────────────────────────────────────────
function Divisor({ label }) {
  return (
    <div className="flex items-center gap-3 pt-1 pb-0.5">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10.5px] font-semibold text-muted uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function Campo({ label, obrigatorio, erro, dica, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-muted">
        {label}
        {obrigatorio && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
      </span>
      {children}
      {dica && !erro && <span className="text-[11px] text-muted">{dica}</span>}
      {erro && (
        <span role="alert" className="text-[11px] text-red-500">
          {erro}
        </span>
      )}
    </div>
  );
}

function InputBase({ erro, className, ...props }) {
  return (
    <input
      aria-invalid={!!erro}
      className={`text-[13.5px] px-3 py-2.5 border rounded-lg outline-none transition-colors bg-white text-navy
        ${erro ? 'border-red-400 focus:border-red-500' : 'border-border focus:border-blue'}
        ${className || ''}`}
      {...props}
    />
  );
}

function SenhaInput({ label, obrigatorio, value, onChange, onBlur, erro, autoComplete = 'new-password' }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <Campo label={label} obrigatorio={obrigatorio} erro={erro}>
      <div className="relative">
        <InputBase
          type={mostrar ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          erro={erro}
          autoComplete={autoComplete}
          className="w-full pr-10"
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

// Ícones SVG leves (inline)
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

// ── Componente principal ────────────────────────────────────────────────────
export default function Login() {
  const { entrar, cadastrar, recuperarSenha } = useAuth();
  const { buscarCep, buscando: buscandoCep, erroCep, setErroCep } = useCep();

  const [modo, setModo] = useState('entrar');
  const [form, setForm] = useState({
    nome: '', nomeLoja: '', cnpj: '', email: '', celular: '',
    senha: '', confirmarSenha: '',
    cep: '', logradouro: '', bairro: '', cidade: '', uf: '',
    aceitaLgpd: false,
  });
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Estado do formulário de recuperação de senha
  const [emailRec, setEmailRec] = useState('');
  const [erroRec, setErroRec] = useState('');
  const [recuperacaoOk, setRecuperacaoOk] = useState(false);
  const [enviandoRec, setEnviandoRec] = useState(false);

  const senhaCheck = checarSenha(form.senha);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => ({ ...e, [campo]: '' }));
  }

  function validarCampo(campo, valor) {
    let err = '';
    if (campo === 'email') err = validarEmail(valor);
    if (campo === 'celular') err = validarCelular(valor);
    if (campo === 'cnpj') err = validarCnpj(valor);
    if (campo === 'cep') err = validarCep(valor);
    if (campo === 'senha' && !senhaValida(checarSenha(valor))) err = 'A senha não atende todos os requisitos.';
    if (campo === 'confirmarSenha' && valor !== form.senha) err = 'As senhas não coincidem.';
    if (err) setErros((e) => ({ ...e, [campo]: err }));
  }

  function validarCadastroCompleto() {
    const e = {};
    if (!form.nome.trim()) e.nome = 'Nome é obrigatório.';
    if (!form.nomeLoja.trim()) e.nomeLoja = 'Nome da loja é obrigatório.';
    const eCnpj = validarCnpj(form.cnpj);
    if (eCnpj) e.cnpj = eCnpj;
    const eEmail = validarEmail(form.email);
    if (eEmail) e.email = eEmail;
    const eCelular = validarCelular(form.celular);
    if (eCelular) e.celular = eCelular;
    if (!senhaValida(senhaCheck)) e.senha = 'A senha não atende todos os requisitos acima.';
    if (!form.confirmarSenha) e.confirmarSenha = 'Confirme sua senha.';
    else if (form.confirmarSenha !== form.senha) e.confirmarSenha = 'As senhas não coincidem.';
    const eCep = validarCep(form.cep);
    if (eCep) e.cep = eCep;
    if (!form.logradouro.trim()) e.logradouro = 'Logradouro é obrigatório.';
    if (!form.bairro.trim()) e.bairro = 'Bairro é obrigatório.';
    if (!form.cidade.trim()) e.cidade = 'Cidade é obrigatória.';
    if (!form.uf.trim()) e.uf = 'UF é obrigatória.';
    if (!form.aceitaLgpd) e.aceitaLgpd = 'Você precisa aceitar a política de privacidade para continuar.';
    return e;
  }

  function validarLogin() {
    const e = {};
    const eEmail = validarEmail(form.email);
    if (eEmail) e.email = eEmail;
    if (!form.senha) e.senha = 'Senha é obrigatória.';
    return e;
  }

  async function onCepChange(valor) {
    const masked = mascaraCep(valor);
    set('cep', masked);
    setErroCep('');
    if (masked.replace(/\D/g, '').length === 8) {
      const endereco = await buscarCep(masked);
      if (endereco) {
        setForm((f) => ({ ...f, cep: masked, ...endereco }));
        setErros((e) => ({ ...e, cep: '', logradouro: '', bairro: '', cidade: '', uf: '' }));
      }
    }
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    setErroGeral('');
    setAviso('');

    if (modo === 'recuperar') {
      await enviarRecuperacao();
      return;
    }

    const validacao = modo === 'entrar' ? validarLogin() : validarCadastroCompleto();
    if (Object.keys(validacao).length) {
      setErros(validacao);
      // Scroll to first error
      setTimeout(() => {
        document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await entrar(form.email, form.senha);
        if (error) throw error;
      } else {
        const { data, error } = await cadastrar({
          email: form.email,
          senha: form.senha,
          nome: form.nome,
          nomeLoja: form.nomeLoja,
          cnpj: form.cnpj,
          celular: form.celular,
          cep: form.cep,
          logradouro: form.logradouro,
          bairro: form.bairro,
          cidade: form.cidade,
          uf: form.uf,
        });
        if (error) throw error;
        if (!data.session) {
          setAviso('Conta criada! Verifique seu e-mail e clique no link de confirmação para acessar o sistema.');
          trocarModo('entrar');
        }
      }
    } catch (err) {
      setErroGeral(traduzErro(err?.message || 'Algo deu errado. Tente novamente.'));
    } finally {
      setEnviando(false);
    }
  }

  function trocarModo(novoModo) {
    setErros({});
    setErroGeral('');
    setAviso('');
    setEmailRec('');
    setErroRec('');
    setRecuperacaoOk(false);
    setModo(novoModo);
    setForm((f) => ({ ...f, senha: '', confirmarSenha: '' }));
  }

  async function enviarRecuperacao() {
    const erroEmail = validarEmail(emailRec);
    if (erroEmail) { setErroRec(erroEmail); return; }
    setEnviandoRec(true);
    setErroRec('');
    const { error } = await recuperarSenha(emailRec);
    setEnviandoRec(false);
    if (error) {
      setErroRec('Não foi possível enviar o e-mail. Tente novamente.');
    } else {
      setRecuperacaoOk(true);
    }
  }

  const ehCadastro = modo === 'cadastrar';
  const ehRecuperar = modo === 'recuperar';

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[460px]">

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Logo tone="dark" size={26} />
        </div>

        <div className="bg-white border border-border rounded-card shadow-card p-7">

          {/* Cabeçalho */}
          <div className="mb-5">
            <h1 className="text-lg font-bold text-navy">
              {ehCadastro ? 'Criar sua loja' : ehRecuperar ? 'Recuperar acesso' : 'Entrar no sistema'}
            </h1>
            <p className="text-[13px] text-muted mt-1">
              {ehCadastro
                ? 'Preencha os dados abaixo para começar a usar o Financia+.'
                : ehRecuperar
                ? 'Informe seu e-mail e enviaremos um link para redefinir sua senha.'
                : 'Acesse o painel da sua loja.'}
            </p>
          </div>

          {/* Aviso Supabase não configurado */}
          {!supabaseConfigurado && (
            <div role="alert" className="mb-4 text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-relaxed">
              ⚠️ Supabase não configurado — preencha <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> e{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> no arquivo{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code>.
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">

            {ehCadastro ? (
              <>
                {/* ── Responsável ── */}
                <Divisor label="Responsável pela loja" />

                <Campo label="Seu nome completo" obrigatorio erro={erros.nome}>
                  <InputBase
                    type="text"
                    value={form.nome}
                    onChange={(e) => set('nome', e.target.value)}
                    onBlur={(e) => { if (!e.target.value.trim()) setErros(er => ({ ...er, nome: 'Nome é obrigatório.' })); }}
                    placeholder="Ex: Rogério Mendes"
                    erro={erros.nome}
                    autoComplete="name"
                  />
                </Campo>

                {/* ── Dados da loja ── */}
                <Divisor label="Dados da loja" />

                <Campo label="Nome da loja" obrigatorio erro={erros.nomeLoja}>
                  <InputBase
                    type="text"
                    value={form.nomeLoja}
                    onChange={(e) => set('nomeLoja', e.target.value)}
                    onBlur={(e) => { if (!e.target.value.trim()) setErros(er => ({ ...er, nomeLoja: 'Nome da loja é obrigatório.' })); }}
                    placeholder="Ex: Auto Mendes"
                    erro={erros.nomeLoja}
                    autoComplete="organization"
                  />
                </Campo>

                <Campo label="CNPJ" obrigatorio erro={erros.cnpj}>
                  <InputBase
                    type="text"
                    value={form.cnpj}
                    onChange={(e) => set('cnpj', mascaraCnpj(e.target.value))}
                    onBlur={(e) => validarCampo('cnpj', e.target.value)}
                    placeholder="00.000.000/0001-00"
                    erro={erros.cnpj}
                    inputMode="text"
                  />
                </Campo>

                {/* ── Contato ── */}
                <Divisor label="Contato" />

                <Campo label="E-mail" obrigatorio erro={erros.email}>
                  <InputBase
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    onBlur={(e) => validarCampo('email', e.target.value)}
                    placeholder="voce@email.com"
                    erro={erros.email}
                    autoComplete="email"
                  />
                </Campo>

                <Campo label="Celular" obrigatorio erro={erros.celular} dica="Formato: (DD) NNNNN-NNNN">
                  <InputBase
                    type="tel"
                    value={form.celular}
                    onChange={(e) => set('celular', mascaraCelular(e.target.value))}
                    onBlur={(e) => validarCampo('celular', e.target.value)}
                    placeholder="(11) 99999-9999"
                    erro={erros.celular}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </Campo>

                {/* ── Acesso ── */}
                <Divisor label="Acesso" />

                <SenhaInput
                  label="Senha"
                  obrigatorio
                  value={form.senha}
                  onChange={(e) => set('senha', e.target.value)}
                  onBlur={(e) => validarCampo('senha', e.target.value)}
                  erro={erros.senha}
                  autoComplete="new-password"
                />

                {form.senha.length > 0 && <SenhaChecklist check={senhaCheck} />}

                <SenhaInput
                  label="Confirmar senha"
                  obrigatorio
                  value={form.confirmarSenha}
                  onChange={(e) => set('confirmarSenha', e.target.value)}
                  onBlur={(e) => validarCampo('confirmarSenha', e.target.value)}
                  erro={erros.confirmarSenha}
                  autoComplete="new-password"
                />

                {/* ── Endereço ── */}
                <Divisor label="Endereço da loja" />

                <Campo label="CEP" obrigatorio erro={erros.cep || erroCep}>
                  <div className="relative">
                    <InputBase
                      type="text"
                      value={form.cep}
                      onChange={(e) => onCepChange(e.target.value)}
                      onBlur={(e) => validarCampo('cep', e.target.value)}
                      placeholder="00000-000"
                      erro={erros.cep || erroCep}
                      inputMode="numeric"
                      className="w-full"
                    />
                    {buscandoCep && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted animate-pulse">
                        Buscando…
                      </span>
                    )}
                  </div>
                </Campo>

                <Campo label="Logradouro" obrigatorio erro={erros.logradouro}>
                  <InputBase
                    type="text"
                    value={form.logradouro}
                    onChange={(e) => set('logradouro', e.target.value)}
                    placeholder="Rua, Avenida, etc."
                    erro={erros.logradouro}
                    autoComplete="street-address"
                  />
                </Campo>

                <Campo label="Bairro" obrigatorio erro={erros.bairro}>
                  <InputBase
                    type="text"
                    value={form.bairro}
                    onChange={(e) => set('bairro', e.target.value)}
                    placeholder="Bairro"
                    erro={erros.bairro}
                  />
                </Campo>

                <Campo label="Cidade" obrigatorio erro={erros.cidade}>
                  <InputBase
                    type="text"
                    value={form.cidade}
                    onChange={(e) => set('cidade', e.target.value)}
                    placeholder="Cidade"
                    erro={erros.cidade}
                    autoComplete="address-level2"
                  />
                </Campo>

                <Campo label="UF" obrigatorio erro={erros.uf}>
                  <InputBase
                    type="text"
                    value={form.uf}
                    onChange={(e) => set('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                    placeholder="SP"
                    erro={erros.uf}
                    maxLength={2}
                    autoComplete="address-level1"
                    className="uppercase"
                  />
                </Campo>

                {/* ── LGPD ── */}
                <div className="pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.aceitaLgpd}
                      onChange={(e) => set('aceitaLgpd', e.target.checked)}
                      className="mt-0.5 accent-blue-600 w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-[12px] text-muted leading-relaxed">
                      Li e aceito a{' '}
                      <a href="#" className="text-blue underline hover:text-blue-hover">
                        Política de Privacidade
                      </a>{' '}
                      e os{' '}
                      <a href="#" className="text-blue underline hover:text-blue-hover">
                        Termos de Uso
                      </a>{' '}
                      em conformidade com a LGPD.
                    </span>
                  </label>
                  {erros.aceitaLgpd && (
                    <span role="alert" className="block mt-1 text-[11px] text-red-500 ml-6.5">
                      {erros.aceitaLgpd}
                    </span>
                  )}
                </div>
              </>
            ) : ehRecuperar ? (
              /* ── RECUPERAR SENHA ── */
              <>
                {recuperacaoOk ? (
                  <div role="status" className="text-[12.5px] text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 leading-relaxed">
                    E-mail enviado! Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                  </div>
                ) : (
                  <Campo label="E-mail" obrigatorio erro={erroRec}>
                    <InputBase
                      type="email"
                      value={emailRec}
                      onChange={(e) => { setEmailRec(e.target.value); setErroRec(''); }}
                      placeholder="voce@email.com"
                      erro={erroRec}
                      autoComplete="email"
                      autoFocus
                    />
                  </Campo>
                )}
              </>
            ) : (
              /* ── LOGIN ── */
              <>
                <Campo label="E-mail" obrigatorio erro={erros.email}>
                  <InputBase
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="voce@email.com"
                    erro={erros.email}
                    autoComplete="email"
                  />
                </Campo>

                <SenhaInput
                  label="Senha"
                  obrigatorio
                  value={form.senha}
                  onChange={(e) => set('senha', e.target.value)}
                  erro={erros.senha}
                  autoComplete="current-password"
                />

                <div className="text-right -mt-1">
                  <button
                    type="button"
                    className="text-[12px] text-blue hover:underline"
                    onClick={() => trocarModo('recuperar')}
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </>
            )}

            {/* Erro geral */}
            {erroGeral && (
              <div role="alert" className="text-[12.5px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-relaxed">
                {erroGeral}
              </div>
            )}

            {/* Aviso de sucesso */}
            {aviso && (
              <div role="status" className="text-[12.5px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 leading-relaxed">
                {aviso}
              </div>
            )}

            {/* CTA */}
            <button
              type="submit"
              disabled={enviando || enviandoRec || (ehRecuperar && recuperacaoOk)}
              className="mt-1 w-full bg-blue hover:bg-blue-hover disabled:opacity-60 text-white font-semibold text-[14px] py-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue focus:ring-offset-2"
            >
              {enviando || enviandoRec
                ? 'Aguarde…'
                : ehCadastro
                ? 'Criar loja e entrar'
                : ehRecuperar
                ? (recuperacaoOk ? 'E-mail enviado ✓' : 'Enviar link de redefinição')
                : 'Entrar'}
            </button>
          </form>

          {/* Alternar modo */}
          <div className="mt-5 text-center text-[13px] text-muted border-t border-border pt-4">
            {ehCadastro ? 'Já tem uma conta?' : ehRecuperar ? 'Lembrou a senha?' : 'Ainda não tem conta?'}{' '}
            <button
              type="button"
              onClick={() => trocarModo(ehCadastro || ehRecuperar ? 'entrar' : 'cadastrar')}
              className="text-blue font-semibold hover:underline"
            >
              {ehCadastro ? 'Entrar' : ehRecuperar ? 'Voltar ao login' : 'Criar loja'}
            </button>
          </div>
        </div>

        {/* Rodapé */}
        <p className="mt-4 text-center text-[11.5px] text-muted">
          © {new Date().getFullYear()} Financia+. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}
