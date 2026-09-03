# Guia de Integrações — Financia+ Gestão

Documento de referência para colocar cada sistema externo em produção.
Cada seção indica o **status atual**, os **pré-requisitos externos** (contas, aprovações)
e os **passos técnicos** exatos no código e no Supabase.

---

## Índice

1. [Supabase (banco + auth + storage)](#1-supabase)
2. [OLX Autoupload](#2-olx-autoupload)
3. [Mercado Livre Anúncios](#3-mercado-livre-anúncios)
4. [Webmotors](#4-webmotors)
5. [Instagram Graph API](#5-instagram-graph-api)
6. [Agregador multi-portais](#6-agregador-multi-portais)
7. [WhatsApp Business Cloud API](#7-whatsapp-business-cloud-api)
8. [Asaas (cobrança / planos)](#8-asaas-cobrança--planos)
9. [Spedy (emissão de NF-e)](#9-spedy-emissão-de-nf-e)

---

## 1. Supabase

**Status:** ✅ Banco, auth e storage configurados. Edge Function OLX pendente de deploy.

### Feito
- `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- Migrations 0000–0014 aplicadas (tabelas + buckets de Storage + RLS)
- Auth com trigger `handle_new_user()` criando loja automaticamente no cadastro

### Pendente

#### 1.0 Migrations da integração OLX

Aplicar `0020_olx_publicacao_processando.sql` (status `processando` + token de
importação) e `0021_oauth_state.sql` (nonce do OAuth) — obrigatórias para o fluxo OLX.

#### 1.1 Deploy das Edge Functions OLX (obrigatório para OAuth e publicação OLX)

```bash
# Instalar Supabase CLI se não tiver
npm install -g supabase

# Login e link ao projeto
supabase login
supabase link --project-ref anoinhfivybufjmphmks

# Deploy das funções
# --no-verify-jwt é OBRIGATÓRIO no callback: o redirect da OLX chega sem token
# Supabase; sem a flag, o gateway devolve 401 antes do nosso código rodar.
supabase functions deploy olx-oauth-callback --no-verify-jwt
# olx-api é chamada pelo app com o JWT do usuário logado — SEM a flag
supabase functions deploy olx-api

# Configurar secrets (executar um por vez)
supabase secrets set OLX_CLIENT_ID=<id_fornecido_pela_olx>
supabase secrets set OLX_CLIENT_SECRET=<secret_fornecido_pela_olx>
supabase secrets set OLX_REDIRECT_URI=https://anoinhfivybufjmphmks.supabase.co/functions/v1/olx-oauth-callback
supabase secrets set FRONTEND_URL=https://<seu-dominio>.com.br
```

Arquivo: `supabase/functions/olx-oauth-callback/index.ts` (já criado)

#### 1.2 Configurar redirect URLs de auth (Supabase Dashboard)

Em **Authentication → URL Configuration**:
- Site URL: `https://<seu-dominio>.com.br`
- Redirect URLs: adicionar `https://<seu-dominio>.com.br/**`

#### 1.3 Opcional: configurar SMTP para e-mails de convite/redefinição

Em **Authentication → Email Templates**, conectar provedor SMTP próprio
(SendGrid, Resend, Amazon SES) para e-mails de convite de vendedores e recuperação de senha.

---

## 2. OLX Autoupload

**Status:** ✅ Conector implementado contra a doc atual (import + Catálogo de Autos +
consulta de status + OAuth com nonce), com testes unitários (`npm test`).
⏳ Aguarda credenciais da OLX e deploy das Edge Functions — a ligação real é só
configurar secrets.

### Arquivos
| Arquivo | Função |
|---|---|
| `src/integracoes/olx/conectorOlx.js` | Adapter (publicar / atualizar / despublicar / consultarStatus) via Edge Function; validação antecipada (telefone, CEP, fotos, preço, descrição, placa) e tradução dos erros da OLX |
| `src/integracoes/olx/mapearCamposOlx.js` | Anúncio canônico → `params` (objeto com códigos string da doc sub_auto) |
| `src/integracoes/olx/catalogoAutos.js` | Resolve marca/modelo/versão do cadastro para os IDs do Catálogo de Autos (matching tolerante; bloqueia com mensagem clara quando não encontra) |
| `src/integracoes/olx/useOlxAuth.js` | Hook React do fluxo OAuth (state = nonce de uso único em `oauth_state`) |
| `src/integracoes/olx/conectorOlx.test.js` | Testes (vitest) com a Edge Function mockada — nada bate na OLX |
| `supabase/functions/olx-api/index.ts` | Proxy autenticado (padrão `ml-api`): import, catálogo (cache 24h), status da importação e listagem de publicados — o access_token da loja NUNCA passa pelo browser |
| `supabase/functions/olx-oauth-callback/index.ts` | Callback OAuth: valida o nonce, troca code → token server-side, salva em `canal_credencial` |
| `supabase/migrations/0020_olx_publicacao_processando.sql` | `anuncio_publicacao.token_importacao` + status `processando` |
| `supabase/migrations/0021_oauth_state.sql` | Tabela `oauth_state` (nonce de uso único, expira em 10 min) |

### Pré-requisitos externos

1. Enviar e-mail para **suporteintegrador@olxbr.com** solicitando acesso à API Autoupload.
   Informar: nome da empresa, CNPJ, URL do sistema, volume estimado de anúncios/mês.
2. Após aprovação, receber `client_id` e `client_secret`.
3. Informar à OLX a Redirect URI:
   `https://anoinhfivybufjmphmks.supabase.co/functions/v1/olx-oauth-callback`
4. **A conta OLX de cada loja precisa do plano Empresa** (profissional PJ). Planos de
   vendedor autônomo (Essencial/Plus) **não incluem** integração via API — o import
   devolve statusCode `-6`.

### Passos técnicos (quando as credenciais chegarem)

```bash
# 1. Adicionar client_id no .env.local (client_secret só vai nos secrets do Supabase)
echo "VITE_OLX_CLIENT_ID=<client_id_recebido>" >> .env.local

# 2. Migrations novas (0020 e 0021) no SQL Editor ou via CLI

# 3. Deploy das Edge Functions:
# o callback recebe o redirect da OLX SEM token Supabase → --no-verify-jwt obrigatório
supabase functions deploy olx-oauth-callback --no-verify-jwt
# olx-api é chamada pelo app com o JWT do usuário logado — SEM a flag
supabase functions deploy olx-api

# 4. Secrets (olx-api não precisa de secret próprio)
supabase secrets set OLX_CLIENT_ID=<client_id>
supabase secrets set OLX_CLIENT_SECRET=<client_secret>
supabase secrets set OLX_REDIRECT_URI=https://anoinhfivybufjmphmks.supabase.co/functions/v1/olx-oauth-callback
supabase secrets set FRONTEND_URL=https://<seu-dominio>.com.br
```

### Fluxo de conexão (usuário final)

1. **Configurações → Conexões → OLX → Conectar**
2. O app grava um **nonce** em `oauth_state` (10 min, uso único) e redireciona para
   `https://auth.olx.com.br/oauth` com `state=<nonce>`
3. Usuário aprova → OLX redireciona para a Edge Function com `?code=...&state=...`
4. Callback resolve nonce → loja, troca code por `access_token` e salva em `canal_credencial`
5. App redireciona para `/configuracoes?olx=conectado`

### Fluxo de publicação (como funciona de verdade)

1. Validações locais bloqueiam ANTES da API o que a OLX rejeitaria de forma genérica:
   telefone da loja (10–11 dígitos), CEP, ≥1 foto (dedup, máx 20), preço inteiro > 0,
   descrição 2–6000, placa, e marca/modelo/versão resolvidos no **Catálogo de Autos**
   (consulta autenticada via `olx-api`, cache de 24h).
2. `PUT /autoupload/import` devolve `statusCode 0` + **token**: isso NÃO é publicação —
   é aceite na validação síncrona; a moderação é **assíncrona**. A publicação fica
   `processando` e o token (validade 7 dias) vai para `anuncio_publicacao.token_importacao`.
3. `consultarStatus` (modal Publicar/status → "Atualizar", e reconsulta ao abrir) usa
   `POST /autoupload/import/{token}`; quando `accepted`, o status vira `publicado` e o
   `link_externo` REAL (URL devolvida pela OLX) é gravado. Se o token expirou, cai para
   `GET /autoupload/v1/published`.

### Limitações conhecidas

- `access_token` OLX **não tem refresh token nem expires_in** — expira após ~12h.
  **Não existe renovação automática** (não foi implementada de propósito — a API não
  oferece): quando a OLX recusa a autenticação, `canal_credencial.status` vira
  `expirado` e a UI (Conexões e Publicar/status) pede reconexão.
- `vehicle_brand` / `vehicle_model` / `vehicle_version` são **obrigatórios** e precisam
  bater com o Catálogo de Autos; para a categoria 2020 a OLX **sobrescreve o Subject**
  com o valor do catálogo.
- Payload máximo de 1MB por import (validado na Edge Function).
- As fotos são baixadas pela OLX via URL: saem como URL assinada de 30 dias (ADR-18).

---

## 3. Mercado Livre Anúncios

**Status:** ✅ Conector implementado. ⏳ Aguarda credenciais do app ML e deploy das Edge Functions.

### Arquivos já criados
| Arquivo | Função |
|---|---|
| `src/integracoes/mercado_livre/conectorML.js` | Adapter (publicar / atualizar / despublicar / status) |
| `src/integracoes/mercado_livre/mapearCamposML.js` | Anúncio canônico → item ML (marca inferida do modelo) |
| `src/integracoes/mercado_livre/useMLAuth.js` | Hook React para o fluxo OAuth |
| `supabase/functions/ml-oauth-callback/index.ts` | Callback OAuth (code → access + refresh token) |
| `supabase/functions/ml-api/index.ts` | Proxy autenticado com renovação automática de token (6h) |
| `supabase/functions/ml-webhook/index.ts` | Notificações: VIS Leads → CRM, items → status da publicação |
| `supabase/functions/_shared/mlToken.ts` | Helper de renovação de token (compartilhado ml-api/ml-webhook) |
| `supabase/migrations/0015_integracao_eventos.sql` | Tabela integracao_evento (eventos brutos de webhook) |

### Configuração de notificações (painel do app ML)

- **URL de retornos de chamada:** `https://anoinhfivybufjmphmks.supabase.co/functions/v1/ml-webhook`
- **Tópicos:** marcar `items` (sincroniza status dos anúncios), `VIS Leads`
  (interessados caem como leads no CRM) e `messages` (guardado para o inbox futuro).
- Requer a migration 0015 aplicada.

### Deploy (quando tiver as credenciais)

```bash
# Callbacks/webhooks chegam SEM token Supabase → --no-verify-jwt obrigatório.
# ml-api NÃO leva a flag: ele é chamado pelo app com o JWT do usuário logado.
supabase functions deploy ml-oauth-callback --no-verify-jwt
supabase functions deploy ml-webhook --no-verify-jwt
supabase functions deploy ml-api
supabase secrets set ML_CLIENT_ID=<app_id>
supabase secrets set ML_CLIENT_SECRET=<secret_key>
supabase secrets set ML_REDIRECT_URI=https://anoinhfivybufjmphmks.supabase.co/functions/v1/ml-oauth-callback
# Para onde o ml-oauth-callback redireciona o navegador no fim do fluxo.
# Sem este secret ele cai no default http://localhost:5173 e o usuario de
# producao termina o OAuth numa pagina que nao existe.
supabase secrets set FRONTEND_URL=<url do app em producao>
echo "VITE_ML_APP_ID=<app_id>" >> .env.local

# ml-webhook aceita qualquer POST sem isso (o ML não assina o payload).
# Gere um valor aleatório, registre-o na notification URL do devcenter ML
# (…/ml-webhook?token=<mesmo valor>) e só então configure o secret:
supabase secrets set ML_WEBHOOK_TOKEN=<valor aleatório>
```

### Pré-requisitos externos

1. Criar conta em **developers.mercadolivre.com.br**
2. Criar aplicativo → obter `APP_ID` e `SECRET_KEY`
3. Definir Redirect URI no painel ML:
   `https://anoinhfivybufjmphmks.supabase.co/functions/v1/ml-oauth-callback`
4. Solicitar permissão `write:items` no app

### Passos técnicos

#### 3.1 Edge Function de callback OAuth (criar)

```
supabase/functions/ml-oauth-callback/index.ts
```

Seguir o mesmo padrão de `olx-oauth-callback`:
- Recebe `?code=` e `?state=` (state = **nonce de uso unico** resolvido em `oauth_state` — ver `src/integracoes/oauthState.js`; o `btoa(JSON)` anterior era forjavel)
- POST para `https://api.mercadolibre.com/oauth/token` com grant_type `authorization_code`
- Salva `{ access_token, refresh_token, expires_in }` em `canal_credencial`
- **Diferença do OLX:** ML retorna `refresh_token` — salvar junto e renovar automaticamente

#### 3.2 Implementar hook `useMLAuth.js`

Seguir o mesmo padrão de `useOlxAuth.js`. Rota de auth ML:
`https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=...&redirect_uri=...&state=...`

#### 3.3 `conectorML.js` — feito, validado contra a API real

`src/integracoes/mercado_livre/conectorML.js` já implementa os 4 métodos do adapter:
- `POST https://api.mercadolibre.com/items` — publicar
- `PUT https://api.mercadolibre.com/items/{id}` — atualizar (preço/fotos; título não é editável em classificados com visitas)
- `PUT https://api.mercadolibre.com/items/{id}/status` com body `{ status: "closed" }` — despublicar
- `GET https://api.mercadolibre.com/items/{id}` — status

`category_id` fixo em `MLB1744` (Carros e Caminhonetes) — única categoria de veículos usados no
Brasil, `buying_mode: 'classified'` (é o único modo que a categoria aceita).

**Validação de atributos obrigatórios (`validarAnuncioML`, em `mapearCamposML.js`)** — no mesmo
espírito do `conectorOlx.js`: conferida ao vivo em 30/08/2026 via
`GET /categories/MLB1744/attributes`. Os 8 atributos `required=true` da categoria são
`BRAND, MODEL, VEHICLE_TYPE, VEHICLE_YEAR, FUEL_TYPE, KILOMETERS, TRIM, DOORS` — a tabela
completa (atributo × preenchido × origem) está no README, seção 8. `TRIM` (versão) e `DOORS`
(portas) não tinham NENHUMA origem no cadastro até a migration `0023`: toda tentativa de
publicar um veículo no ML falhava, sempre, nessa validação. Corrigido adicionando `versao`/
`portas` em `veiculos` (`0023`), no formulário (`AddVeiculoModal.jsx`) e no anúncio canônico
(`anuncioCanonico.js`).

#### 3.4 Registrar no registry

```js
// src/integracoes/conectores.js
import { conectorMercadoLivre } from './mercado_livre/conectorMercadoLivre';
// ...
const registry = {
  mercado_livre: conectorMercadoLivre, // substituir mock
  olx: conectorOlx,
  // ...
};
```

#### 3.5 Secrets

> Os nomes abaixo sao os que o codigo LE de fato (`Deno.env.get`). Uma versao
> anterior desta secao dizia `ML_APP_ID` / `ML_SECRET_KEY` — nomes que nenhuma
> function consulta. Setados assim, o OAuth falha na troca do code por token,
> sem mensagem obvia.

```bash
supabase secrets set ML_CLIENT_ID=<app_id>
supabase secrets set ML_CLIENT_SECRET=<secret_key>
supabase secrets set ML_REDIRECT_URI=https://anoinhfivybufjmphmks.supabase.co/functions/v1/ml-oauth-callback
supabase secrets set FRONTEND_URL=<url do app>   # para onde o callback redireciona
echo "VITE_ML_APP_ID=<app_id>" >> .env.local
```

---

## 4. Webmotors

**Status:** ✅ Conector implementado. ⏳ Aguarda cadastro do app no portal Sensedia e homologação
(paths/payloads do swagger são liberados só na área logada — confirmar o mapeamento na homologação).

### Arquivos já criados
| Arquivo | Função |
|---|---|
| `src/integracoes/webmotors/conectorWebmotors.js` | Adapter (publicar / atualizar / despublicar / status) via Edge Function |
| `src/integracoes/webmotors/mapearCamposWebmotors.js` | Anúncio canônico → payload Webmotors (ajustar na homologação) |
| `src/integracoes/webmotors/useWebmotorsAuth.js` | Conexão por credencial (usuário Integrador de API da loja) |
| `supabase/functions/webmotors-api/index.ts` | Proxy autenticado: token do gateway Sensedia (client_credentials, cache) |
| `supabase/functions/webmotors-webhook/index.ts` | Callbacks Leads/Estoque → integracao_evento (+ lead no CRM quando possível) |

### Modelo de autenticação (dois níveis)

1. **App Financia+** (nosso): `client_id`/`client_secret` obtidos ao registrar o aplicativo no
   portal do desenvolvedor (menu **APPs** em portal-webmotors.sensedia.com). Só vivem nos
   secrets do Supabase; a Edge Function troca por `access_token` do gateway (client_credentials).
2. **Loja** (cada cliente): usuário com perfil **"Integrador de API"** — a loja cria no próprio
   Cockpit Webmotors (**Usuários → Novo usuário → perfil Integrador de API**; 1 por loja) e
   digita usuário/senha em **Configurações → Conexões → Webmotors → Conectar**. Fica em
   `canal_credencial` (canal `webmotors`).

### Pré-requisitos externos

1. Registrar-se em **portal-webmotors.sensedia.com** e registrar o aplicativo (menu APPs)
   → `client_id` e `client_secret`
2. Solicitar acesso às APIs e homologar (estimativa: 2–4 semanas)
3. Cada loja cria o usuário Integrador de API no Cockpit dela

### Cadastro do app no portal (formulário APPs)

| Campo | Valor |
|---|---|
| Nome da sua aplicação | `Financia+ Gestão` |
| Link para sua app | URL pública do app quando houver deploy (campo sem `*` — pode ficar em branco até lá) |
| Descrição (≤200) | `Sistema de gestão para lojas de veículos usados: estoque, CRM, financeiro e contratos. Publica e atualiza os anúncios do estoque de cada loja na Webmotors e recebe os leads no CRM da loja.` |
| Callback URL Leads | `https://anoinhfivybufjmphmks.supabase.co/functions/v1/webmotors-webhook?topico=leads` |
| Callback URL Estoque | `https://anoinhfivybufjmphmks.supabase.co/functions/v1/webmotors-webhook?topico=estoque` |
| CNPJ | o CNPJ da **empresa dona do app** (Financia+), não o das lojas |

**APIs a solicitar** (das listadas no portal):
- **Webmotors Estoque Canais API** — integração de estoque (publicar/sincronizar anúncios). É a
  candidata principal para o fluxo de publicação; confirmar com o atendimento se é ela que cobre
  o papel de "gestor de estoque terceiro" publicando no portal.
- **Webmotors Catalogo API** — IDs oficiais de marca/modelo/versão (necessários no payload do
  anúncio; alimenta `mapearCamposWebmotors.js`).
- **Webmotors Leads API** — consulta/recebimento de leads → CRM do Financia+.

**Não solicitar** (direção oposta ao nosso caso): *Inserção de Leads* (empurra leads PARA o CRM
Webmotors — o nosso CRM é o destino), *API Site* e *API Marketplace* (levam o estoque do Cockpit
para o site do lojista — não é o nosso fluxo).

O webhook (`supabase/functions/webmotors-webhook/index.ts`) responde 200 imediato e guarda o
evento bruto em `integracao_evento` (canal `webmotors`, tópico da query string); leads viram
card no CRM quando o payload permite. Requer a migration 0015 aplicada.

### Deploy (quando tiver as credenciais)

```bash
# webmotors-api é chamada pelo app com o JWT do usuário logado — SEM --no-verify-jwt
supabase functions deploy webmotors-api
# o webhook recebe callbacks da Webmotors SEM token Supabase → flag obrigatória
supabase functions deploy webmotors-webhook --no-verify-jwt
supabase secrets set WEBMOTORS_CLIENT_ID=<client_id>
supabase secrets set WEBMOTORS_CLIENT_SECRET=<client_secret>
# opcional, durante a homologação (URL de teste fornecida pela Sensedia):
supabase secrets set WEBMOTORS_API_URL=<base_url_homologacao>

# webmotors-webhook aceita qualquer POST sem isso. Gere um valor aleatório,
# acrescente &token=<mesmo valor> nas duas Callback URLs do Cockpit e só
# então configure o secret:
supabase secrets set WEBMOTORS_WEBHOOK_TOKEN=<valor aleatório>
```

### Testar em localhost

Webmotors **não tem redirect OAuth** — a conexão é um formulário — então não há URL de
callback para registrar e o fluxo inteiro funciona com o front em `http://localhost:5173`
falando com o Supabase remoto (a função tem CORS liberado). Três pontos práticos:

- **Front local + função deployada (recomendado):** `npm run dev` e pronto; o
  `supabase.functions.invoke` sempre chama `{VITE_SUPABASE_URL}/functions/v1/webmotors-api`.
- **Apontar para o sandbox Sensedia:** troque só o secret
  (`supabase secrets set WEBMOTORS_API_URL=<url_homologacao>`) — nada muda no front.
- **Função rodando local (sem deploy):** `supabase functions serve webmotors-api
  --env-file supabase/functions/.env.local` (arquivo com os WEBMOTORS_*; está no .gitignore).
  Sobe em `http://127.0.0.1:54321/functions/v1/webmotors-api` — teste direto com curl, ou
  aponte o app para o stack local (`supabase start` + `VITE_SUPABASE_URL=http://127.0.0.1:54321`,
  que exige o banco local com as migrations aplicadas).

(Nos canais com OAuth — OLX/ML — o teste em localhost pede também
`supabase secrets set FRONTEND_URL=http://localhost:5173`, para o callback devolver o
navegador ao app local; a Redirect URI registrada no portal continua sendo a da Edge Function.)

### Pós-homologação (checklist)

- Confirmar no swagger da área logada: paths de estoque (constante `PATHS` no conector),
  path do token (`WEBMOTORS_TOKEN_URL`), nomes dos campos (`mapearCamposWebmotors.js`)
  e onde vai a credencial do Integrador (body vs. header).
- Estreitar `PREFIXOS_PERMITIDOS` na Edge Function para os paths exatos.

---

## 5. Instagram Graph API

**Status:** 🔴 Mock. Exige aprovação Meta — pode levar 2–4 semanas.

### Pré-requisitos externos

1. **Conta Business no Meta Business Suite** (necessário para API)
2. **Instagram Business Account** vinculada a uma Página do Facebook
3. Criar app em **developers.facebook.com**:
   - Produto: **Instagram Graph API**
   - Permissões necessárias: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
4. Submeter o app para **App Review** (obrigatório para as permissões acima)
5. Após aprovação, usuário conecta via Facebook Login + Instagram

### O que a integração faz

Publica posts de veículo como **carrossel de fotos** no feed do Instagram Business da loja.
Não é "Marketplace do Instagram" — é publicação orgânica no feed via API.

### Passos técnicos

```
supabase/functions/instagram-oauth-callback/index.ts
src/integracoes/instagram/conectorInstagram.js
```

Endpoint de publicação:
```
POST https://graph.facebook.com/v19.0/{ig-user-id}/media
  → cria cada imagem do carrossel (retorna creation_id)
POST https://graph.facebook.com/v19.0/{ig-user-id}/media
  → cria container de carrossel com todos os creation_ids
POST https://graph.facebook.com/v19.0/{ig-user-id}/media_publish
  → publica o carrossel
```

---

## 6. Agregador multi-portais

**Status:** 🟡 Mock. Depende do fornecedor escolhido.

### O que é

Um agregador (ex: **iCarros/Publicar**, **AutoBid**, **Dealer.com**) é uma API que publica
simultaneamente em Webmotors, ML, OLX, iCarros e outros com uma única chamada.
No sistema, é "só mais um conector" — substitui o mock em `registry.agregador`.

### Passo técnico

Escolher fornecedor → implementar `conectorAgregador.js` seguindo a interface:

```js
// src/integracoes/agregador/conectorAgregador.js
export const conectorAgregador = {
  canal: 'agregador',
  async publicar(anuncio) { /* chama API do agregador */ },
  async atualizar(anuncio, pub) { /* ... */ },
  async despublicar(pub) { /* ... */ },
  async consultarStatus(pub) { /* ... */ },
};
```

Registrar em `conectores.js`:

```js
import { conectorAgregador } from './agregador/conectorAgregador';
// registry.agregador = conectorAgregador;
```

---

## 7. WhatsApp Business Cloud API

**Status:** 🟡 Mock. Conector de mensageria não implementado.

### Pré-requisitos externos

Duas opções:

**Opção A — Meta direto (sem BSP)**
1. Meta Business Suite → criar app → produto **WhatsApp**
2. Número de telefone dedicado (não pode ser número pessoal existente)
3. Verificação de empresa no Meta
4. Permissão `whatsapp_business_messaging` (App Review)

**Opção B — via BSP (Business Solution Provider)**
Fornecedores como **Twilio**, **Zenvia**, **Gupshup** abstraem o processo de aprovação.
Mais rápido (1–3 dias), porém custo por mensagem mais alto.

### Passos técnicos

#### 7.1 Armazenar credenciais

A tabela `canal_credencial` já existe. Salvar via dashboard admin do Supabase:
```json
{
  "loja_id": "<uuid>",
  "canal": "whatsapp",
  "credenciais": {
    "access_token": "<token_permanente>",
    "phone_number_id": "<id_do_numero>",
    "waba_id": "<whatsapp_business_account_id>"
  },
  "status": "conectado"
}
```

#### 7.2 Implementar conector de mensageria

```
src/integracoes/whatsapp/conectorWhatsapp.js
```

```js
export const conectorWhatsapp = {
  canal: 'whatsapp',
  async enviar(conversa, texto, tipo = 'texto') {
    // Busca credenciais de canal_credencial
    // POST https://graph.facebook.com/v19.0/{phone_number_id}/messages
    // Header: Authorization: Bearer {access_token}
    // Body: { messaging_product: 'whatsapp', to: conversa.telefone, type: 'text', text: { body: texto } }
  },
};
```

#### 7.3 Registrar no registry de mensageria

```js
// src/integracoes/conectores.js
import { conectorWhatsapp } from './whatsapp/conectorWhatsapp';
const registryMensageria = { whatsapp: conectorWhatsapp }; // substituir mock
```

#### 7.4 Webhook para mensagens recebidas (CRM/Inbox)

Criar Edge Function para receber eventos Meta:

```
supabase/functions/whatsapp-webhook/index.ts
```

- Validar `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`
- Inserir mensagem em tabela de conversas (CRM)
- Configurar webhook URL no painel Meta: `https://anoinhfivybufjmphmks.supabase.co/functions/v1/whatsapp-webhook`

---

## 8. Asaas (cobrança / planos)

**Status:** 🔴 Não implementado. Referenciado nos comentários do código como provedor de cobrança futuro.

### O que faz no sistema

Gerencia as assinaturas das lojas (plano Gestão a R$149/mês + complementos).
A UI de "Assinatura / Plano" em Configurações já existe; os dados são estáticos hoje.

### Pré-requisitos externos

1. Criar conta em **asaas.com** (ambiente sandbox disponível)
2. Gerar API Key em **Configurações → Integrações → API Key**

### Passos técnicos

#### 8.1 Migração de banco

Criar migration `0015_planos.sql`:
```sql
create table loja_plano (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade unique,
  plano text not null default 'gestao',
  valor_mensal numeric not null,
  asaas_customer_id text,        -- ID do cliente no Asaas
  asaas_subscription_id text,    -- ID da assinatura no Asaas
  status text not null default 'ativo', -- ativo | inadimplente | cancelado
  proxima_cobranca date,
  forma_pagamento text,
  created_at timestamptz default now()
);
alter table loja_plano enable row level security;
create policy "loja_plano_acesso" on loja_plano
  using (loja_id = loja_do_usuario());
```

#### 8.2 Edge Functions de cobrança

```
supabase/functions/asaas-create-customer/index.ts   -- cria cliente no Asaas no cadastro da loja
supabase/functions/asaas-webhook/index.ts           -- recebe eventos de pagamento (paid, overdue, etc.)
```

O webhook Asaas atualiza `loja_plano.status` conforme pagamento.

#### 8.3 Variáveis de ambiente

```bash
supabase secrets set ASAAS_API_KEY=<api_key>
supabase secrets set ASAAS_WEBHOOK_TOKEN=<token_para_validar_webhook>
```

#### 8.4 Integrar em ConfiguracoesPage.jsx

Substituir `PLANO_DEMO` por dados reais de `loja_plano` (query Supabase).
Botão "Mudar de plano" → chamar Edge Function que atualiza a assinatura no Asaas.

---

## 9. Spedy (emissão de NF-e)

**Status:** ✅ Código implementado (migrations `0018`/`0019`, Edge Functions, UI em
Configurações). ⏳ Aguarda conta **Owner** da Spedy + configuração tributária confirmada com
contador antes de qualquer emissão real.

Diferente dos outros conectores: aqui **o Financia+ é a empresa Owner** — nenhuma loja cria conta
em portal nenhum. Ver ADR-17 no README para a decisão e o porquê.

### Arquivos já criados
| Arquivo | Função |
|---|---|
| `src/integracoes/spedy/useSpedyAuth.js` | Provisiona a sub-empresa da loja, envia certificado, salva `config_fiscal` |
| `supabase/functions/spedy-api/index.ts` | Proxy: `provisionar` (chave Owner) / `certificado` (chave Owner) / `emitir` e `consultar` (chave da sub-empresa) |
| `supabase/functions/spedy-webhook/index.ts` | Recebe `invoice.status_changed` e atualiza `nota_fiscal` |
| `supabase/migrations/0018_spedy_nfe.sql` | Campos fiscais em `lojas`, canal `spedy`, tabela `nota_fiscal` |
| `supabase/migrations/0019_spedy_config_fiscal.sql` | `loja_config.config_fiscal` (jsonb) |

### Pré-requisitos externos

1. Criar conta **Owner** na Spedy — comece pelo **sandbox gratuito** (Plano Desenvolvedor) em
   `sandbox-app.spedy.com.br`; migre para produção só depois de validar uma emissão de ponta a
   ponta.
2. Obter a chave de API da conta Owner: **Perfil → Minha Empresa → Credenciais da API**.
3. **Antes de registrar o webhook na Spedy**, gere um valor aleatório, registre a URL já com
   `?token=<mesmo valor>` e configure `supabase secrets set SPEDY_WEBHOOK_TOKEN=<valor aleatório>`
   — sem isso, `spedy-webhook` aceita qualquer POST (não há confirmação de que a Spedy assine o
   payload).
4. **Confirmar com o contador de cada loja** os códigos tributários de venda de veículo usado
   (CFOP `5502`/`6502`, CSOSN/CST do ICMS, redução de base, PIS/COFINS) — o sistema nunca assume
   esses valores sozinho; ver o formato de `config_fiscal` comentado na migration `0019`.
4. **DECISÃO EM ABERTO (Arthur) — responsável técnico da NF-e (infRespTec):** Financia+ assume
   responsável técnico (nossa marca no documento fiscal; exige autorização de uso/CSRT por SEFAZ
   estadual) **OU** deixa a Spedy assumir (CNPJ 47332178000101 — menos atrito). O código já lê o
   secret `SPEDY_TECHNICAL_RESPONSIBLE` (JSON `{ federalTaxNumber, contactName, email, phone }`)
   quando a action `configurar` roda; enquanto o secret não existir, nada é configurado e a Spedy
   assume por default. Atenção à regra da doc: reenviar o bloco `general` sem
   `technicalResponsible` REMOVE o responsável — o código preserva o campo em todo PUT de `general`.

### Ambientes (sandbox × produção)

O sandbox da Spedy é uma **conta separada** da de produção: exige um **novo cadastro**
em `sandbox-app.spedy.com.br` (Plano Desenvolvedor, gratuito). As chaves de API e o
cadastro de empresas de produção **não funcionam no sandbox, e vice-versa** — portanto
`SPEDY_OWNER_API_KEY` tem um valor **diferente por ambiente**, e os dois secrets
(`SPEDY_API_URL` + `SPEDY_OWNER_API_KEY`) devem ser trocados **sempre juntos**:

| Secret | Sandbox (testes) | Produção |
|---|---|---|
| `SPEDY_API_URL` | `https://sandbox-api.spedy.com.br/v1` | *(não setar — default)* `https://api.spedy.com.br/v1` |
| `SPEDY_OWNER_API_KEY` | chave Owner da **conta sandbox** | chave Owner da **conta de produção** |

> ⚠️ A validade fiscal da nota NÃO vem do sandbox em si, e sim do
> `productInvoice.environmentType` da empresa: é possível configurar `production`
> DENTRO do sandbox e emitir nota com validade fiscal REAL. A action `configurar`
> da `spedy-api` usa `development` (Homologação) como default no sandbox por isso.

### Deploy

```bash
# spedy-api é chamada pelo app com o JWT do usuário logado — SEM --no-verify-jwt
supabase functions deploy spedy-api
# o webhook recebe callbacks da Spedy SEM token Supabase → flag obrigatória
supabase functions deploy spedy-webhook --no-verify-jwt

# SANDBOX (testes) — os dois juntos, com a chave da conta sandbox:
supabase secrets set SPEDY_API_URL=https://sandbox-api.spedy.com.br/v1
supabase secrets set SPEDY_OWNER_API_KEY=<chave_owner_da_conta_SANDBOX>

# PRODUÇÃO — remova SPEDY_API_URL (cai no default) e use a chave de produção:
supabase secrets unset SPEDY_API_URL
supabase secrets set SPEDY_OWNER_API_KEY=<chave_owner_da_conta_de_PRODUCAO>
```

### Registro do webhook (ação única — escopo de conta, não por loja)

O webhook da Spedy é por **conta Owner**: registre uma vez só, recebe eventos de todas as lojas
(o payload identifica a loja pelo CNPJ em `data.company.federalTaxNumber`).

> ⚠️ A URL da API muda por ambiente e o bloco abaixo está no **sandbox**.
> Registrar na conta errada é erro silencioso: com a chave de produção no
> clipboard e este bloco na tela, o webhook vai parar em produção.

```bash
# SANDBOX — use este durante os testes
curl -X POST https://sandbox-api.spedy.com.br/v1/webhooks \
  -H "X-Api-Key: <chave_owner_da_conta_SANDBOX>" \
  -H "Content-Type: application/json" \
  -d '{"event":"invoice.status_changed","url":"https://anoinhfivybufjmphmks.supabase.co/functions/v1/spedy-webhook"}'

# PRODUÇÃO — só depois de validar a emissão de ponta a ponta no sandbox
# curl -X POST https://api.spedy.com.br/v1/webhooks \
#   -H "X-Api-Key: <chave_owner_da_conta_de_PRODUCAO>" \
#   -H "Content-Type: application/json" \
#   -d '{"event":"invoice.status_changed","url":"https://anoinhfivybufjmphmks.supabase.co/functions/v1/spedy-webhook"}'
```

### Roteiro de teste manual no sandbox

**Sem certificado (dá para fazer HOJE):**

1. Criar a conta sandbox em `sandbox-app.spedy.com.br` (**cadastro novo** — Plano
   Desenvolvedor; a conta de produção não vale aqui).
2. Copiar a chave Owner do sandbox: **Perfil → Minha Empresa → Credenciais da API**.
3. Setar os secrets de sandbox (os dois juntos — ver tabela de ambientes acima):
   `SPEDY_API_URL=https://sandbox-api.spedy.com.br/v1` e `SPEDY_OWNER_API_KEY=<chave sandbox>`.
4. Deploy: `supabase functions deploy spedy-api` e `supabase functions deploy
   spedy-webhook --no-verify-jwt`; registrar o webhook na conta sandbox (curl abaixo,
   trocando a URL da API pela do sandbox).
5. Garantir que a loja de teste tem CNPJ e **Inscrição Estadual** (dígitos ou `ISENTO`)
   no cadastro — sem isso o provisionamento é bloqueado de propósito.
6. Ligar o complemento NF-e (Configurações → Assinatura/Plano) → roda `provisionar`,
   que já chama `configurar` em seguida. Conferir na resposta `configurado: true` e
   `environment_type: "development"` (Homologação — NUNCA production no sandbox).
7. Colar o `config_fiscal` de teste no modal (JSON com CFOP/ICMS — valores de
   homologação, não fiscais).

**Exige o certificado A1 (quando chegar):**

8. Enviar o `.pfx` + senha no modal (vai para a Spedy via `certificado`; o Financia+
   não guarda o arquivo).
9. Registrar uma venda de teste no Estoque → dispara `emitir` com
   `environmentType: development` (nota de Homologação, sem validade fiscal).
10. Conferir o status: o webhook `invoice.status_changed` deve atualizar `nota_fiscal`
    (status `authorized`/`rejected`, número, protocolo); a action `consultar` cobre o
    caso de o webhook não chegar.

### Fluxo de uso (lojista)

1. **Configurações → Assinatura/Plano → complemento "Nota Fiscal"** → liga o toggle → o
   Financia+ chama `provisionar` e cria a sub-empresa da loja na Spedy automaticamente.
2. Modal abre pedindo o **certificado digital A1** (.pfx + senha) — vai direto para a Spedy, o
   Financia+ não guarda o arquivo.
3. Mesmo modal: colar o **`config_fiscal`** (JSON) já confirmado com o contador.
4. A partir daí, toda venda registrada no Estoque dispara `action: 'emitir'` automaticamente
   (fire-and-forget — nunca bloqueia o registro da venda). Status e rejeições ficam em
   `nota_fiscal`, atualizados pelo webhook.

### Limitações conhecidas / simplificações do MVP

- `destination` é sempre `'internal'` — o sistema não coleta o endereço/UF do comprador hoje,
  então venda interestadual (CFOP diferente, alíquota diferente) não é tratada automaticamente.
- `SefazInvoicePaymentMethod` é aproximado (`forma_pagamento` da venda não distingue
  pix/cartão/dinheiro) — informativo, não afeta o cálculo do imposto.
- Sem carta de correção nem tela de cancelamento na UI ainda (a API suporta; falta o botão).

---

## Resumo de prioridade

| # | Sistema | Esforço | Dependência externa | Prioridade |
|---|---|---|---|---|
| 1 | Supabase (Edge Fn OLX) | 30 min | Credenciais OLX | Alta |
| 2 | OLX Autoupload | — | Aprovação OLX (~1 semana) | Alta |
| 3 | Mercado Livre | 1–2 dias código | Conta dev ML (imediato) | Alta |
| 4 | Spedy (NF-e) | ✅ código pronto | Conta Owner + config fiscal c/ contador | Alta |
| 5 | WhatsApp Business | 1 dia código | Aprovação Meta ou BSP (~3 dias) | Média |
| 6 | Asaas | 2 dias código | Conta Asaas (imediato) | Média |
| 7 | Agregador | 1 dia código | Contrato com fornecedor | Baixa |
| 8 | Webmotors | ✅ código pronto | Homologação Sensedia (~3 semanas) | Baixa |
| 9 | Instagram | 1 dia código | App Review Meta (~3 semanas) | Baixa |
