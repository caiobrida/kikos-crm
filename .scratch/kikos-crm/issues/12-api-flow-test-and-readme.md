# 12 — Teste de fluxo pela API e README final

**What to build:** quem clona o repositório do zero, segue só o README e chega ao CRM
funcionando com dados — sem descobrir passo nenhum por tentativa. E a suíte passa a cobrir a
única coisa que os testes de regra não alcançam: a ligação entre HTTP e domínio.

**Blocked by:** 10, 11

**Status:** done

**Branch:** `chore/api-flow-test-and-docs`

- [x] O teste de fluxo passa sem Postgres rodando
- [x] Todo erro de domínio chega no teste com o status da tabela de mapeamento
- [x] CI verde: lint, formatação, tipos e testes
- [x] Um clone limpo, seguindo só o README, chega ao CRM funcionando com dados de exemplo
- [x] O `.env.example` não tem variável a mais nem a menos que o código lê
- [x] Os quatro ADRs refletem o que foi construído
- [x] O `CONTEXT.md` não ganhou termos novos sem registro durante a implementação

## Decisões que valem lembrar

**O teste de fluxo** sobe o Fastify inteiro com a Layer de repositórios em memória, sem banco, e
percorre o caminho real:

```
POST   /auth/login                     200 + cookies
GET    /leads sem cookie               401
POST   /leads                          201
POST   /deals                          201
PATCH  /deals/:id/stage                200
PATCH  /deals/:id/stage -> CLOSED      422
POST   /deals/:id/comments             201
POST   /deals/:id/close                200
POST   /deals/:id/close (de novo)      409
DELETE /leads/:id (com negócio aberto) 409
```

É o único lugar que cobre rota registrada, Schema de entrada, middleware de autenticação e mapa
de erro para HTTP. Nenhum teste de regra alcança essas coisas.

**O README é o principal artefato de defesa das escolhas técnicas** e vale mais tempo do que
parece. Precisa cobrir: como rodar (compose, instalação, migration, seed, os dois apps),
variáveis de ambiente, modelo de dados, e as decisões — com os paralelos em TypeScript comum
para `Effect<A, E, R>`, `Layer`, `Context.Tag`, erros no tipo em vez de lançados, `Schema`, e
`ManagedRuntime`. Mais o porquê de Effect no domínio e Fastify na borda (ADR-0002), de JWT
próprio com cookie e versão de token (ADR-0004), de Prisma atrás de serviços Effect, e de uma
entidade `User` só (ADR-0001).

Fechar com o que ficou fora de escopo e o que seria diferente em produção: `argon2` no lugar de
`bcryptjs`, revogação por sessão individual, e testes contra banco real.

**Rodar o passo a passo do README num diretório limpo de verdade, não de memória.** É o primeiro
contato de quem avalia, e um passo faltando ali custa mais caro que qualquer bug.

## Comments

**Fechado.** O teste de fluxo é `apps/api/src/flow.test.ts`: uma sessão só, do login à remoção,
mais o mapa de erro inteiro como um `Record<DomainError['_tag'], number>` — exaustivo por
construção, como o `switch` de `toHttpError`. A ordem do passo a passo saiu da do ticket num
ponto: `DELETE /leads/:id` com negócio em aberto acontece **antes** do encerramento, porque
depois dele o contato não tem mais negócio aberto e a recusa não existiria. O 204 depois do
encerramento fecha a história — a recusa era um estado, não um muro.

O clone limpo foi rodado de verdade, num diretório fora do repositório, seguindo só o README:
instalação, `.env`, compose com volume novo, quatro migrations, seed (4 usuários, 14 leads, 21
negócios, 15 registros) e os dois apps de pé. Login 200, `/leads` sem cookie 401, board com
Proposta enviada em 7 e cinco cards, dashboard agregado e o proxy `/api` do Vite respondendo.

`.env.example` bate exatamente com o que o código lê — catorze variáveis, nenhuma a mais nem a
menos.

Três coisas que o ticket não previa saíram do caminho:

- **ADR-0002** ganhou o custo que a seam de repositório compra: um caso de uso que escreve em dois
  repositórios não escreve numa transação só.
- **ADR-0003** ganhou que remover um negócio fechado é permitido, e perdeu a linha que dizia que o
  frontend recusa o drop inválido — desde a fatia do encerramento, `stageDrop` lê a recusa de
  `CLOSED` como a escolha entre Ganho e Perdido, e um card encerrado nem é arrastável.
- **`CONTEXT.md`** ganhou Board, Dossier e Timeline, que já eram tipos do pacote compartilhado
  (`DealBoard`, `LeadDossier`, `DealTimeline`) sem verbete.

A tela de Vendedores (ticket 13, opcional) segue como marcador, e o README diz isso.
