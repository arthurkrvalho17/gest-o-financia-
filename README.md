# Financia+ Gestão

SaaS multi-loja de gestão para lojas de carros usados.
Stack: **React + Vite + Tailwind** (front) · **Supabase** — Postgres + Auth + RLS (back).

> Status: **Fase 0 — Fundação** concluída (login + cadastro de loja + isolamento por loja via RLS + layout base com os módulos). Os módulos (Estoque, Preparação, CRM, Financeiro, Contratos) são telas vazias até serem construídos nas fases seguintes.

---

## Rodar localmente

Pré-requisito: Node.js (instalado via nvm).

```bash
nvm use default      # ou: nvm install --lts
npm install
npm run dev          # http://localhost:5173
```

## Configurar o Supabase (necessário para login funcionar)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, copie o `Project URL` e a `anon public key`.
3. Crie o arquivo `.env.local` (copie de `.env.local.example`) e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-public-key
   ```
4. No Supabase, abra **SQL Editor** e rode o conteúdo de
   `supabase/migrations/0000_fase0_fundacao.sql` (cria as tabelas `lojas` e
   `usuarios`, a função `loja_do_usuario()`, o trigger de cadastro e as policies de RLS).
5. **Para testar rápido:** em **Authentication → Providers → Email**, desligue
   *"Confirm email"* (assim o cadastro já entra direto, sem confirmação por e-mail).
6. Reinicie o `npm run dev`.

> ⚠️ **Segurança:** só a `anon key` entra no front. A `service_role key` **nunca**
> sai do servidor. O arquivo `.env.local` está no `.gitignore`.

## Como testar a Fase 0 (o teste mais importante)

Crie **duas contas** (duas lojas). Logado na loja A, você não pode ver nada da
loja B. Esse isolamento é garantido pelo RLS no Postgres — cada tabela filtra por
`loja_id = loja_do_usuario()`.

---

## Estrutura

```
src/
├─ lib/supabase.js          # cliente Supabase (lê .env.local)
├─ auth/
│  ├─ AuthContext.jsx       # sessão + usuário + loja
│  └─ Login.jsx             # login e cadastro de loja
├─ components/              # Sidebar, Layout, Topbar, Placeholder, ícones
├─ modules/                 # estoque, preparacao, crm, financeiro, contratos
└─ App.jsx                  # rotas (login vs. app logado)
supabase/migrations/        # SQL de cada fase
```

## Próximas fases

Fundação ✅ → Estoque → Preparação → Financeiro → CRM → Contratos → Deploy.
Uma fase por vez; testar o isolamento entre lojas; versionar a cada fase.
