# Kikos CRM

CRM de vendas da Kikos Fitness: o time comercial registra Leads, abre Deals sobre eles e
acompanha esses negócios por um Pipeline até ganhar ou perder.

O vocabulário do domínio está em [`CONTEXT.md`](./CONTEXT.md); as decisões de arquitetura,
em [`docs/adr/`](./docs/adr/).

## Como rodar

Pré-requisitos: **Node 22+** e **Docker**.

```bash
npm install          # instala os três workspaces de uma vez
cp .env.example .env # um .env único serve o monorepo inteiro
docker compose up -d # sobe o Postgres
npm run db:migrate   # cria as tabelas
npm run db:seed      # popula o banco com os usuários de exemplo
npm run dev          # sobe a API e o app web juntos
```

O `docker compose` cria o banco com collation **ICU pt-BR**, para que ordenar a lista por nome
não jogue "Álvaro" depois de "Zeta". O `initdb` só roda com o volume vazio: quem já tinha o
Postgres de pé antes disso precisa de um `docker compose down -v` antes do `up`, e depois refaz
`db:migrate` e `db:seed`.

| O quê    | Endereço                                   |
| -------- | ------------------------------------------ |
| App web  | http://localhost:5173                      |
| API      | http://localhost:3333 (saúde em `/health`) |
| Postgres | `localhost:5432`, banco `kikos_crm`        |

Em desenvolvimento o Vite proxia `/api` para a API, então o navegador fala com uma origem só.
O prefixo `/api` é convenção do proxy: a API serve o contrato sem prefixo (`/health`,
`/auth/login`, `/leads`…).

### Credenciais de exemplo

O seed cria um gestor, três vendedores, catorze Leads e vinte e um Negócios. A senha de todos é
**`kikos123`**:

| E-mail                       | Nome               | Papel     |
| ---------------------------- | ------------------ | --------- |
| `rodrigo.ramos@kikos.com.br` | Rodrigo Ramos      | `MANAGER` |
| `ana.nogueira@kikos.com.br`  | Ana Paula Nogueira | `SELLER`  |
| `caio.brida@kikos.com.br`    | Caio Brida         | `SELLER`  |
| `maria.silva@kikos.com.br`   | Maria da Silva     | `SELLER`  |

Depois de entrar, a barra lateral leva a Dashboard, Leads, Negócios e Vendedores. **Leads** é a
carteira, com busca, filtros, ordenação e paginação, e o botão "Criar Novo Lead" que cadastra um
contato. **Negócios** é o funil como board, com uma coluna por Stage; ainda é só leitura —
arrastar, abrir e encerrar chegam nas fatias seguintes, como Dashboard e Vendedores. A
**vitrine das primitivas** da fatia 01 (botão, campo, selo, avatar, modal e tabela nas suas
variações) continua em <http://localhost:5173/primitivas>; o selo no topo dela consulta
`/api/health`, e se estiver verde o proxy e a API estão de pé.

## Consulta sempre no servidor

Busca, filtro, ordenação e paginação acontecem no banco, sem exceção — não existe `filter`,
`sort` nem `slice` sobre os dados em tela nenhuma. As listagens respondem
`{ data, page, pageSize, total }`, e é o `total` que alimenta o contador: ele descreve o recorte
inteiro, não as linhas que couberam na página.

Duas consequências que valem registrar:

- Os parâmetros de consulta são Schemas do pacote compartilhado. `sortBy` e `status` são uniões
  fechadas, então nada do que alguém digitar na URL chega perto de virar coluna num `ORDER BY` —
  e um `?page=0` é recusado com 400 e o campo culpado apontado, como um formulário inválido.
- Toda ordenação carrega o `id` como último critério. Sem uma ordem total, duas linhas empatadas
  podem trocar de lugar entre a consulta da página 1 e a da página 2, e um registro some ou
  aparece duas vezes.

No app web, a busca é atrasada em 300ms: digitar "ritmo" dispara uma requisição, não cinco.

### O board é o caso especial

Um kanban não tem "página 2": as cinco colunas são cinco recortes que o vendedor olha ao mesmo
tempo. Por isso `GET /deals/board` existe separado da listagem e devolve as cinco de uma vez,
cada uma com a sua primeira leva de cards **e com o total real da coluna** — que é o número do
cabeçalho. Contar os cards recebidos daria 5 numa coluna de 7, e a coluna mais cheia do funil
seria justamente a que anunciaria o número menor.

O board, porém, não tem consulta própria: ele é `GET /deals` rodado cinco vezes com o Stage
fixado (`boardColumnQuery`, em `apps/api/src/repositories/DealRepository.ts`). É daí que sai a
garantia de que o "carregar mais" de uma coluna continua de onde ela parou — mesma ordem, mesmo
tamanho de página, e o `id` como desempate. O tamanho da leva vive no pacote compartilhado
(`BOARD_COLUMN_PAGE_SIZE`), porque as duas pontas precisam concordar sobre ele.

Essa mesma listagem paginada é a que a tabela de negócios do dashboard vai consumir. Ela nasceu
aqui completa — busca, filtro por Stage e por vendedor, ordenação e paginação — em vez de virar
um endpoint paralelo depois.

### Dinheiro é inteiro em centavos

Valores monetários são `Int` em centavos no banco, no JSON e no domínio. O `Decimal` do Prisma
atravessaria o JSON como string e complicaria o Schema; ponto flutuante acumularia erro ao somar
o funil no dashboard. A divisão por cem acontece num lugar só, na borda que desenha —
`formatBRL`, em `apps/web/src/lib/money.ts`.

## Um Schema, duas pontas

O formulário "Criar Novo Lead" e o corpo de `POST /leads` são validados pelo **mesmo objeto**:
`CreateLeadInput`, em `packages/domain/src/lead.ts`. No navegador ele entra no react-hook-form
por `@hookform/resolvers/effect-ts`; na API, pelo `decodeBody` da rota. Campo obrigatório em
branco e e-mail malformado são apontados junto do campo antes de qualquer ida ao servidor — e
recusados de novo, pela mesma regra, se alguém enviar a requisição por fora da tela.

`Schema` faz aqui o papel que um Zod faria, com uma diferença que este cadastro usa o tempo
todo: ele descreve a **transformação** entre a forma que trafega e a forma do domínio, não só a
validação. O lado codificado é o que o `<form>` produz — tudo string, `""` no que ninguém
escolheu. O lado decodificado é o que o domínio quer — texto aparado, e-mail normalizado,
`undefined` no opcional em branco, `ownerId` com marca de `UserId`. Na hora de enviar, o mesmo
Schema faz o caminho de volta com `Schema.encodeSync`, em vez de a tela montar o corpo à mão.

Sobram para o servidor as duas coisas que o navegador não tem como saber: se o vendedor
responsável escolhido ainda existe — senão `OwnerNotFound`, 404 — e com que status e com que
data o contato nasce. "Novo, agora" é regra do CRM, e é por isso que nenhum dos dois campos
existe no Schema de entrada: não há como o corpo da requisição escolhê-los.

## Estrutura

```
apps/api        API HTTP — Fastify na borda, Effect no domínio (ADR-0002)
apps/web        App web — React, Vite, Tailwind
packages/domain @kikos/domain — Schemas, erros e regras puras, compartilhados
```

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

## Autenticação

Login com e-mail e senha, JWT próprio, sem provedor externo. O raciocínio completo está em
[ADR-0004](./docs/adr/0004-httponly-cookies-with-token-version.md); em resumo:

- Os tokens viajam em cookies **`httpOnly`** — o JavaScript da página não os enxerga, ao
  contrário do que aconteceria com `localStorage`. Como o Vite proxia `/api`, tudo é same-origin
  e não há CORS com credenciais.
- São dois: um **access de 15 minutos** e um **refresh de 7 dias**, este restrito por `path` à
  rota que o consome. O `path` do cookie inclui o prefixo `/api` porque o navegador o compara
  com a URL que pede ao Vite, não com a rota que a API serve.
- `User.tokenVersion` entra no payload assinado e é conferido contra o banco **a cada
  requisição**. O logout incrementa a coluna, o que invalida de verdade todos os tokens daquele
  User — em vez de apenas pedir ao navegador que esqueça o cookie.
- No app web, `apiJson` concentra a renovação: ao receber 401 ele renova e refaz a chamada, e
  requisições concorrentes **compartilham uma única promise** de renovação. Três telas que
  expirem juntas disparam uma chamada a `/auth/refresh`, não três.
- Hash de senha com `bcryptjs`, escolhido por ser JS puro: `argon2` exigiria toolchain de
  compilação na máquina de quem clona o repositório.

Autorização é binária: qualquer User autenticado enxerga e altera tudo. `role` é rótulo para
listar vendedores, não regra de acesso (ADR-0001).

### Erros como dados

Todo erro de domínio é um `Data.TaggedError` em `packages/domain/src/errors.ts`, e a tradução
para HTTP acontece num único lugar — `apps/api/src/http/errors.ts` — por `switch` exaustivo sobre
a tag. Um erro novo acrescentado à união `DomainError` sem mapeamento **quebra `tsc --noEmit` no
CI**, em vez de virar 500 em produção. É o valor concreto de tratar erro como dado, e o mapa
cresce a cada fatia.

## Testes e CI

Os testes usam [`@effect/vitest`](https://effect.website): `it.effect` para o que devolve um
Effect, `it` comum para função pura. Ficam ao lado do código, em `src/**/*.test.ts`.

O workflow em `.github/workflows/ci.yml` roda lint, formatação, tipos e testes a cada push e
pull request — **sem serviço de banco**. Isso é possível porque os repositórios são
`Context.Tag` com uma Layer em memória alternativa à de Prisma: os testes de API exercitam
rota, Schema, autenticação e mapa de erro sem Postgres nenhum (ADR-0002).

O trade-off é consciente: as queries do Prisma não têm cobertura automatizada. Onde as duas
Layers podem discordar sem que teste algum veja, a divergência foi fechada na origem — a
ordenação de texto, por uma collation ICU no banco; os curingas do `LIKE`, por escape no
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
```

## Effect

O projeto usa Effect-TS onde ele rende — domínio, erros e validação — e Fastify comum no
transporte HTTP. O raciocínio está em
[ADR-0002](./docs/adr/0002-effect-in-domain-fastify-at-the-edge.md).

Como este código também é material de estudo, todo conceito de Effect que aparece leva um
comentário curto com o equivalente aproximado em TypeScript comum.
