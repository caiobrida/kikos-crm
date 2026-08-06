# 12 — Teste de fluxo pela API e README final

**What to build:** quem clona o repositório do zero, segue só o README e chega ao CRM
funcionando com dados — sem descobrir passo nenhum por tentativa. E a suíte passa a cobrir a
única coisa que os testes de regra não alcançam: a ligação entre HTTP e domínio.

**Blocked by:** 10, 11

**Status:** ready-for-agent

**Branch:** `chore/api-flow-test-and-docs`

- [ ] O teste de fluxo passa sem Postgres rodando
- [ ] Todo erro de domínio chega no teste com o status da tabela de mapeamento
- [ ] CI verde: lint, formatação, tipos e testes
- [ ] Um clone limpo, seguindo só o README, chega ao CRM funcionando com dados de exemplo
- [ ] O `.env.example` não tem variável a mais nem a menos que o código lê
- [ ] Os quatro ADRs refletem o que foi construído
- [ ] O `CONTEXT.md` não ganhou termos novos sem registro durante a implementação

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
