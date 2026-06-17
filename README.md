# Financia+ Gestão

SaaS multi-loja de gestão para lojas de carros usados.
Stack: **React + Vite + Tailwind** (front) · **Supabase** — Postgres + Auth + RLS (back).

> Status: **MVP completo** — todas as fases construídas (Fundação → Estoque → Preparação → Financeiro → CRM → Contratos). Falta o usuário plugar o Supabase para sair do modo demonstração e publicar.

## Modo demonstração

Enquanto o `.env.local` não estiver preenchido, o app entra em **modo demonstração**:
libera o acesso sem login com uma "Loja Demonstração" e dados de exemplo, para a
interface ser navegável. Os dados de demo **não persistem** (recarregar volta ao
início). Assim que as chaves do Supabase forem configuradas, o app passa a usar os
dados reais da loja com login e isolamento por RLS.

---

## Rodar localmente

Pré-requisito: Node.js (instalado via nvm). A versão está pinada em `.nvmrc`.

```bash
nvm use              # usa a versão do .nvmrc (instale com: nvm install)
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
4. No Supabase, abra **SQL Editor**. Atalho: cole o arquivo único
   **`supabase/setup.sql`** (já tem todas as fases na ordem) e rode de uma vez.
   Se preferir por partes, rode **na ordem** as migrations de `supabase/migrations/`:
   - `0000_fase0_fundacao.sql` — lojas, usuarios, `loja_do_usuario()`, trigger de cadastro, RLS
   - `0001_fase1_estoque.sql` — veiculos, vendas
   - `0002_fase2_preparacao.sql` — preparacao_gastos
   - `0003_fase3_financeiro.sql` — despesas
   - `0004_fase4_crm.sql` — leads
   - `0005_fase5_contratos.sql` — loja_config, documentos
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

## Fases

Fundação ✅ → Estoque ✅ → Preparação ✅ → Financeiro ✅ → CRM ✅ → Contratos ✅ → Deploy.

## Publicar (deploy)

Front estático (Vite). Sugestão: **Vercel** ou **Netlify** (grátis).

1. Suba o repositório no GitHub.
2. Importe no Vercel/Netlify; build command `npm run build`, output `dist`.
3. Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   no painel do provedor (as mesmas do `.env.local`).

## Depois do MVP (próximos passos sugeridos pelo guia)

- Fotos de carro via **Supabase Storage** (com policies por loja).
- Cobrança da assinatura via **Asaas** (Pix/boleto/cartão + NF-e).
- Salvar o PDF dos contratos no Storage (hoje o PDF é gerado e baixado no navegador).
- Trilhas à parte: financiamento multibanco e IA de WhatsApp.
