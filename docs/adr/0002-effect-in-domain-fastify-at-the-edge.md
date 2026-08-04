# Effect no domínio, Fastify na borda

Este projeto usa Effect-TS deliberadamente, mas não em todas as camadas. As regras de negócio,
os erros de domínio e a validação de entrada vivem em Effect; o transporte HTTP é Fastify comum.
Escolhemos não usar `@effect/platform` HttpApi porque essa parte da biblioteca ainda é marcada
como instável, e um servidor que não sobe custa mais do que a elegância de ter Effect ponta a
ponta rende.

A ligação entre os dois mundos é um único `ManagedRuntime`, construído uma vez no boot e
descartado no shutdown, mais um helper que roda o programa Effect e traduz a falha em resposta
HTTP através de um `switch` exaustivo sobre a tag do erro.

## Considered Options

- **`@effect/platform` HttpApi** — Effect em toda a pilha e rotas derivadas dos Schemas, mas
  API instável e menos material de referência para depurar.
- **`Effect.provide(AppLayer)` dentro de cada handler** — dispensa o `ManagedRuntime`, porém
  reconstrói o grafo de dependências a cada requisição. Com um singleton de módulo do Prisma o
  sintoma some, mas o gerenciamento de recurso passa a acontecer por fora do Effect, que é
  justamente o que o `Layer` existe para fazer.

## Consequences

- Toda política de erro HTTP mora em um arquivo só. Um `Data.TaggedError` novo sem mapeamento
  quebra o `tsc --noEmit` do CI, em vez de virar 500 em produção.
- Os repositórios são `Context.Tag` com duas implementações (Prisma e memória), o que permite
  testar as rotas de verdade sem banco.
