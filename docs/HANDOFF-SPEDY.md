# Handoff — Integração Spedy (emissão de NF-e)

> Gerado em 2026-08-26 para continuar em um novo chat sem perder contexto.
> Cole este arquivo (ou peça para o Claude ler `docs/HANDOFF-SPEDY.md`) no início da nova conversa.

## Onde paramos

A integração com a **Spedy** (emissor de NF-e/NFS-e/NFC-e via API REST) foi **implementada de ponta a ponta no código** (ADR-17 no README.md), mas ainda **não está em produção** — falta provisionamento real (conta Owner, secrets, deploy) e confirmação fiscal com contador.

A última pergunta do usuário foi um medo legítimo: **"é possível emitir para os clientes do nosso SaaS, ou só para nós mesmos?"** Resposta já dada e fechada: **sim, é o caso de uso principal que a Spedy anuncia** (modelo Owner → sub-empresas via `POST /v1/companies`, cada uma com sua própria `apiKey`). Uma ressalva ficou registrada: um resumo externo (blog da Spedy) descreveu um modelo de auth ligeiramente diferente (token único + CNPJ no payload) do que está no doc técnico oficial (`docs/Speedyllms.txt`, X-Api-Key por empresa) — recomendação foi **confirmar diretamente com o time comercial/suporte da Spedy antes de emitir em produção**, mas isso **não bloqueia o código já escrito**, que segue fielmente o doc técnico.

## Arquitetura implementada (ADR-17)

- **Financia+ é a "Empresa Owner"** na Spedy. Cada loja cliente é provisionada automaticamente como sub-empresa (`POST /v1/companies`), sem a loja precisar criar conta em portal externo (diferente de Webmotors/Usadosbr/OLX).
- **Emissão automática** ao registrar a venda no Estoque — decisão explícita do usuário, mesmo eu tendo recomendado emissão manual dado o risco fiscal. Implementado como fire-and-forget (nunca bloqueia/derruba a venda).
- **Modo completo** (`POST /v1/product-invoices`), não o fluxo simplificado `/v1/orders` — porque a tributação de veículo usado varia por operação (CFOP 5502/6502, redução de base de ICMS por convênio estadual) e não pode ser um default fixo.
- **Códigos tributários nunca são hardcoded.** Ficam em `loja_config.config_fiscal` (jsonb), preenchidos pela loja/contador via textarea JSON em Configurações. Sem isso preenchido, a emissão falha com mensagem clara — nunca tenta adivinhar.

## Arquivos criados/alterados

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/0018_spedy_nfe.sql` | Colunas fiscais em `lojas` (numero, cidade_ibge, inscricao_estadual, regime_tributario, cnae_principal); canal `spedy`; tabela `nota_fiscal` (unique em `venda_id`, status via check constraint espelhando `InvoiceStatus` da Spedy) |
| `supabase/migrations/0019_spedy_config_fiscal.sql` | Coluna `loja_config.config_fiscal jsonb` + comentário extenso documentando o shape esperado (CFOP/NCM/CST/ICMS/PIS/COFINS) |
| `supabase/functions/spedy-api/index.ts` | Edge Function com 4 ações: `provisionar` (cria sub-empresa), `certificado` (upload do A1), `emitir` (chama `/v1/product-invoices`), `consultar` (status da nota) |
| `supabase/functions/spedy-webhook/index.ts` | Recebe `invoice.status_changed`, resolve `loja_id` via `data.company.federalTaxNumber` == `lojas.cnpj`, atualiza `nota_fiscal` |
| `src/integracoes/spedy/useSpedyAuth.js` | Hook: `status, erro, provisionar, enviarCertificado, salvarConfigFiscal, desconectar` |
| `src/modules/configuracoes/ConfiguracoesPage.jsx` | Card "Emissão de NF-e": toggle → provisiona → modal de certificado A1 (.pfx/.p12 + senha) + textarea JSON de `config_fiscal` |
| `src/modules/estoque/RegistrarVendaModal.jsx` | Campo novo "CPF/CNPJ do comprador" (obrigatório para a Spedy aceitar a nota) |
| `src/modules/estoque/useEstoque.js` | `registrarVenda` grava `comprador_cpf`, captura `venda.id`, dispara `spedy-api` (`action: 'emitir'`) fire-and-forget |
| `INTEGRACOES.md` (seção 9) | Passo a passo de deploy, registro de webhook (curl), limitações do MVP |
| `README.md` | ADR-17, seção 5 (modelo de dados), seção 7/8 (fluxo de venda), roadmap |

## Pendências (ordem sugerida)

1. **Criar conta Owner na Spedy** (sandbox primeiro) — ação do usuário, fora do código.
2. **Confirmar com a Spedy** (comercial/suporte) o modelo exato de multiempresa/auth antes de ir a produção — perguntas sugeridas:
   - "Somos uma plataforma SaaS e precisamos emitir NF-e em nome de cada loja cliente, cada uma com seu próprio CNPJ — isso é feito criando uma empresa por CNPJ via `POST /v1/companies` com a chave Owner, certo?"
   - "Qual plano cobre esse uso multiempresa?"
   - "Existe alguma autorização/procuração documental necessária por CNPJ?"
3. Definir secret `SPEDY_OWNER_API_KEY` no Supabase.
4. Deploy das functions (ainda não feito):
   ```
   npx supabase functions deploy spedy-api
   npx supabase functions deploy spedy-webhook --no-verify-jwt
   ```
5. Registrar o webhook uma única vez (comando curl documentado em `INTEGRACOES.md` seção 9, escopo é por conta, não por empresa).
6. Cada loja precisa preencher `config_fiscal` (CFOP/NCM/ICMS/PIS/COFINS) **confirmado com contador** antes de qualquer emissão real — nunca usar valores de exemplo/placeholder em produção.
7. Simplificações do MVP a revisitar depois: `destination` sempre `internal` (não coleta UF do comprador), forma de pagamento aproximada, sem carta de correção/cancelamento na UI ainda.

## Outras integrações em andamento (contexto, não é o foco deste handoff)

- **Webmotors**: código pronto (conector, mapper, auth hook, Edge Functions `webmotors-api`/`webmotors-webhook`, UI), aguardando homologação da Sensedia.
- **OLX**: e-mail enviado para `suporteintegrador@olxbr.com`, sem resposta ainda.
- **Usadosbr**: pesquisa feita, e-mail de solicitação de credenciais redigido, não confirmado como enviado.
- **RENAVE**: migration `0017_renave.sql` criada (Renave Fácil escolhido como integrador), implementação da API ainda não começou. Prazo legal ~set/2026 (Resolução CONTRAN 1.026/2026).

## Como retomar no novo chat

Basta abrir o novo chat e dizer algo como: *"Leia `docs/HANDOFF-SPEDY.md` para retomar o contexto da integração Spedy"* — o Claude vai ler este arquivo e (se precisar de detalhes de código) reler os arquivos listados acima diretamente, que são a fonte da verdade.

As memórias persistentes do projeto (`financia-gestao-visao-geral`, `renave-obrigatoriedade`, `integracoes-status-externas`, `spedy-emissao-nfe`) já carregam automaticamente em qualquer novo chat neste diretório.
