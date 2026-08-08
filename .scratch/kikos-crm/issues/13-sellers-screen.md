# 13 — Tela de Vendedores (opcional)

**What to build:** o gestor abre "Vendedores" e vê quem pode receber Leads e Negócios, com
avatar, nome e e-mail, mais quantos contatos e quantos negócios em aberto estão sob
responsabilidade de cada um. Nenhum item da barra lateral fica inerte.

Fatia opcional: só construir se o restante estiver pronto e sobrar tempo.

**Blocked by:** 12

**Status:** done

**Branch:** `feat/sellers-screen`

- [x] A tela lista os vendedores do seed com os avatares corretos
- [x] As contagens batem com a lista de Leads e com o board
- [x] Nenhum item da barra lateral fica inerte

## Decisões que valem lembrar

Somente leitura. Criar, editar e remover usuários está fora de escopo — os usuários vêm do seed.

O endpoint de vendedores já existe desde a fatia 03. Se ele precisar devolver as contagens, é uma
agregação a mais: avaliar se vale, ou deixar a tela só com os dados que já existem.

**Não vale segurar o projeto por esta fatia.**

## Comments

**Fechado.** As contagens valiam: sem elas o critério "as contagens batem com a lista de Leads e
com o board" não existiria, e a tela seria uma lista de nomes que o `<select>` de responsável já
mostra.

**O endpoint é novo, e não um campo a mais em `GET /users`.** `GET /users/workload` devolve a mesma
lista com dois `GROUP BY` ao lado. Separá-los é sobre preço: `/users` alimenta o `<select>` de
responsável de cada formulário e o filtro de vendedor de cada tela, e é pedido várias vezes por
sessão — não tem por que pagar duas agregações para desenhar nomes numa lista suspensa. O recorte é
o mesmo `UserListQuery`, então `?role=SELLER` vale nas duas.

O nome da rota não é `/sellers`: a decisão de ADR-0001 já estava escrita no comentário de
`routes/users.ts` desde a fatia 03, e continua valendo — não existe entidade vendedor.

**Três leituras, e não uma transação.** É a diferença deliberada para o dashboard, onde as duas
agregações vão juntas sob `RepeatableRead`: lá as duas metades descrevem o mesmo negócio por dois
lados e não podem se contradizer, aqui os dois números contam tabelas diferentes e não há
invariante entre eles. Quem garante o critério de aceite é o filtro de remoção lógica da camada de
repositório, não o isolamento.

**A tela lista `role=SELLER`**, seguindo o verbete "Seller" do `CONTEXT.md`, e o dashboard continua
mostrando o time inteiro. Não é inconsistência: esta tela pergunta "como está a carga dos
vendedores?" e o dashboard pergunta "quem fechou o quê?" — e um gestor que receba negócio precisa
aparecer na segunda. O endpoint devolve o time inteiro sem o parâmetro, então a decisão está na
tela, não no servidor.

Duas coisas que o ticket não previa:

- **`CONTEXT.md` ganhou o verbete "Workload (Carga)"**, pela mesma regra da fatia 12: tipo do pacote
  compartilhado que nomeia um conceito de domínio ganha verbete.
- **`ComingSoonPage` foi removida.** Ela existia para que nenhum item da barra lateral ficasse
  inerte, e era usada por um lugar só — a rota de Vendedores. Com a tela de pé, o componente não
  tinha mais nada a fazer.

Verificado contra o banco de verdade, e não só contra a Layer em memória: a carga da Ana Paula bate
com `GET /leads?ownerId=` (4) e com a soma das quatro colunas não-Fechado do board dela (9).

**Da revisão**, três correções: o `toOwnerCounts` saiu para módulo próprio, ao lado de
`escapeLikeWildcards`, porque os dois repositórios que contam por responsável precisam devolver a
mesma forma; `closedDealsOwnedBy` e `closedValueOwnedBy` da harness passaram a pedir
`ClosedDealResult`, que é o tipo que impede um contador chamado "closed" de responder por negócio em
aberto; e o bloco de prosa do topo de `routes/users.ts` voltou a ser `/* */`, porque com o caso de
uso novo entre ele e `registerUserRoutes` o `/** */` não documentava mais nada.

**Fica registrado, e não foi mexido:** com a consulta em erro, o cabeçalho diz "Carregando o time…"
ao mesmo tempo que o `Alert` diz que falhou. É o padrão da casa — `LeadsPage` e `DashboardPage` têm
a mesma forma —, e consertá-lo só aqui deixaria duas convenções na mesma pasta. Vale como fatia
própria, nas três telas de uma vez.
