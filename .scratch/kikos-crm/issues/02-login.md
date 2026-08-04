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

- [ ] Entrar com uma credencial do seed leva ao CRM e mostra "Rodrigo Ramos / Diretor de Vendas"
- [ ] Entrar com senha errada mostra mensagem clara e não deixa passar
- [ ] Qualquer rota da API sem cookie válido devolve 401, e o frontend leva para o login
- [ ] Sair incrementa a versão do token e limpa os cookies; o token anterior deixa de funcionar
- [ ] Os cookies são `httpOnly` e o JavaScript da página não os enxerga
- [ ] O token de acesso expira em 15 minutos e é renovado sem o usuário perceber
- [ ] Três requisições que tomem 401 ao mesmo tempo disparam **uma** renovação, não três
- [ ] Testes cobrem senha errada, token inválido e token com versão defasada

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
