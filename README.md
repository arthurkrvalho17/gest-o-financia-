# Financia+ Gestão — Documentação Viva

SaaS **multi-loja** de gestão para lojas de carros usados: estoque, preparação, financeiro,
CRM, contratos e (arquitetura pronta para) publicação multicanal e atendimento por WhatsApp.

> Este README é **spec-driven**: ele é a fonte da verdade que guia o código. Toda decisão
> de arquitetura e toda regra de negócio estão descritas aqui *antes* de virarem código —
> e devem ser mantidas atualizadas quando o software evoluir. Se o código divergir deste
> documento, o documento é o que precisa ser conciliado (corrigir o código **ou** atualizar a spec).

**Stack:** React + Vite + Tailwind (front) · Supabase = Postgres + Auth + RLS (back) · jspdf (contratos).

**Status:** MVP funcional + rodada de ajustes + arquitetura de integrações. Roda **em modo
demonstração** sem backend; vira sistema real ao conectar o Supabase. Veja [Roadmap](#11-roadmap-e-pendências).

---

## Índice

1. [Objetivo do produto](#1-objetivo-do-produto)
2. [Princípios inegociáveis](#2-princípios-inegociáveis-as-âncoras-da-spec)
3. [Regras de negócio que não podem quebrar](#3-regras-de-negócio-que-não-podem-quebrar)
4. [Decisões arquiteturais (ADRs)](#4-decisões-arquiteturais-adrs)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Modelo de permissões (dono × funcionário)](#6-modelo-de-permissões-dono--funcionário)
7. [Funcionalidades por módulo](#7-funcionalidades-por-módulo)
8. [Arquitetura de integrações](#8-arquitetura-de-integrações)
9. [Modo demonstração](#9-modo-demonstração)
10. [Estrutura de pastas](#10-estrutura-de-pastas)
11. [Roadmap e pendências](#11-roadmap-e-pendências)
12. [Decisões em aberto (defaults adotados)](#12-decisões-em-aberto-defaults-adotados)
13. [Como rodar, configurar e publicar](#13-como-rodar-configurar-e-publicar)

---

## 1. Objetivo do produto

Dar a uma loja de carros usados **um sistema só** para operar o dia a dia, com três objetivos centrais:

- **Multi-loja real e seguro.** Várias lojas usam o mesmo sistema, cada uma vendo **apenas os
  próprios dados**. Isolamento garantido no banco (não só na tela).
- **Lucro confiável.** O resultado da loja sai de uma contabilidade coerente: o lucro de cada
  carro e o resultado do mês são **calculados a partir de uma fonte única**, sem número digitado
  em dois lugares.
- **Operação ponta a ponta.** Do carro entrando no estoque → preparação → anúncio nos portais →
  negociação no CRM/WhatsApp → venda → contrato — tudo no mesmo lugar.

O público é o lojista (dono) e seus vendedores (funcionários), com **visões diferentes** por papel.

---

## 2. Princípios inegociáveis (as âncoras da spec)

Estes princípios valem para o sistema inteiro e **não** podem ser contornados:

1. **Isolamento multi-loja por RLS.** Toda tabela de dados carrega `loja_id` e tem políticas de
   Row Level Security que filtram por `loja_id = loja_do_usuario()`. A separação entre lojas é
   feita **no Postgres**, não no React. É o teste mais importante do sistema.
2. **Credenciais são da loja; o Financia+ orquestra.** Nas integrações (portais de anúncio,
   WhatsApp), cada loja usa as **próprias contas**. O sistema guarda os tokens de cada loja com
   segurança e roteia as chamadas — nunca centraliza credenciais nem opera como dono das contas.
3. **Só a `anon key` no front.** A `service_role key` nunca sai do servidor. As regras de acesso
   moram no RLS. `.env.local` está no `.gitignore`.
4. **Lucro nunca é guardado fixo** — sempre calculado (ver seção 3).

---

## 3. Regras de negócio que não podem quebrar

Regras de **integridade de dados**. O código não deve derivar comportamento diferente disso.
Implementadas em [`src/modules/estoque/useEstoque.js`](src/modules/estoque/useEstoque.js) e
[`src/modules/financeiro/useFinanceiro.js`](src/modules/financeiro/useFinanceiro.js).

1. **Lucro = `valor_venda − valor_compra − custos_preparação`**, sempre calculado na leitura.
   Em "à venda", `valor_venda` = valor pedido (anúncio); ao registrar a venda, passa a ser o
   valor real. Nunca existe uma coluna `lucro` estática.
2. **Preparação alimenta o lucro automaticamente.** `custos_preparação` de um carro = soma dos
   gastos lançados na aba Preparação **daquele** carro. É a **fonte única**: o mesmo gasto
   aparece no lucro do carro e na despesa do mês, mas...
3. **...não é descontado duas vezes.** `resultado da loja no mês = lucro dos carros vendidos no
   mês − (despesas fixas + outras)`. A preparação **não** entra de novo aqui, porque já está
   embutida no lucro de cada carro vendido.
4. **Consignado ≠ próprio.** No consignado, "valor de compra" é o **repasse ao dono** (não um
   custo de aquisição); o lucro é a **comissão** da loja. O tipo do veículo muda os rótulos e a
   leitura da fórmula (`comissão = venda − repasse − preparação`). Consignado vendido vira
   situação **"repasse"**.
5. **Permissões valem no front e no back.** Esconder no React não basta — a proteção também
   precisa existir no banco (ver seção 6).

---

## 4. Decisões arquiteturais (ADRs)

Registro enxuto das decisões e do *porquê* de cada uma.

### ADR-01 — Front React + Vite + Tailwind, back Supabase
**Decisão:** SPA em React/Vite, estilo com Tailwind; Supabase como back (Postgres + Auth + RLS + Storage).
**Por quê:** o RLS do Postgres entrega o multi-loja **no banco** com pouco código; Auth e Storage
vêm juntos; o front é estático e barato de hospedar. Tailwind mantém a identidade visual do
protótipo (Inter; azul `#185FA5`, navy `#0A1628`, fundo `#F7F9FC`).

### ADR-02 — Multi-loja por RLS, com função `loja_do_usuario()`
**Decisão:** cada tabela tem `loja_id`; uma função `security definer loja_do_usuario()` resolve a
loja do usuário logado; as policies usam `using/with check (loja_id = loja_do_usuario())`.
**Por quê:** centraliza a regra de isolamento em um único lugar e a aplica a toda query
automaticamente — impossível "esquecer o filtro" numa tela.

### ADR-03 — Cadastro cria a loja via trigger
**Decisão:** um trigger `handle_new_user()` em `auth.users` cria a `loja` e vincula o `usuario` no
signup, lendo o metadata enviado pelo cliente.
**Por quê:** funciona mesmo com confirmação de e-mail ligada (não depende de sessão ativa logo após
o cadastro) e não exige policies de INSERT permissivas em `lojas`/`usuarios`.

### ADR-04 — Lucro e custo **calculados**, nunca colunas fixas
**Decisão:** `veiculos` guarda `compra`, `pedido`, `minimo`; `lucro` e `custos_preparação` são
derivados em tempo de leitura (custo = soma de `preparacao_gastos`).
**Por quê:** regra de negócio nº 1–3. Evita divergência entre "número digitado" e "número real" e
mantém o histórico contábil coerente.

### ADR-05 — Modo demonstração embutido
**Decisão:** sem Supabase configurado, o app entra em modo demo (sem login, "Loja Demonstração",
dados de exemplo em memória); com Supabase, usa dados reais. A decisão é feita por
`supabaseConfigurado` em [`src/lib/supabase.js`](src/lib/supabase.js).
**Por quê:** permite avaliar **todas** as telas antes de montar o backend, e dá um caminho de
desenvolvimento sem credenciais. Cada módulo tem um hook de dados que abstrai os dois modos.

### ADR-06 — Hook de dados por módulo (abstração demo/real)
**Decisão:** cada módulo expõe um hook (`useEstoque`, `usePreparacao`, `useFinanceiro`, `useCrm`,
`useContratos`) que lê/escreve no Supabase **ou** num store em memória, com a mesma interface.
**Por quê:** as telas não sabem de onde vêm os dados; trocar demo↔real não muda os componentes.

### ADR-07 — Permissões por papel no front **e** previstas no banco
**Decisão:** `papel` (`dono` | `funcionario`) no `usuarios`; o front esconde rotas/colunas/campos
sensíveis; no banco, a base para proteção de **coluna** fica pela `view veiculos_funcionario`
(RLS é por linha, não por coluna).
**Por quê:** regra nº 5. A view é o caminho documentado para a defesa em profundidade quando o
Supabase estiver conectado (consultar a view quando `papel = funcionario`).

### ADR-08 — Contratos: PDF no front + modelo do lojista por placeholders
**Decisão:** o gerador monta um PDF padrão com `jspdf`; o lojista pode subir o **próprio** modelo
por tipo de documento, preenchido por placeholders (`{{nome}}`, `{{placa}}`…).
**Por quê:** entrega valor imediato (PDF padrão) sem servidor, e respeita que **o documento é do
lojista**. Preencher o `.docx` do lojista é mais trabalhoso que um template fixo — placeholders são
o caminho mais simples e previsível.

### ADR-09 — Integrações como **camada de conectores plugáveis**
**Decisão:** publicação em portais e mensageria são uma camada de adapters com **interface comum**
(`publicar/atualizar/despublicar/consultarStatus`; `enviar` para mensageria) + registry +
fila/status. Hoje os adapters são *mock*. Ver [`src/integracoes/`](src/integracoes).
**Por quê:** princípio nº 2 e a realidade heterogênea dos canais (cada portal tem homologação,
limites e latência próprios). Trocar/adicionar canal = adicionar um adapter, sem tocar no núcleo.
Um **agregador** (que conecta vários portais por uma API só) é **apenas mais um conector**, então
o sistema não fica acoplado a nenhum fornecedor.

### ADR-10 — Inbox de conversas desenhado **omnichannel**
**Decisão:** `conversa`/`mensagem`/`canal` são genéricos; WhatsApp é o **primeiro** canal, não o
único. A janela de 24h do WhatsApp é modelada (`janela_24h_expira_em`) e a UI muda o compositor
fora dela (só templates HSM).
**Por quê:** permite plugar Instagram Direct e outros depois reusando o mesmo inbox, e respeita as
regras da WhatsApp Business Platform desde o início.

### ADR-11 — Assinatura eletrônica avançada via plataforma externa
**Decisão:** o contrato é assinado pela loja, enviado ao cliente e devolvido como PDF lacrado +
trilha de auditoria, guardados na ficha do carro. Não construímos criptografia — integra-se uma
plataforma (ex.: ZapSign/ClickSign). A **ATPV-e** (transferência no Detran) é tratada como
documento separado, **apenas guardado**.
**Por quê:** a assinatura **avançada** (Lei 14.063/2020) é válida e vincula as partes para o
contrato particular entre loja e cliente; é a auditoria que segura numa disputa. A transferência
oficial é ato com ente público (gov.br/ICP-Brasil) — não dá para prometer transferência automática.

---

## 5. Modelo de dados

Postgres no Supabase. **Toda** tabela de dados tem `loja_id` e RLS por loja. Migrations versionadas
em [`supabase/migrations/`](supabase/migrations) (e consolidadas em
[`supabase/setup.sql`](supabase/setup.sql)).

**Fundação** (`0000`)
- `lojas` — tenants. `usuarios` — `id = auth.users.id`, `loja_id`, `papel` (dono|funcionario).
- `loja_do_usuario()` — função que resolve a loja do usuário logado. Trigger `handle_new_user()`.

**Estoque** (`0001`, `0006`, `0008`)
- `veiculos` — `codigo, modelo, fab_mod, cor, placa, renavam, chassi, km, combustivel,
  tipo (proprio|consignado), entrada, saida, situacao (estoque|reservado|vendido|repasse),
  compra, pedido, minimo, descricao, marcador_texto, marcador_cor`.
- `vendas` — `veiculo_id, valor_venda, data_venda, comprador_nome, forma_pagamento, vendedor_id,
  observacao`. (Alimentam o desempenho de vendedores.)
- `veiculo_documento` (`0008`) — ficha de documentos do carro (`tipo, arquivo_url,
  status anexado|assinado|pendente, data`; arquivos no Storage). Recebe CRLV-e, contratos
  assinados, ATPV-e, CNH do comprador, etc.
- `contrato_modelo` (`0009`) — modelo da loja por tipo (`origem padrao|editado|enviado, conteudo,
  arquivo_url`). O padrão é do sistema; aqui ficam só as versões da loja.

**Preparação** (`0002`)
- `preparacao_gastos` — `veiculo_id, descricao, data, forma_pgto, valor, status (pago|pendente),
  observacoes`. Soma por veículo = custo de preparação (fonte única).

**Financeiro** (`0003`)
- `despesas` — `categoria (fixa|outra), mes_ref, descricao, vencimento, valor, status, data_pgto,
  observacoes, lembrete_*`. A "preparação dos carros" **não** é duplicada aqui — vem de
  `preparacao_gastos` filtrada pelo mês.

**CRM** (`0004`, `0011`)
- `leads` — `nome, telefone, canal_origem, vendedor_id, etapa
  (novo|conversa|negociacao|agendado|ficha|posvenda), veiculo_id`.
- `regra_distribuicao` (`0011`) — `canal, tipo (fixo|rodizio), vendedores (jsonb)`.
- `vendas.origem_lead` (`0011`) — de onde veio a venda (relatório de vendas por canal).

**Contratos** (`0005`, `0006`, `0008`)
- `loja_config` — `assinatura_nome, assinatura_cnpj, logo_url`.
- `documentos` — `tipo, veiculo_id, cliente_nome, cliente_cpf, dados (jsonb), pdf_url` +
  assinatura (`assinatura_status, url_pdf_assinado, url_auditoria, signatarios, nivel_assinatura`).
- `veiculo_fotos` (`0006`) — fotos do carro (Storage + metadados).
- `modelos_documento` (`0006`) — modelo do lojista por tipo (`arquivo_url, mapeamento_campos`).

**Configurações / Plano** (`0008`)
- `loja_plano` — `plano, valor_mensal, proxima_cobranca, forma_pagamento` + complementos
  (`complemento_ia, complemento_multicanal, complemento_nf`). Integra com o provedor de
  cobrança SaaS (ex.: Asaas). Vendedores = `usuarios` da loja.

**Integrações** (`0007`)
- Publicação: `canal` (catálogo), `canal_credencial` (por loja, tokens), `anuncio_publicacao`
  (status por veículo×canal), `publicacao_job` (fila).
- Mensageria: `canal_mensageria_credencial` (WABA da loja), `contato`, `conversa`
  (`janela_24h_expira_em`), `mensagem`.

---

## 6. Modelo de permissões (dono × funcionário)

Cada usuário tem `papel`. A regra (spec) e onde é aplicada:

| Recurso | Dono | Funcionário | Onde |
|---|---|---|---|
| Aba **Financeiro** | vê | escondida | nav + rota ([`App.jsx`](src/App.jsx), [`Sidebar.jsx`](src/components/Sidebar.jsx)) |
| Aba **Configurações** (inclui Conexões) | vê | escondida | nav + rota |
| Estoque — painel **Desempenho dos vendedores** | vê | escondido | [`EstoquePage.jsx`](src/modules/estoque/EstoquePage.jsx) |
| Valores **Compra** e **Lucro** (tabela, ficha, PDF) | vê | escondidos | regra 6.5 |
| Valores **Mínimo** e **Venda** | vê | **vê** | regra 6.5 |
| Adicionar veículo — **compra** | vê | escondido | [`AddVeiculoModal.jsx`](src/modules/estoque/AddVeiculoModal.jsx) |
| Registrar venda — **lucro / compra / preparação** | vê | escondidos (vê mínimo+aviso) | [`RegistrarVendaModal.jsx`](src/modules/estoque/RegistrarVendaModal.jsx) |
| Estoque, Preparação, CRM, Contratos | vê | vê | — |

- O papel vem de `usuarios.papel`. No modo demo há um seletor **"Ver como: Dono | Funcionário"**
  no rodapé da sidebar para visualizar as duas visões.
- Cada funcionário cadastrado vira automaticamente uma **opção de vendedor** no Registrar venda.
- **Defesa em profundidade no banco:** RLS é por linha; a proteção de **coluna** (esconder
  `compra/minimo/lucro` do funcionário no próprio Postgres) usa a `view veiculos_funcionario`
  (migration `0006`) — a implementação final liga quando o Supabase estiver conectado.

---

## 7. Funcionalidades por módulo

### Fundação / Auth
Login e cadastro (email/senha). No cadastro, cria a loja e vincula o usuário (trigger). Layout
base: sidebar navy + topbar; rotas protegidas (sem sessão → login; sem Supabase → demo).

### Estoque ([`src/modules/estoque`](src/modules/estoque))
- Tabela densa **à venda / vendidos**: Cód, Modelo (clicável → ficha), Fab/Mod, Cor, Placa, Tipo,
  Entrada, **Tempo** (semáforo), Situação, **Compra** (dono), **Mínimo**, **Venda**, **Lucro**
  (dono), Marcador, Ações, **Docs**. Sem coluna de Saída (a data da venda fica só no dado).
- **Situação** (estoque ativo): estoque / reservado / preparação. Vendido/repasse são consequência
  da venda registrada.
- **Tempo de estoque com semáforo**: verde ≤30 dias, amarelo-dourado 30–60, vermelho >60
  (limiares em `format.js`) — para bater o olho no capital empatado.
- **Ficha do carro** (clique no nome → modal): galeria, todos os dados, valores (regra 6.5) e
  documentos; **PDF da ficha** (toggle "com capa"). E **PDF do estoque**: catálogo por faixa de
  preço (capa/km/preço, toggle).
- **3 KPIs** (veículos em estoque, média de dias, vendas do mês) calculados por query.
- **Filtros combináveis**: busca (modelo/placa/código), cor, tipo, situação, limpar,
  contador "Exibindo X de Y". Mantêm referência ao registro original.
- **Cadastrar veículo**: identidade + compra/pedido/mínimo, descrição, fotos (upload), RENAVAM;
  atalhos "Buscar pela placa" / "Enviar CRLV-e" (previstos, hoje "em breve").
- **Marcador** editável (texto + cor).
- **Registrar venda**: valor real com **lucro ao vivo** + **aviso de abaixo do mínimo**, data,
  **vendedor** (equipe da loja), comprador, forma de pagamento, **origem do lead** (de onde veio a
  venda — tráfego pago/portais), observação. Move o carro para
  vendidos (consignado → repasse). Lucro nunca guardado fixo.
- **Publicar / status** por canal (ver seção 8).
- **Ficha de documentos** por carro (à venda e vendido): anexar por tipo (ATPV-e, CRLV-e, CRV,
  contrato, recibo, procuração, CNH do comprador, comprovante, outro) com status
  anexado/assinado/pendente. A ATPV-e é só guardada — a transferência é no Detran.
- **Desempenho dos vendedores** (só dono): destaque do mês, mês passado, total do mês;
  minimizável; histórico de ranking mês a mês (dados das vendas por `vendedor_id`).

### Configurações ([`src/modules/configuracoes`](src/modules/configuracoes)) — *só dono*
- **Assinatura / Plano**: plano atual, valor, próxima cobrança, forma de pagamento, usuários
  ativos; complementos ligáveis (IA de pré-venda, multicanal, NF). Integra com cobrança SaaS.
- **Vendedores**: CRUD de vendedores = usuários da loja. Adicionar aqui faz o vendedor aparecer
  no **Registrar venda**; remover, some. (No real, adicionar envia um convite de acesso.)
- **Conexões**: conectar/desconectar os canais da loja (anúncio + WhatsApp) — antes era página
  separada, agora vive aqui. As credenciais são da loja; o FINANCIA+ só orquestra.
- **Identidade da loja**: nome, CNPJ e logo (a logo entra em destaque no cabeçalho dos PDFs).
- **Distribuição de leads**: regra por canal → vendedor (fixo/rodízio) usada pelo CRM.

### Preparação ([`src/modules/preparacao`](src/modules/preparacao))
Lista de todos os carros (nº de itens, gasto, situação: sem lançamentos / em preparo / pronto).
Ao abrir um carro, planilha editável de gastos com total automático. **Adicionar gasto abre um
formulário** ([`GastoPreparacaoForm`](src/modules/preparacao/GastoPreparacaoForm.jsx)) — carro do
estoque, descrição, valor, status pago/pendente, observação (data automática) — com dois pontos de
entrada: botão no topo (sem carro) e dentro da planilha do carro (carro pré-selecionado). Escolhido o
carro **uma vez**, dá para lançar **vários gastos de uma só vez** ("Adicionar outro gasto"). **Esse
total alimenta o lucro do carro no Estoque e a despesa do mês** — fonte única (`gasto_preparacao`).

### Financeiro ([`src/modules/financeiro`](src/modules/financeiro)) — *só dono*
- **3 KPIs** na ordem fixa: Faturamento → **Lucro** → Gasto total.
- **Despesas do mês** em 3 categorias: **fixas** e **outras** editáveis (planilha simples com
  lembrete, status, total); **preparação dos carros** clicável → visão do mês (lista com o carro)
  e "Adicionar despesa" abrindo o **mesmo formulário** da Preparação (fonte única). O mesmo gasto
  aparece nas duas telas e não é descontado duas vezes no resultado.
- **Lucro por carro vendido** — clicável, abre o detalhe da conta (comprei por X, preparação item
  a item, vendi por Y, fórmula) + resultado da loja no mês.
- **Contas a pagar**: visão filtrada (status pendente) do mês — todos os pendentes das 3 categorias
  (fixas + preparação + outras) com categoria, valor e total; "Marcar pago" tira da lista. Mesma
  fonte das planilhas (não duplica dado).
- **Histórico mês a mês** clicável; cada mês abre com as mesmas planilhas **editáveis** (correção
  contábil). Métricas calculadas por query.
- **Virada de mês**: Preparação e Outras começam vazias no mês novo (não são transportadas);
  **Despesas fixas são recriadas** como pendentes (recorrência). O histórico dos meses anteriores
  nunca é apagado.

### CRM ([`src/modules/crm`](src/modules/crm))
- **3 KPIs** (leads do mês, conversão, negócios em aberto).
- **Negociações**: funil kanban arrastável — Novo lead → Em conversa → Negociação → Agendado →
  Ficha aprovada → Pós-venda; a etapa persiste a cada movimento. Cada card mostra o canal de
  origem e o **vendedor responsável**; dá para **filtrar por canal**.
- **Distribuição automática**: regra por canal → vendedor (fixo ou rodízio), configurada em
  Configurações. Leads que chegam por cada canal entram em "Novo lead" já atribuídos.
- **Conversas**: inbox de WhatsApp amarrado ao lead (ver seção 8).
- **Histórico mês a mês** (leads, vendas, conversão, ticket médio).

### Contratos ([`src/modules/contratos`](src/modules/contratos))
- Grade de **5 modelos** (compra e venda, recibo de sinal, consignação, procuração, termo de test
  drive). Documentos saem com **logo/nome da loja em destaque** no cabeçalho e "Financia+" pequeno
  (identidade editável em Configurações → Identidade da loja: nome/CNPJ/logo).
- **Consignação**: o consignante é **empresa** (razão social, CNPJ, telefone, endereço) e vem
  **preenchido automaticamente** do cadastro do veículo consignado. **Recibo de sinal** inclui o
  endereço do cliente e o valor do sinal (`{{valor_sinal}}`).
- Formulário: dados do cliente (nome, CPF, telefone, **data de nascimento** — sem profissão/RG) +
  **seleção do carro do estoque** (preenche tudo) + **campos específicos por tipo**.
- **Modelos padrão FINANCIA+** ([`modelosPadrao.js`](src/modules/contratos/modelosPadrao.js)) com
  `{{placeholders}}`: clicáveis para **ver e editar** ("Editar como meu modelo"); sempre há duas
  versões — **Padrão FINANCIA+** (intacto) e **Seu modelo (editado)** — com "Voltar ao padrão" e
  "Enviar modelo próprio". Preservar o padrão é proposital (responsabilidade da edição é do lojista).
- **Gerar PDF** (→ assinatura) e **Gerar DOCX editável** — mesmo motor de template
  ([`gerarDocumento.js`](src/modules/contratos/gerarDocumento.js)) preenchendo o modelo ativo.
- **Assinatura eletrônica** (avançada, Lei 14.063/2020) em **3 vias**: assinar no aparelho (canvas),
  enviar link (WhatsApp/e-mail) ou imprimir. O documento (assinado pela loja + cliente) vai para a
  **ficha do carro** — Assinado, ou Pendente na via impressão. Plataforma externa (ZapSign) — hoje
  simulada. A **ATPV-e** (Detran) é só guardada, sem promessa de transferência.
- **Histórico**: atalho que abre todos os documentos gerados, agrupados por tipo, com busca por
  cliente/carro/tipo/data (mesma fonte da ficha do carro).
- **CRLV-e**: enviado no cadastro do veículo, fica guardado na ficha do carro.
- **Documentos clicáveis** na ficha do carro: clicar abre a visualização (PDF/imagem no real;
  conteúdo nos gerados pelo sistema); remover é separado do clique.

---

## 8. Arquitetura de integrações

Construída cedo para **não refatorar o núcleo** quando cada integração entrar. Código em
[`src/integracoes/`](src/integracoes): `canais.js` (catálogo), `anuncioCanonico.js`,
`conectores.js` (adapters + registry), `demoIntegr.js` (estado demo).

### A. Estoque → publicação multicanal
- **Anúncio canônico**: representação única do carro (dados + fotos + descrição) que todo conector
  consome — fonte da verdade.
- **Conectores por canal**: implementação isolada da mesma interface
  (`publicar/atualizar/despublicar/consultarStatus`). Hoje *mock*; troca por real sem mexer no resto.
- **Fila + status**: publicar é assíncrono; cada veículo×canal tem status (pendente/publicado/
  erro/despublicado) e link, visível no modal **Publicar / status** do Estoque.
- **Realidade de cada canal** (sinalizada na UI): Mercado Livre (API pública — 1º conector real
  sugerido), OLX (API/feed), Webmotors (homologação Sensedia, pode ser hub), Instagram (Graph API
  no feed, exige app review; **Marketplace orgânico não tem API aberta — fora do escopo**),
  Agregador (uma API conecta vários — é só mais um conector).

### B. CRM → inbox de WhatsApp
- Aba **Conversas** = inbox omnichannel (WhatsApp primeiro). Cada conversa é amarrada a um `lead`;
  Funil e Conversas são o **mesmo CRM** (muda-se a etapa pela conversa).
- **Janela de 24h**: dentro dela, mensagem livre; fora, **só templates pré-aprovados (HSM)** — a
  UI troca o compositor automaticamente.
- **Credenciais da loja**: cada loja tem o próprio WABA/número; o Financia+ orquestra (Meta direto
  ou via BSP). Adapter de mensageria com a mesma lógica de conector.

---

## 9. Modo demonstração

Sem `.env.local` configurado, o app:
- libera o acesso **sem login** com uma "Loja Demonstração";
- usa **dados de exemplo em memória** (não persistem — recarregar reinicia);
- mostra um seletor **Dono / Funcionário** para visualizar os dois papéis;
- usa **conectores mock** (publicação/WhatsApp simulam sucesso).

Ao preencher as chaves do Supabase, o mesmo código passa a usar **dados reais**, com login e
isolamento por RLS. A troca é automática (`supabaseConfigurado`).

---

## 10. Estrutura de pastas

```
src/
├─ lib/            supabase.js (cliente + flag de modo), format.js (R$, datas, lucro)
├─ auth/           AuthContext.jsx (sessão, loja, papel, ehDono), Login.jsx
├─ components/     Layout/Topbar, Sidebar, Modal, Toast, icons, Placeholder
├─ modules/
│  ├─ estoque/     useEstoque + página + modais (Add, Venda, Marcador, Publicar) + demoData
│  ├─ preparacao/  usePreparacao + página + demoPrep (store compartilhado do custo)
│  ├─ financeiro/  useFinanceiro + página + DespesaSheet + LembreteModal + demoFin
│  ├─ crm/         useCrm + página (Funil, Conversas, Pós-venda, Histórico) + demoCrm
│  ├─ contratos/   useContratos + página + modelos.js + contratoPdf.js
│  └─ conexoes/    ConexoesPage
├─ integracoes/    canais, anuncioCanonico, conectores, demoIntegr
└─ App.jsx         rotas (login vs. app; gating por papel)
supabase/
├─ migrations/     0000…0007 (uma por fase/rodada)
└─ setup.sql       consolidado (cole tudo de uma vez no SQL Editor)
```

---

## 11. Roadmap e pendências

**Construído:** Fundação ✅ · Estoque ✅ (filtros, semáforo de tempo, ficha de docs, desempenho de
vendedores) · Preparação ✅ · Financeiro ✅ · CRM ✅ (funil + inbox) · Contratos ✅ (campos por tipo,
modelos da loja, assinatura eletrônica) · Configurações ✅ (plano + vendedores) ·
Permissões/papéis ✅ · Arquitetura de integrações (mock) ✅.

**Pendente (precisa do Supabase conectado e/ou credenciais das lojas):**
- Conectar o Supabase real (preencher `.env.local` + rodar `setup.sql`) e validar o isolamento.
- Conectores **reais** dos portais e do WhatsApp (entram por fase, conforme homologação).
- Upload de fotos e de modelos `.docx`/PDF para o **Supabase Storage**.
- Proteção de coluna por papel no banco (via `view veiculos_funcionario`).
- Deploy (Vercel/Netlify) e cobrança da assinatura (Asaas) — pós-MVP.

**Regra de comunicação ao lojista:** não prometer "publica em tudo automaticamente no dia 1" —
prometer a arquitetura e ligar canal a canal.

---

## 12. Decisões em aberto (defaults adotados)

Pontos que o dono do produto pode mudar; o sistema já roda com estes defaults:

| Tema | Default adotado |
|---|---|
| Funcionário vê o **mínimo**? | **Sim** (regra 6.5 — vê Mínimo e Venda; não vê Compra/Lucro) |
| Funcionário vê a **Preparação**? | Sim |
| Consulta por **placa** / OCR do **CRLV** | Manual no MVP ("em breve") |
| Modelo `.docx` do lojista | Por **placeholders** `{{campo}}` |
| **Comissão** por vendedor | Prevista no schema, sem tela ainda |
| **Fotos → portais** | Só armazenar por enquanto |
| Portais: agregador × conectores próprios | Camada **agnóstica**; ML como 1º real sugerido |
| WhatsApp: Meta direto × BSP | Credencial agnóstica (serve aos dois) |
| Instagram | Feed (post/carrossel); Marketplace orgânico **fora** |
| Plataforma de assinatura | **ZapSign** (avançada); opção de elevar a qualificada |
| Cobrança do plano | **Asaas** (demo) |
| Funcionário vê **Desempenho dos vendedores** | Não (só dono) |

---

## 13. Como rodar, configurar e publicar

### Rodar localmente
Pré-requisito: Node.js (via nvm; versão pinada em `.nvmrc`).

```bash
nvm use            # ou: nvm install
npm install
npm run dev        # http://localhost:5173  (abre em modo demonstração)
```

### Conectar o Supabase (vira sistema real)
1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, copie o `Project URL` e a `anon public key`.
3. Copie `.env.local.example` para `.env.local` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-public-key
   ```
4. No **SQL Editor**, cole **`supabase/setup.sql`** inteiro e rode (cria tudo na ordem). Ou rode
   as migrations `0000`…`0007` de `supabase/migrations/` uma a uma.
5. Para testar rápido: em **Authentication → Providers → Email**, desligue *"Confirm email"*.
6. Reinicie o `npm run dev`.

> ⚠️ Só a `anon key` no front. A `service_role key` nunca sai do servidor. `.env.local` no `.gitignore`.

### Teste mais importante (multi-loja)
Crie **duas contas** (duas lojas). Logado na loja A, você **não** pode ver nada da loja B. Esse
isolamento é o RLS no Postgres.

### Publicar (deploy)
Front estático. **Vercel** ou **Netlify**: build `npm run build`, saída `dist`, e configure
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` no painel do provedor.
