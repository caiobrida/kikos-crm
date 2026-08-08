# Kikos CRM

CRM de vendas da Kikos Fitness: o time comercial registra Leads, abre Deals sobre eles e
acompanha esses negócios por um Pipeline até ganhar ou perder.

O vocabulário do domínio está em [`CONTEXT.md`](./CONTEXT.md); as decisões de arquitetura,
em [`docs/adr/`](./docs/adr/).

- [Como rodar](#como-rodar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Modelo de dados](#modelo-de-dados)
- [Estrutura](#estrutura)
- [Effect, com o paralelo em TypeScript comum](#effect-com-o-paralelo-em-typescript-comum)
- [As decisões](#as-decisões)
- [Scripts](#scripts)
- [Testes e CI](#testes-e-ci)
- [Fora de escopo](#fora-de-escopo)
- [O que seria diferente em produção](#o-que-seria-diferente-em-produção)

## Como rodar

Pré-requisitos: **Node 22+** e **Docker**.

```bash
npm install          # instala os três workspaces de uma vez
cp .env.example .env # um .env único serve o monorepo inteiro
docker compose up -d # sobe o Postgres
npm run db:migrate   # cria as tabelas
npm run db:seed      # popula o banco com os dados de exemplo
npm run dev          # sobe a API e o app web juntos
```

Abra <http://localhost:5173>, entre com `rodrigo.ramos@kikos.com.br` / `kikos123`, e o CRM está
com dados.

O `docker compose` cria o banco com collation **ICU pt-BR**, para que ordenar a lista por nome
não jogue "Álvaro" depois de "Zeta". O `initdb` só roda com o volume vazio: quem já tinha o
Postgres de pé antes disso precisa de um `docker compose down -v` antes do `up`, e depois refaz
`db:migrate` e `db:seed`.

O `npm run db:migrate` chama `prisma migrate dev`, que pergunta antes de aplicar quando encontra
o banco fora de dia. Num banco vazio ele aplica as quatro migrations e sai.

| O quê    | Endereço                                   |
| -------- | ------------------------------------------ |
| App web  | http://localhost:5173                      |
| API      | http://localhost:3333 (saúde em `/health`) |
| Postgres | `localhost:5432`, banco `kikos_crm`        |

Em desenvolvimento o Vite proxia `/api` para a API, então o navegador fala com uma origem só.
O prefixo `/api` é convenção do proxy: a API serve o contrato sem prefixo (`/health`,
`/auth/login`, `/leads`…).

### Credenciais de exemplo

O seed cria um gestor, três vendedores, catorze Leads, vinte e um Negócios e quinze registros de
linha do tempo. A senha de todos é **`kikos123`**:

| E-mail                       | Nome               | Papel     |
| ---------------------------- | ------------------ | --------- |
| `rodrigo.ramos@kikos.com.br` | Rodrigo Ramos      | `MANAGER` |
| `ana.nogueira@kikos.com.br`  | Ana Paula Nogueira | `SELLER`  |
| `caio.brida@kikos.com.br`    | Caio Brida         | `SELLER`  |
| `maria.silva@kikos.com.br`   | Maria da Silva     | `SELLER`  |

Ele é **idempotente**: `upsert` por e-mail para os Users e por identificador fixo para Leads e
Deals. Rodá-lo duas vezes não duplica ninguém e não derruba a sessão de quem já está logado.

### O que dá para fazer

Depois de entrar, a barra lateral leva a Dashboard, Leads, Negócios e Vendedores.

**Dashboard** abre com o valor parado em cada Stage do funil, o comparativo de ganhos e perdidos
por vendedor, e uma tabela de negócios com busca, ordenação e paginação — clicar numa linha abre
o detalhamento do negócio.

**Leads** é a carteira: busca, filtro por status e por responsável, ordenação por qualquer
coluna e paginação, tudo no servidor. "Criar Novo Lead" cadastra um contato; clicar numa linha
abre o modal com o dossiê, e de lá se edita ou se remove. Remover um contato com negócio em
aberto é recusado, com o número de negócios que travam a operação.

**Negócios** é o funil como board, uma coluna por Stage, com contador real por coluna e
"carregar mais" nas cheias. "Cadastrar Novo Negócio" abre uma oportunidade sobre um contato da
carteira. Arrastar um card entre colunas registra o avanço — ou o recuo — da negociação, e o
`<select>` no rodapé do card faz o mesmo pelo teclado. Soltar um card na coluna Fechado abre a
escolha entre Ganho e Perdido. Clicar num card abre o painel lateral, e dele o detalhamento —
um modal com URL própria (`/negocios/:id`), que sobrevive ao recarregar, fecha no botão voltar e
pode ser mandado a um colega. Dentro dele estão o dossiê do cliente, a linha do tempo, a caixa de
comentário e as ações de editar, remover e encerrar.

**Vendedores** ainda é um marcador: a fatia que a constrói (`.scratch/kikos-crm/issues/13`) era
opcional e ficou de fora. A lista de vendedores que os formulários e os filtros consomem existe e
funciona — é `GET /users?role=SELLER`.

A **vitrine das primitivas** (botão, campo, selo, avatar, modal e tabela nas suas variações) fica
em <http://localhost:5173/primitivas>, fora da barra lateral. O selo no topo dela consulta
`/api/health`: se estiver verde, o proxy e a API estão de pé.

## Variáveis de ambiente

Um `.env` só, na raiz, lido pelo `docker compose`, pela API e pelo Vite. **Todas têm default** —
`npm run dev` sobe numa máquina recém-clonada mesmo sem o arquivo. A tabela é o `.env.example`
inteiro; não há variável lida pelo código que não esteja aqui, nem o contrário.

| Variável                    | Default                                             | Quem lê         |
| --------------------------- | --------------------------------------------------- | --------------- |
| `POSTGRES_USER`             | `kikos`                                             | docker compose  |
| `POSTGRES_PASSWORD`         | `kikos`                                             | docker compose  |
| `POSTGRES_DB`               | `kikos_crm`                                         | docker compose  |
| `POSTGRES_PORT`             | `5432`                                              | docker compose  |
| `DATABASE_URL`              | `postgresql://kikos:kikos@localhost:5432/kikos_crm` | API, Prisma CLI |
| `API_PORT`                  | `3333`                                              | API, Vite       |
| `API_HOST`                  | `127.0.0.1`                                         | API             |
| `NODE_ENV`                  | `development`                                       | API             |
| `JWT_SECRET`                | um valor de desenvolvimento                         | API             |
| `ACCESS_TOKEN_TTL_SECONDS`  | `900` (15 minutos)                                  | API             |
| `REFRESH_TOKEN_TTL_SECONDS` | `604800` (7 dias)                                   | API             |
| `REFRESH_COOKIE_PATH`       | `/api/auth/refresh`                                 | API             |
| `BCRYPT_ROUNDS`             | `10` (`4` sob `NODE_ENV=test`)                      | API             |
| `WEB_PORT`                  | `5173`                                              | Vite            |

Três merecem uma linha a mais:

- **`JWT_SECRET`** tem default para que o CRM suba sem configuração, mas com `NODE_ENV=production`
  a API **se recusa a subir** sem ele. Um segredo público em produção é a falha que ninguém
  percebe até ser tarde.
- **`REFRESH_COOKIE_PATH`** inclui o prefixo `/api` porque o `path` de um cookie é comparado
  contra a URL que o _navegador_ pede — e em desenvolvimento o navegador pede ao Vite, que proxia
  `/api` para a API. Quem servir o app web de outro jeito ajusta esta variável.
- **`DATABASE_URL`** precisa bater com as três variáveis de Postgres acima; elas alimentam o
  container, ela alimenta quem se conecta.

## Modelo de dados

Quatro tabelas. O detalhe de cada coluna, com o porquê, está em
[`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma) — os comentários lá são parte
da documentação, não decoração.

```
User ─┬─< Lead ──< Deal ──< Comment
      ├──────────< Deal        │
      └────────────────────────┘
       (owner de Lead e Deal, author de Comment)
```

**User** é a identidade única do sistema — quem faz login _e_ quem recebe Leads e Deals. Não
existe tabela de vendedor: "vendedor" é um User com `role = SELLER` (ADR-0001). Carrega
`tokenVersion`, que é o que dá cancelamento real de sessão (ADR-0004).

**Lead** é o contato comercial: nome, empresa, e-mail, telefone, cargo opcional, `source`,
`ownerId`, `status`, observações, `lastInteractionAt` e `deletedAt`. O **e-mail não é único, de
propósito**: com remoção lógica a linha apagada continuaria ocupando o índice e impediria
recadastrar o mesmo contato.

**Deal** é a oportunidade sobre um Lead: título, `valueInCents`, `leadId`, `ownerId`, `stage`,
`result`, descrição, data prevista, `closedAt`, `lastInteractionAt` e `deletedAt`. Um Lead pode
ter vários Deals — por isso o negócio não é campo do contato.

**Comment** é a linha do tempo do Deal: corpo, `kind` (`USER` ou `SYSTEM`), `dealId`
**obrigatório** e `authorId`. A FK não-nulável, em vez de FKs nuláveis ou de um par tipo/id, é o
que faz o banco garantir a integridade sem que nenhuma leitura precise desambiguar o alvo. Lead
não recebe comentários; tem campo de observações. E **não há `updatedAt` nem `deletedAt`**: a
linha do tempo é registro histórico, e uma coluna que não existe não é escrita por uma rota
distraída.

Três decisões atravessam as quatro tabelas:

- **Identificadores são UUID, com marca nos Schemas.** Um `LeadId` não é aceito onde se espera um
  `DealId`, e a única forma de produzir um é decodificando com o Schema — o que faz um `id`
  malformado virar 400 com o campo apontado, e não uma consulta ao banco.
- **Dinheiro é inteiro em centavos**, no banco, no JSON e no domínio. O `Decimal` do Prisma
  atravessaria o JSON como string e complicaria o Schema; ponto flutuante acumularia erro ao somar
  o funil no dashboard. Reais e centavos só se encontram na borda que desenha
  (`apps/web/src/lib/money.ts`): `formatBRL` divide por cem para mostrar, `parseBRL` multiplica
  por cem para ler. É por isso que o campo "Valor estimado" aceita `12.500,00` e manda `1250000`
  — e recusa o ponto como decimal, porque em português `1.250` são mil duzentos e cinquenta reais
  e ler isso como um real e vinte e cinco seria decidir por quem digitou.
- **Remoção é lógica.** Lead e Deal têm `deletedAt`, e o filtro que exclui apagados mora na camada
  de repositório, **nunca nas rotas** — uma rota que esquecesse faria um registro removido
  reaparecer.

### O contrato HTTP

```
POST   /auth/login          POST /auth/refresh
POST   /auth/logout         GET  /auth/me
GET    /users?role=SELLER
GET    /dashboard/summary

GET    /leads?search&status&ownerId&sortBy&order&page&pageSize
POST   /leads     GET /leads/:id     PUT /leads/:id     DELETE /leads/:id

GET    /deals/board?search&ownerId
GET    /deals?stage&search&ownerId&sortBy&order&page&pageSize
POST   /deals     GET /deals/:id     PUT /deals/:id     DELETE /deals/:id
PATCH  /deals/:id/stage    { stage }
POST   /deals/:id/close    { result }

GET    /deals/:id/comments   POST /deals/:id/comments
```

`PUT` recebe a carga completa editável, espelhando o formulário, o que permite validar a
requisição inteira com um Schema só. `PATCH` e `POST` em sub-recurso são as duas _ações_ do
funil: mover é idempotente e recebe só o destino; encerrar não é, e pedi-lo duas vezes é
justamente o 409.

## Estrutura

```
apps/api        API HTTP — Fastify na borda, Effect no domínio (ADR-0002)
apps/web        App web — React, Vite, Tailwind
packages/domain @kikos/domain — Schemas, erros e regras puras, compartilhados
```

npm workspaces, sem Nx nem Turborepo: dois apps e um pacote não justificam a camada extra.

### O pacote de domínio é browser-safe

**Nada que toque Node, Prisma ou I/O entra em `packages/domain`.** Ele é importado pelo
navegador: é dele que saem os Schemas que validam os formulários e a regra pura que decide se
uma coluna do board aceita o drop, antes de qualquer ida ao servidor.

A regra não depende de disciplina. Duas travas a fazem falhar no CI:

- o `tsconfig.json` do pacote não carrega os tipos do Node (`"types": []`), então um
  `process.env` não compila;
- o ESLint barra os imports de builtins do Node, Prisma, Fastify e bcryptjs dentro do pacote.

Os casos de uso que dependem de repositório vivem em `apps/api`, não aqui.

O pacote é consumido **direto do TypeScript**, sem passo de build: o `exports` aponta para
`src/index.ts` e quem transpila é o Vite, o `tsx` ou o `tsc` de quem importa. Em desenvolvimento
não existe "buildar o domínio antes de subir os apps".

## Effect, com o paralelo em TypeScript comum

Este código é material de estudo, então cada conceito de Effect que aparece leva um comentário
curto com o equivalente aproximado em TypeScript comum. Esta seção é a versão longa dessa mesma
explicação — na ordem em que os conceitos aparecem no código.

### `Effect<A, E, R>` — uma Promise com mais duas colunas

Uma `Promise<A>` diz o que ela devolve se der certo, e nada sobre o que acontece se der errado
ou sobre o que ela precisa para rodar. `Effect<A, E, R>` diz as três coisas:

| Parâmetro | O que é                        | Em TypeScript comum                |
| --------- | ------------------------------ | ---------------------------------- |
| `A`       | o valor de sucesso             | o `T` de `Promise<T>`              |
| `E`       | **as falhas esperadas**        | nada — `throw` não aparece no tipo |
| `R`       | **as dependências que faltam** | nada — o `import` já resolveu      |

Assim:

```ts
const removeLead = (
  id: LeadId,
): Effect.Effect<void, LeadNotFound | LeadHasOpenDeals, LeadRepository | DealRepository> =>
```

A assinatura diz que remover um contato não devolve nada, **falha exatamente de duas formas**, e
não roda enquanto ninguém fornecer os dois repositórios. Nenhuma das três é comentário: se a
função passar a falhar de um terceiro jeito ou a pedir um terceiro serviço, o tipo muda sozinho
e quem chama para de compilar.

A outra diferença é que um Effect **não executa quando é criado**. Uma Promise começa a rodar no
instante em que nasce; um Effect é uma descrição, e alguém precisa mandá-lo rodar — é o que
`makeRunner` faz, uma vez, na borda do Fastify.

### `Effect.gen` — o `async/await` do Effect

```ts
Effect.gen(function* () {
  const users = yield* UserRepository; // como `await`, mas de um Effect
  const owner = yield* users.findById(input.ownerId);
  ...
});
```

`yield*` no lugar de `await`. A diferença que importa é que o `yield*` de um Effect que pode
falhar **acumula a falha no tipo `E` do bloco inteiro** — não existe o equivalente a um `await`
que esquece um `try`.

### `Data.TaggedError` — erro como dado

```ts
export class LeadNotFound extends Data.TaggedError('LeadNotFound')<{
  readonly message: string;
}> {}
```

Em TypeScript comum seria `class LeadNotFound extends Error { readonly _tag = 'LeadNotFound' }`.
As duas diferenças que este projeto usa o tempo todo:

1. o `_tag` entra no **tipo**, então o compilador sabe que um programa falha com
   `LeadNotFound | LeadHasOpenDeals` e nada além disso;
2. a tradução para HTTP acontece num lugar só (`apps/api/src/http/errors.ts`), por `switch`
   exaustivo sobre a tag, com o `default` atribuindo o erro a `never`. **Um erro novo na união
   `DomainError` sem mapeamento quebra `tsc --noEmit` no CI** — em vez de virar 500 em produção.

O mesmo mapa aparece uma segunda vez, do lado do teste: `apps/api/src/flow.test.ts` guarda a
tabela como um `Record<DomainError['_tag'], number>`, que é exaustivo pelo mesmo motivo. Um erro
novo tem de passar pelas duas travas.

| Erro                                            | HTTP |
| ----------------------------------------------- | ---- |
| `ValidationFailed`                              | 400  |
| `InvalidCredentials`, `Unauthorized`            | 401  |
| `LeadNotFound`, `DealNotFound`, `OwnerNotFound` | 404  |
| `DealAlreadyClosed`, `LeadHasOpenDeals`         | 409  |
| `InvalidStageTransition`                        | 422  |

409 e 422 dividem a fronteira assim: **422 é um pedido que não existe** (arrastar para Fechado
não é um movimento do funil), **409 é um pedido legítimo que o estado atual impede** (o negócio
já foi encerrado; o contato ainda tem negócio aberto) — e esse estado muda.

### `Context.Tag` — injeção de dependência que o compilador confere

```ts
export class UserRepository extends Context.Tag('UserRepository')<
  UserRepository,
  { readonly findById: (id: UserId) => Effect.Effect<Option.Option<UserRecord>> }
>() {}
```

A classe é ao mesmo tempo a **chave** (o que um programa pede) e o **tipo do serviço** (o que uma
implementação precisa oferecer). Em TypeScript comum seria uma `interface UserRepository` mais um
contêiner de DI que resolve a implementação — com a diferença de que aqui a dependência aparece
no `R` do programa: um `Effect<A, E, UserRepository>` não roda enquanto alguém não fornecer a
implementação, e isso é verificado em tempo de compilação, não em tempo de boot.

`Option<A>`, que aparece aí, é o `A | null` escrito como dado: `Option.some(valor)` ou
`Option.none()`. Ele não se confunde com um valor legítimo — um `Option<string>` vazio é
distinguível de uma string vazia — e `Option.isNone` obriga a dizer o que fazer nos dois casos.

### `Layer` — a receita que constrói o serviço

Se `Context.Tag` é a interface, `Layer` é a implementação **mais como construí-la**. Em
TypeScript comum seria uma factory (`const makeUserRepository = (prisma) => ({ ... })`) somada à
fiação que decide quem recebe o quê. A diferença é que a Layer também sabe **liberar** o que
abriu, e que compor duas Layers é uma operação, não uma sequência de chamadas na ordem certa:

```ts
export const AppLayerLive: Layer.Layer<AppServices> = Layer.mergeAll(
  UserRepositoryPrisma,
  LeadRepositoryPrisma,
  DealRepositoryPrisma,
  CommentRepositoryPrisma,
);
```

**É aqui que mora a única substituição de teste do projeto.** Cada repositório tem duas Layers —
uma sobre Prisma, uma sobre um `Ref` em memória —, e trocar de uma para a outra é trocar este
objeto. Ver ["Uma seam só"](#uma-seam-só).

### `ManagedRuntime` — a ponte para o Fastify

```ts
export const makeRuntime = (layer: Layer.Layer<AppServices>): AppRuntime =>
  ManagedRuntime.make(layer);
```

A Layer é uma receita; o `ManagedRuntime` a executa **uma vez**, guarda os serviços prontos e
expõe `runPromise`, que roda um programa Effect e devolve uma Promise comum — que é o que um
handler do Fastify sabe esperar. Ele é construído no boot e descartado no shutdown.

A alternativa seria `Effect.provide(AppLayer)` dentro de cada handler, o que reconstruiria o
grafo de dependências — e abriria uma conexão nova com o Postgres — a cada requisição (ADR-0002).

A ponte propriamente dita cabe em quatro linhas, em `apps/api/src/http/run.ts`:

```ts
const outcome = await runtime.runPromise(Effect.either(program));
if (Either.isLeft(outcome)) return sendDomainError(reply, outcome.left);
```

`Effect.either` transforma `Effect<A, E>` em `Effect<Either<A, E>, never>` — o erro **sai do
canal de erro e vira valor**. Depois disso o programa não falha mais, e `runPromise` só rejeita
em caso de defeito (banco fora do ar, bug), que o Fastify transforma em 500. Erro de domínio
nunca vira 500 por acidente.

### `Schema` — validação que também transforma

`Schema` faz o papel que um Zod faria, com uma diferença que este projeto usa o tempo todo: ele
descreve a **transformação** entre a forma que trafega e a forma do domínio, não só a validação.

- O **lado codificado** é o que o `<form>` produz e o que viaja no JSON: tudo string, `""` no que
  ninguém escolheu, datas em ISO.
- O **lado decodificado** é o que o domínio quer: texto aparado, e-mail normalizado, `undefined`
  no opcional em branco, `Date` de verdade, `ownerId` com marca de `UserId`.

`Schema.decodeUnknownSync` vai de um lado ao outro; `Schema.encodeSync` volta. É por isso que a
tela não monta o corpo da requisição à mão, e por isso que a API não escreve o JSON da resposta à
mão — os dois passam pelo mesmo objeto, importado do mesmo pacote.

E é o que permite a coisa mais concreta do monorepo: **um Schema, duas pontas**. O formulário
"Criar Novo Lead" e o corpo de `POST /leads` são validados pelo mesmo `CreateLeadInput`
(`packages/domain/src/lead.ts`) — no navegador via `@hookform/resolvers/effect-ts`, na API via
`decodeBody`. Campo obrigatório em branco e e-mail malformado são apontados junto do campo antes
de qualquer ida ao servidor, e recusados de novo, pela mesma regra, se alguém enviar a requisição
por fora da tela.

Sobram para o servidor as duas coisas que o navegador não tem como saber: se o vendedor
responsável escolhido ainda existe — senão `OwnerNotFound`, 404 — e com que status e com que data
o contato nasce. "Novo, agora" é regra do CRM, e é por isso que nenhum dos dois campos existe no
Schema de entrada: não há como o corpo da requisição escolhê-los.

### `Clock` — o tempo como serviço

Nenhuma escrita do domínio chama `new Date()`. A hora vem de `Clock.currentTimeMillis`, que é um
serviço do runtime como os repositórios — a diferença é que este já vem pronto na biblioteca. O
ganho aparece quando uma regra depende do tempo (`closedAt`, `lastInteractionAt`): quem testa
troca o relógio por `TestClock` e a data para de variar, sem que o código sob teste precise saber
que está sendo testado.

## As decisões

### Effect no domínio, Fastify na borda (ADR-0002)

Effect fica onde rende: o núcleo de domínio, os erros e a validação. A borda HTTP e o acesso a
dados são pragmáticos. Poucas coisas bem-feitas e bem explicadas valem mais que Effect meia-boca
espalhado por toda a pilha.

Concretamente, `@effect/platform` HttpApi ficou de fora porque essa parte da biblioteca ainda é
marcada como instável, e um servidor que não sobe custa mais do que a elegância de ter Effect
ponta a ponta rende. O que se ganha com a escolha é o que está acima: toda política de erro HTTP
num arquivo só, verificada pelo compilador, e uma seam de teste que dispensa banco.

O que se paga está registrado em [ADR-0002](./docs/adr/0002-effect-in-domain-fastify-at-the-edge.md):
**um caso de uso que escreve em dois repositórios não escreve numa transação só.** Uma transação
teria de ser um serviço acima dos repositórios, e seria justamente a peça que a Layer em memória
não saberia satisfazer sem virar um banco de mentira. O pior caso é o `status` do Lead ficar um
passo atrás do Deal; como a regra é "último evento vence" e não um acumulador, a ação seguinte
corrige — **exceto no encerramento**, que é a última ação daquele negócio e por isso não tem
seguinte. É o custo conhecido, e ele foi aceito para manter os testes de rota sem Postgres.

### Prisma atrás de serviços Effect

O Prisma não aparece em rota nenhuma. Ele vive dentro das Layers `*RepositoryPrisma`, atrás dos
`Context.Tag`, e é a **única coisa acima da seam** — abaixo dela roda todo o resto.

A consequência prática está em `apps/api/src/repositories/`: cada repositório é um par de
arquivos, o `Tag` com a interface e a Layer de Prisma que a satisfaz, mais a Layer em memória.
Nenhum método tem canal de erro: "não encontrado" é um `Option`, e banco fora do ar é **defeito**,
não erro de domínio — vira 500, e não um `case` a mais no `switch`.

É também onde mora o filtro de remoção lógica, e não nas rotas. Uma rota que esquecesse o
`deletedAt: null` faria um registro removido reaparecer; um repositório que o esquece falha em
todos os testes de uma vez.

### Uma entidade `User` só (ADR-0001)

Um CRM normalmente separa "quem faz login" de "a quem o trabalho é atribuído". Aqui não: os
mockups mostram vendedores assinando comentários na linha do tempo, ou seja, vendedor é usuário
do sistema. Duas tabelas criariam duas linhas para a mesma pessoa e obrigariam todo código de
atribuição e autoria a escolher qual das duas usar.

Então há uma tabela `User` com `role: MANAGER | SELLER`, e:

- a tela "Vendedores" é uma consulta por `role` (`GET /users?role=SELLER`), não uma entidade;
- as iniciais do avatar são derivadas do `name` na exibição; não existe coluna `initials`;
- **`role` é rótulo, não permissão.** Autorização é binária: qualquer User autenticado enxerga e
  altera tudo. Se controle de acesso por papel entrar em escopo depois, o campo já está no lugar
  certo.

### Stage e Result são ortogonais (ADR-0003)

Um Deal tem duas dimensões independentes: onde ele está no funil, e se ele terminou e como.

```
NEW ⇄ CONTACT_MADE ⇄ PROPOSAL_SENT ⇄ NEGOTIATION    livre nos dois sentidos
move(qualquer, CLOSED) → InvalidStageTransition     422
move(fechado, _)       → DealAlreadyClosed          409
```

`CLOSED` não é destino de movimentação: chega-se nele marcando Ganho ou Perdido, e encerrar
preenche `result`, `closedAt` e `stage` **numa operação só**. É isso que torna inalcançável o
estado "estágio Fechado com resultado em aberto" — e é essa impossibilidade que permite à coluna
Fechado sempre saber pintar cada card de verde ou vermelho.

A regra que decide tudo isso é uma função pura de cinco linhas no pacote compartilhado
(`refuseStageMove`, em `packages/domain/src/pipeline.ts`), e é o argumento mais concreto a favor
do pacote:

**As duas pontas chamam esta mesma função.** No navegador ela é lida através de `stageDrop`, que
traduz a regra no que o **gesto** significa: mover, encerrar, ou recusar. A coluna só chama
`preventDefault` no `dragover` quando o gesto é aceito — e no arrasta-e-solta nativo não chamar
significa que o drop **não acontece**. A recusa não é um `if` dentro do drop; é a ausência do drop.
No servidor, a rota consulta a regra crua antes de escrever, para quem enviar por fora da tela. E a
frase que explica cada recusa mora ao lado da regra (`STAGE_MOVE_REFUSALS`), então o aviso do board
é, literalmente, o mesmo texto que a API devolveria.

Vale ser preciso sobre uma coisa que mudou de forma no caminho: **a coluna Fechado aceita o drop.**
`refuseStageMove` recusa aquele destino com `InvalidStageTransition`, mas `stageDrop` lê essa
recusa como `close` — soltar ali é justamente o gesto que abre a escolha entre Ganho e Perdido. E
como um card encerrado nasce com `draggable={false}`, a outra recusa (`DealAlreadyClosed`) também
não chega a acontecer por arrasto. Na prática o 422 e o 409 desta regra são respostas para quem
chama a API por fora da tela — que é onde o teste de fluxo os exercita.

Mover é também a **única escrita otimista do CRM**. O card muda de coluna no instante do gesto,
antes da resposta; se o servidor recusar, o cache volta ao retrato de antes e o card retorna à
origem com o motivo à vista. As funções que fazem essa previsão (`apps/web/src/lib/board.ts`) são
puras e testadas — é o único lugar em que a tela recorta dados, e um card duplicado ou um contador
negativo ali duraria o tempo de uma requisição e ninguém conseguiria reproduzir depois.

O card também se move por um `<select>` de estágio, e não só arrastando. Arrastar-e-soltar nativo
não tem história de teclado nenhuma: sem essa segunda porta, a tela de Negócios ficaria inoperável
para quem usa teclado ou leitor de tela. Ela foi construída primeiro, e o arrasto veio por cima.

Duas fronteiras da regra valem registro, porque são o que ela **não** recusa:

- **comentar num negócio fechado é permitido**, e leva junto a última interação. A recusa é sobre
  mudar o desfecho, não sobre acrescentar ao histórico — sem isso ninguém poderia anotar por que a
  venda foi perdida, que é justamente o que se quer ler depois;
- **remover um negócio fechado também é permitido.** A remoção lógica retira o registro inteiro,
  que é o que se quer de um negócio cadastrado por engano — inclusive de um encerrado por engano
  junto.

### JWT próprio, em cookie `httpOnly`, com `tokenVersion` (ADR-0004)

Login com e-mail e senha, sem provedor externo.

- Os tokens viajam em cookies **`httpOnly`** — o JavaScript da página não os enxerga, ao contrário
  do que aconteceria com `localStorage`. Como o Vite proxia `/api`, tudo é same-origin e não há
  CORS com credenciais nem `SameSite=None`.
- São dois: um **access de 15 minutos** e um **refresh de 7 dias**, este restrito por `path` à
  rota que o consome — um cookie a menos viajando em toda requisição é uma superfície a menos. A
  renovação reemite **só o access**, de modo que os 7 dias contam a partir da senha digitada e não
  deslizam para sempre.
- **`User.tokenVersion` é o que dá cancelamento real.** JWT é stateless, então um token roubado
  valeria até expirar. O número entra no payload assinado e é conferido contra o banco **a cada
  requisição**; o logout incrementa a coluna, o que invalida de verdade todos os tokens daquele
  User — em vez de apenas pedir ao navegador que esqueça o cookie. O custo é uma busca por chave
  primária por requisição, e o User já é necessário para autoria de comentários.
- No app web, `apiJson` concentra a renovação: ao receber 401 ele renova e refaz a chamada, e
  requisições concorrentes **compartilham uma única promise** de renovação. Três telas que expirem
  juntas disparam uma chamada a `/auth/refresh`, não três.
- Hash de senha com `bcryptjs`, escolhido por ser JS puro: `argon2` exigiria toolchain de
  compilação na máquina de quem clona o repositório.

A alternativa mais barata — só um access de 7 dias — cobriria o requisito com muito menos código,
e num backend único com cookie `httpOnly` a diferença de segurança real seria pequena. Foi
rejeitada por decisão explícita de demonstrar o padrão completo.

### Consulta sempre no servidor

Busca, filtro, ordenação e paginação acontecem no banco, sem exceção. O app web recorta dados em
tela num arquivo só — `apps/web/src/lib/board.ts` —, e o que ele faz ali não é consulta: é a
previsão otimista do card arrastado, desfeita assim que o servidor responde. As listagens respondem
`{ data, page, pageSize, total }`, e é o `total` que alimenta o contador — ele descreve o recorte
inteiro, não as linhas que couberam na página.

Duas consequências que valem registrar:

- Os parâmetros de consulta são Schemas do pacote compartilhado. `sortBy` e `status` são uniões
  fechadas, então nada do que alguém digitar na URL chega perto de virar coluna num `ORDER BY` —
  e um `?page=0` é recusado com 400 e o campo culpado apontado, como um formulário inválido.
- Toda ordenação carrega o `id` como último critério. Sem uma ordem total, duas linhas empatadas
  podem trocar de lugar entre a consulta da página 1 e a da página 2, e um registro some ou
  aparece duas vezes.

No app web, a busca é atrasada em 300ms: digitar "ritmo" dispara uma requisição, não cinco.

#### O board é o caso especial

Um kanban não tem "página 2": as cinco colunas são cinco recortes que o vendedor olha ao mesmo
tempo. Por isso `GET /deals/board` existe separado da listagem e devolve as cinco de uma vez, cada
uma com a sua primeira leva de cards **e com o total real da coluna** — que é o número do
cabeçalho. Contar os cards recebidos daria 5 numa coluna de 7, e a coluna mais cheia do funil
seria justamente a que anunciaria o número menor.

O board, porém, não tem consulta própria: ele é `GET /deals` rodado cinco vezes com o Stage fixado
(`boardColumnQuery`, em `apps/api/src/repositories/DealRepository.ts`). É daí que sai a garantia de
que o "carregar mais" de uma coluna continua de onde ela parou — mesma ordem, mesmo tamanho de
página, e o `id` como desempate. O tamanho da leva vive no pacote compartilhado
(`BOARD_COLUMN_PAGE_SIZE`), porque as duas pontas precisam concordar sobre ele.

Essa mesma listagem paginada é a que a tabela de negócios do dashboard consome — ela nasceu no
board completa, em vez de virar um endpoint paralelo depois.

#### O dashboard agrega no banco

`GET /dashboard/summary` devolve o funil por Stage e o comparativo por responsável em `GROUP BY`,
não somando linhas em memória. O que o `GROUP BY` não sabe decidir é **quem aparece no segundo
gráfico**, e a resposta é o time inteiro: quem não fechou nada aparece com a linha em zero — que é
justamente o que um gráfico de performance existe para mostrar —, e a soma dos dois gráficos
fecha. A ordem é alfabética, e não um ranking: uma barra que troca de lugar a cada venda fechada
obrigaria a reler o eixo inteiro toda vez.

### O status do Lead é sincronizado, não derivado

O `status` é coluna própria, escrita pelo domínio nas ações de Deal, com a regra **"último evento
vence"**:

```
Lead criado                                 → NEW
Deal criado para o Lead                     → CONTACT
Deal movido p/ PROPOSAL_SENT ou NEGOTIATION → NEGOTIATION
Deal fechado como ganho                     → WON
Deal fechado como perdido                   → LOST
```

Derivar na leitura exigiria regra de precedência entre múltiplos Deals do mesmo Lead e agregação
em toda listagem; deixar manual faria a lista de Leads divergir visivelmente do board.

A "última interação" segue o mesmo desenho — coluna em Lead e Deal, escrita pelas ações do
domínio (criação, comentário, mudança de Stage e fechamento), e não derivada do comentário mais
recente. Note o que **não** está nessa lista: editar. Uma carteira ordenada por última interação
mostraria como "trabalhado hoje" o contato em que alguém só arrumou um cargo errado.

### Idioma

Código, banco, enums e Schemas em inglês. Textos de interface em português, num mapa único de
rótulos por enum, sem biblioteca de internacionalização. Conteúdo de git — mensagens de commit,
nomes de branch, descrições de PR — em inglês.

## Scripts

| Comando                | O que faz                                  |
| ---------------------- | ------------------------------------------ |
| `npm run dev`          | API e web juntos                           |
| `npm run dev:api`      | só a API                                   |
| `npm run dev:web`      | só o app web                               |
| `npm run lint`         | ESLint em tudo                             |
| `npm run format:check` | Prettier em modo verificação               |
| `npm run typecheck`    | `tsc --noEmit` em cada workspace           |
| `npm test`             | Vitest em tudo                             |
| `npm run check`        | os quatro acima, na ordem em que o CI roda |
| `npm run db:up`        | sobe o Postgres                            |
| `npm run db:down`      | derruba o Postgres                         |
| `npm run db:migrate`   | aplica as migrations                       |
| `npm run db:seed`      | popula o banco com os dados de exemplo     |
| `npm run db:reset`     | derruba, recria e popula o banco           |

## Testes e CI

Os testes usam [`@effect/vitest`](https://effect.website): `it.effect` para o que devolve um
Effect, `it` comum para função pura e para resposta HTTP — que já é uma Promise. Ficam ao lado do
código, em `src/**/*.test.ts`.

O workflow em `.github/workflows/ci.yml` roda lint, formatação, tipos e testes a cada push e pull
request — **sem serviço de banco**.

### Uma seam só

Os repositórios de User, Lead, Deal e Comment são `Context.Tag`, satisfeitos por duas Layers
alternativas: uma sobre Prisma e uma sobre estruturas em memória. **Essa é a única substituição do
projeto** — não há mock de rota, de Schema, de bcrypt nem de JWT.

Ela é a seam mais alta possível: abaixo dela roda tudo — rotas Fastify, validação de Schema,
middleware de autenticação, tradução de erro para HTTP e as regras de domínio. Acima dela sobra
apenas o Prisma. É por isso que os testes de API não precisam de banco, e é por isso que passar
neles quer dizer alguma coisa.

A única outra substituição é o `Clock` do Effect pelo `TestClock`, e não é seam nova — vem pronta
na biblioteca.

### O teste de fluxo

`apps/api/src/flow.test.ts` é o arquivo que cobre **a ligação entre HTTP e domínio**, que nenhum
teste de regra alcança. Ele sobe o Fastify inteiro com a Layer em memória e percorre uma sessão
só, do login à remoção, em que cada passo depende do que o anterior gravou de verdade:

```
POST   /auth/login                       200 + cookies
GET    /leads sem cookie                 401
POST   /leads                            201
POST   /deals                            201
PATCH  /deals/:id/stage                  200
PATCH  /deals/:id/stage → CLOSED         422
POST   /deals/:id/comments               201
DELETE /leads/:id (com negócio aberto)   409
POST   /deals/:id/close                  200
POST   /deals/:id/close (de novo)        409
DELETE /leads/:id (já encerrado)         204
```

E percorre o mapa de erro inteiro, uma requisição por tag, com a tabela guardada como um
`Record<DomainError['_tag'], number>` — exaustivo por construção, como o `switch` que traduz.

### O que não tem cobertura

Sem Postgres no CI, as queries do Prisma não têm teste automatizado. É trade-off consciente:
cobri-las exigiria migration, serviço de banco no job e limpeza de estado entre testes. Também não
há teste de componente de UI nem end-to-end de navegador.

Onde as duas Layers podem discordar sem que teste algum veja, a divergência foi fechada na origem
— a ordenação de texto, por uma collation ICU no banco; os curingas do `LIKE`, por escape no
repositório de Prisma. Para conferir esse caminho à mão, com o banco de pé e o seed aplicado:

```bash
curl -s -c /tmp/kikos.txt -X POST localhost:3333/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rodrigo.ramos@kikos.com.br","password":"kikos123"}' > /dev/null

curl -s -b /tmp/kikos.txt 'localhost:3333/leads?search=_'      # total 0, não 14
curl -s -b /tmp/kikos.txt 'localhost:3333/leads?search=ritmo'  # total 2

# A inserção também só existe na Layer de Prisma. O responsável precisa ser um
# vendedor de verdade — daí a primeira chamada.
curl -s -b /tmp/kikos.txt 'localhost:3333/users?role=SELLER'   # copie um "id"
curl -s -b /tmp/kikos.txt -X POST localhost:3333/leads \
  -H 'Content-Type: application/json' \
  -d '{"name":"Teste Prisma","company":"Academia Teste","email":"teste@academiateste.com.br",
       "phone":"(11) 90000-0000","source":"WEBSITE","ownerId":"COLE_O_ID_AQUI"}'
# 201, status "NEW", e o contato passa a aparecer em ?search=teste

# O board: cinco colunas, e a de Proposta enviada com sete negócios mostrando
# cinco cards — é o total do servidor, não o tamanho do array.
curl -s -b /tmp/kikos.txt 'localhost:3333/deals/board' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const c of JSON.parse(s).columns)console.log(c.stage,c.total,c.deals.length)})"

# O "carregar mais": a página 2 continua a coluna, sem repetir card.
curl -s -b /tmp/kikos.txt 'localhost:3333/deals?stage=PROPOSAL_SENT&pageSize=5&page=2'

# A busca do board atravessa o JOIN: "bodytech" é a empresa do Lead, não o
# título do negócio.
curl -s -b /tmp/kikos.txt 'localhost:3333/deals?search=bodytech'

# A inserção de negócio, que também só existe na Layer de Prisma. Pegue um
# "id" de Lead e um de vendedor das duas consultas acima.
curl -s -b /tmp/kikos.txt 'localhost:3333/leads?search=juliana'
curl -s -b /tmp/kikos.txt -X POST localhost:3333/deals \
  -H 'Content-Type: application/json' \
  -d '{"title":"Teste Prisma","valueInCents":1250000,"stage":"NEW",
       "leadId":"COLE_O_ID_DO_LEAD","ownerId":"COLE_O_ID_DO_VENDEDOR"}'
# 201, e o Lead vinculado passa a aparecer com status "CONTACT" em /leads

# O negócio não nasce fechado: 422, e nada é criado.
curl -s -b /tmp/kikos.txt -X POST localhost:3333/deals \
  -H 'Content-Type: application/json' \
  -d '{"title":"Teste 422","valueInCents":1000,"stage":"CLOSED",
       "leadId":"COLE_O_ID_DO_LEAD","ownerId":"COLE_O_ID_DO_VENDEDOR"}'

# A movimentação, que na Layer de Prisma é um `update` com a cláusula de
# remoção no `where`. Pegue o "id" de um negócio em aberto do board.
curl -s -b /tmp/kikos.txt -X PATCH localhost:3333/deals/COLE_O_ID_DO_NEGOCIO/stage \
  -H 'Content-Type: application/json' -d '{"stage":"PROPOSAL_SENT"}'
# 200 com o card, e o Lead vinculado passa a "NEGOTIATION" em /leads

# Arrastar para Fechado não existe: 422, e o negócio não sai do lugar.
curl -s -b /tmp/kikos.txt -X PATCH localhost:3333/deals/COLE_O_ID_DO_NEGOCIO/stage \
  -H 'Content-Type: application/json' -d '{"stage":"CLOSED"}'

# Negócio encerrado não se move: 409. Pegue um "id" da coluna Fechado.
curl -s -b /tmp/kikos.txt -X PATCH localhost:3333/deals/COLE_O_ID_DO_FECHADO/stage \
  -H 'Content-Type: application/json' -d '{"stage":"NEGOTIATION"}'

# Encerrar: 200 e o card volta com resultado e data. Encerrar de novo: 409.
curl -s -b /tmp/kikos.txt -X POST localhost:3333/deals/COLE_O_ID_DO_NEGOCIO/close \
  -H 'Content-Type: application/json' -d '{"result":"WON"}'

# Remover um contato com negócio em aberto: 409, com o número que trava.
curl -s -b /tmp/kikos.txt -X DELETE localhost:3333/leads/COLE_O_ID_DO_LEAD

# O dashboard, agregado no banco.
curl -s -b /tmp/kikos.txt 'localhost:3333/dashboard/summary'
```

## Fora de escopo

Escolhas conscientes, não pendências esquecidas:

- **Integração de IA.** A camada de comentários fica isolada num módulo próprio, com repositório
  próprio embaixo, justamente para que ler o histórico e acrescentar um registro sejam plugáveis
  depois — mas nada de IA foi construído.
- **Deploy, CD, Kubernetes e imagem Docker de produção.** O `docker-compose` sobe apenas o
  Postgres de desenvolvimento. CI de qualidade e testes está em escopo, e roda.
- **OAuth / "Login via Google Workspace"** e **"Esqueceu sua senha?"** — os dois botões do mockup
  são decorativos.
- **CRUD de User.** Usuários vêm do seed, e a tela de Vendedores seria somente leitura.
- **Controle de acesso por papel.** Qualquer User autenticado vê e altera tudo.
- **Revogação de sessão individual por dispositivo.** `tokenVersion` derruba todas as sessões do
  User de uma vez.
- **Editar ou remover comentários, e reabrir Deal encerrado.**
- **Comentários em Lead** — ele tem campo de observações.
- **Identificador amigável de Deal** no formato `#KK-9843`, visto no mockup.
- **Notificações, e-mail, upload, exportação, campos personalizados, múltiplos pipelines.**
- **Fidelidade pixel-perfect ao Figma.** A identidade visual é reconhecível; o layout exato não
  era requisito.
- **A tela de Vendedores**, cuja fatia era explicitamente opcional e não coube no tempo. O item da
  barra lateral leva a um marcador; o endpoint que a alimentaria já existe e é consumido pelos
  filtros e formulários.

## O que seria diferente em produção

- **`argon2` no lugar de `bcryptjs`.** A escolha atual é por conveniência de quem avalia: `bcryptjs`
  é JS puro e instala sem toolchain de compilação. Em produção o custo de build é irrelevante e
  `argon2id` é a recomendação atual.
- **Revogação de sessão individual**, com uma tabela `RefreshToken`, rotação e detecção de reuso.
  Hoje sair num navegador derruba as sessões daquele User em todos os outros.
- **Testes contra banco real**, num job de CI com serviço de Postgres, cobrindo as queries do
  Prisma — a única parte da pilha que a seam de teste deixa descoberta. É a lacuna que mais
  incomoda das três.
- **Transação por caso de uso**, resolvendo o custo registrado em ADR-0002 — provavelmente com um
  serviço de unidade de trabalho acima dos repositórios, e uma implementação em memória que a
  satisfaça sem virar um banco de mentira.
- **Segredos fora do `.env`**, num gerenciador de segredos, e `JWT_SECRET` rotacionável sem
  derrubar todas as sessões.
- **Índices revisados contra `EXPLAIN` de verdade.** Os que existem foram desenhados a partir dos
  recortes que as telas pedem, e não medidos sob volume.
