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

| O quê    | Endereço                                   |
| -------- | ------------------------------------------ |
| App web  | http://localhost:5173                      |
| API      | http://localhost:3333 (saúde em `/health`) |
| Postgres | `localhost:5432`, banco `kikos_crm`        |

Em desenvolvimento o Vite proxia `/api` para a API, então o navegador fala com uma origem só.
O prefixo `/api` é convenção do proxy: a API serve o contrato sem prefixo (`/health`,
`/auth/login`, `/leads`…).

### Credenciais de exemplo

O seed cria um gestor, três vendedores e catorze Leads. A senha de todos é **`kikos123`**:

| E-mail                       | Nome               | Papel     |
| ---------------------------- | ------------------ | --------- |
| `rodrigo.ramos@kikos.com.br` | Rodrigo Ramos      | `MANAGER` |
| `ana.nogueira@kikos.com.br`  | Ana Paula Nogueira | `SELLER`  |
| `caio.brida@kikos.com.br`    | Caio Brida         | `SELLER`  |
| `maria.silva@kikos.com.br`   | Maria da Silva     | `SELLER`  |

Depois de entrar, a barra lateral leva a Dashboard, Leads, Negócios e Vendedores. **Leads** é a
primeira tela de dados pronta; Dashboard, Negócios e Vendedores vêm nas fatias seguintes. A
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

O trade-off é consciente: as queries do Prisma não têm cobertura automatizada.

## Effect

O projeto usa Effect-TS onde ele rende — domínio, erros e validação — e Fastify comum no
transporte HTTP. O raciocínio está em
[ADR-0002](./docs/adr/0002-effect-in-domain-fastify-at-the-edge.md).

Como este código também é material de estudo, todo conceito de Effect que aparece leva um
comentário curto com o equivalente aproximado em TypeScript comum.
