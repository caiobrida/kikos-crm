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

Abrir <http://localhost:5173> mostra hoje a **página de demonstração das primitivas** — botão,
campo, selo, avatar, modal e tabela nas suas variações. É a fundação visual que as telas do CRM
reusam. O selo no topo da página consulta `/api/health`: se ele estiver verde, o proxy e a API
estão de pé.

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
