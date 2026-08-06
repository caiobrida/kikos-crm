# 02 — Login ponta a ponta

**What to build:** você abre o CRM, entra com e-mail e senha, e cai numa aplicação autenticada
com a barra lateral mostrando seu nome e seu cargo no rodapé. Senha errada explica o que houve.
Sair encerra a sessão de verdade no servidor, não apenas no navegador. Sem estar logado, nenhuma
tela abre.

Esta fatia também levanta a espinha dorsal técnica do backend — runtime, repositório,
autenticação, tradução de erro para HTTP — que as onze seguintes reusam sem tocar.

**Blocked by:** 01

**Status:** ready-for-agent

**Branch:** `feat/login`

- [x] Entrar com uma credencial do seed leva ao CRM e mostra "Rodrigo Ramos / Diretor de Vendas"
- [x] Entrar com senha errada mostra mensagem clara e não deixa passar
- [x] Qualquer rota da API sem cookie válido devolve 401, e o frontend leva para o login
- [x] Sair incrementa a versão do token e limpa os cookies; o token anterior deixa de funcionar
- [x] Os cookies são `httpOnly` e o JavaScript da página não os enxerga
- [x] O token de acesso expira em 15 minutos e é renovado sem o usuário perceber
- [x] Três requisições que tomem 401 ao mesmo tempo disparam **uma** renovação, não três
- [x] Testes cobrem senha errada, token inválido e token com versão defasada

## Decisões que valem lembrar

Modelo `User` com papel (`MANAGER | SELLER`) e versão de token; não existe tabela de vendedor
(ADR-0001). Seed com o gestor e os três vendedores dos mockups.

O repositório de User é o primeiro `Context.Tag` do projeto, com implementação sobre Prisma e
implementação em memória. **Esta é a seam de teste de todo o projeto** — nasce aqui e as fatias
seguintes só a estendem.

Um `ManagedRuntime` construído uma vez no boot e descartado no shutdown (ADR-0002), e um único
helper que roda o programa Effect e traduz falha em resposta HTTP por `switch` exaustivo sobre a
tag do erro. Esse mapa nasce aqui e cresce a cada fatia; ser exaustivo é o que faz um erro novo
sem mapeamento quebrar a verificação de tipos no CI.

Cookies `httpOnly`, acesso curto mais renovação, e versão de token conferida a cada requisição
(ADR-0004). Hash com `bcryptjs`, escolhido por ser JS puro — `argon2` exigiria toolchain de
compilação na máquina de quem avalia.

**A parte com mais chance de bug sutil** é a renovação concorrente: requisições que tomem 401
juntas precisam compartilhar **uma única** promise de renovação. Vale testar manualmente com
três telas abertas e o token vencido.

Comentar cada conceito de Effect que aparece pela primeira vez com o equivalente em TypeScript
comum: `Effect.gen`, `Context.Tag`, `Layer`, `Data.TaggedError`, `ManagedRuntime`.

O botão do Google e o "esqueceu sua senha" existem na tela mas são inertes.

## Comments

**O `path` do cookie de refresh precisa do prefixo `/api`.** O ADR-0004 pede o refresh restrito
por `path` à rota que o consome, e o caminho óbvio seria `/auth/refresh`. Ele não funciona: o
`path` de um cookie é comparado com a URL que o **navegador** pede, e em desenvolvimento o
navegador pede ao Vite, que só depois proxia para a API. O default virou
`REFRESH_COOKIE_PATH=/api/auth/refresh`, configurável por quem servir o app web de outro jeito.
Um teste fixa o comportamento, e a verificação manual pelo proxy confirmou que o cookie de
refresh de fato só viaja para aquela rota.

**"Diretor de Vendas" é o rótulo de `MANAGER`.** O critério pede esse texto no rodapé da barra
lateral, e o modelo de `User` não tem coluna de cargo — o `role` é o que existe. O mapa
`USER_ROLE_LABELS` passou a traduzir `MANAGER` como "Diretor de Vendas", que é como o CONTEXT.md
já descrevia o papel ("gestão, ex. Diretor de Vendas") e como os mockups o mostram. O rodapé é o
único lugar do produto que renderiza o papel como cargo.

**Prisma 7 mudou duas coisas que valem registrar.** A URL de conexão saiu do `schema.prisma` e
foi para `prisma.config.ts` (migrations) e para um driver adapter no `PrismaClient` — aqui,
`@prisma/adapter-pg`. E o client gerado tem caminho de saída próprio dentro do pacote, o que
ativou a ressalva condicional da fatia 01: `apps/api/.gitignore` existe justamente por isso.

**O formulário de login não usa `react-hook-form`.** São dois campos, e o que precisa ser
mostrado é a recusa do servidor, não validação de campo complexa. O `@hookform/resolvers/effect-ts`
com os Schemas compartilhados entra na fatia 04, que é onde há formulário para valer. O Schema
`LoginRequest` já é compartilhado e valida a requisição na API.

**A renovação concorrente ficou coberta por teste, não só por verificação manual.** O wrapper de
fetch é módulo puro, sem React, então dá para exercitá-lo com um `fetch` de mentira sem sair da
regra "sem testes de componente de UI". O teste conta as chamadas a `/auth/refresh` quando três
requisições tomam 401 juntas.
