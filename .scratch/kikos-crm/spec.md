# Kikos CRM — Spec

Status: ready-for-agent

## Problem Statement

Um time comercial da Kikos Fitness acompanha contatos e oportunidades de venda sem uma
ferramenta única. Não há um lugar onde o vendedor registre um Lead novo, abra um Deal sobre ele,
mova esse Deal pelo Pipeline conforme a conversa evolui, e deixe registrado o que foi combinado.
O gestor, por sua vez, não consegue responder de relance a duas perguntas: onde está parado o
valor do funil, e como cada vendedor está performando.

Sem isso, o histórico de uma negociação vive em cabeças e conversas soltas, e a decisão de
priorização é feita no escuro.

## Solution

Um CRM web onde o time faz login e trabalha em três telas principais.

Na **lista de Leads**, o vendedor vê todos os contatos com empresa, telefone, responsável,
status e quando foi a última interação, com busca, filtros e ordenação. Dali ele cadastra um
contato novo, ou abre um contato existente para editar ou remover.

No **board de Negócios**, cada Deal é um card numa coluna correspondente ao seu Stage. Arrastar
o card entre colunas registra o avanço da negociação. Clicar no card abre um painel lateral com
o resumo; de lá, um botão abre um modal grande com o dossiê completo do cliente, a linha do
tempo de atividades, a caixa para comentar, e as ações de marcar Ganho ou Perdido, editar e
remover.

No **Dashboard**, o gestor vê o valor parado em cada Stage do funil, o comparativo de ganhos e
perdidos por vendedor, e uma tabela de negócios com busca, ordenação e paginação.

A arquitetura é TypeScript ponta a ponta: os Schemas que validam a entrada da API são os mesmos
que validam os formulários no navegador, e a regra que decide se uma transição de Stage é
válida é a mesma função nos dois lados.

## User Stories

### Autenticação

1. Como membro do time comercial, quero entrar com e-mail e senha, para acessar os dados do CRM.
2. Como membro do time comercial, quero ver uma mensagem clara quando o e-mail ou a senha estiverem errados, para saber que o problema foi a credencial e não o sistema.
3. Como membro do time comercial, quero que minha sessão continue válida entre visitas, para não precisar logar toda vez que abro o CRM.
4. Como membro do time comercial, quero que minha sessão seja renovada em silêncio enquanto trabalho, para nunca ser interrompido no meio de uma tarefa.
5. Como membro do time comercial, quero sair da minha conta, para que meu acesso seja encerrado de verdade no servidor, e não apenas esquecido pelo navegador.
6. Como membro do time comercial, quero ser levado para a tela de login quando minha sessão expirar, para entender o que aconteceu em vez de ver telas vazias.
7. Como membro do time comercial, quero ver meu nome e meu cargo no rodapé da navegação, para confirmar com qual conta estou trabalhando.
8. Como membro do time comercial, quero que nenhuma tela do CRM seja acessível sem login, para que os dados comerciais não fiquem expostos.

### Leads — consulta

9. Como vendedor, quero ver todos os Leads numa tabela, para ter a carteira de contatos num lugar só.
10. Como vendedor, quero ver nome, empresa, e-mail, telefone, vendedor responsável, status e última interação de cada Lead, para decidir a quem ligar sem abrir cada registro.
11. Como vendedor, quero buscar Leads por texto, para achar um contato específico sem rolar a lista.
12. Como vendedor, quero filtrar Leads por status, para focar só nos contatos em determinada situação.
13. Como vendedor, quero filtrar Leads por vendedor responsável, para ver apenas a minha carteira.
14. Como vendedor, quero ordenar a tabela clicando nos cabeçalhos, para organizar a lista pelo critério que me interessa no momento.
15. Como vendedor, quero navegar entre páginas de Leads, para que a tela continue rápida quando a base crescer.
16. Como vendedor, quero ver quantos Leads existem no resultado atual, para saber o tamanho do que estou olhando.
17. Como vendedor, quero que busca e filtros combinem entre si, para chegar a um recorte específico da base.
18. Como vendedor, quero ver o status de cada Lead como um selo colorido, para reconhecer a situação de relance.

### Leads — escrita

19. Como vendedor, quero cadastrar um Lead informando nome, empresa, e-mail e telefone, para registrar um contato novo.
20. Como vendedor, quero informar opcionalmente cargo e observações do Lead, para guardar o contexto da conversa inicial.
21. Como vendedor, quero registrar por qual canal o Lead chegou, para saber depois quais canais trazem contato bom.
22. Como vendedor, quero atribuir o Lead a um vendedor responsável, para que fique claro de quem é o contato.
23. Como vendedor, quero ver os campos obrigatórios sinalizados antes de enviar, para não descobrir o erro só depois de tentar salvar.
24. Como vendedor, quero ver erros de validação junto do campo que os causou, para corrigir sem adivinhar.
25. Como vendedor, quero abrir um Lead da tabela e ver seus dados completos, para consultar as observações registradas.
26. Como vendedor, quero editar os dados de um Lead, para corrigir um telefone errado ou atualizar o cargo.
27. Como vendedor, quero remover um Lead cadastrado por engano, para manter a base limpa.
28. Como vendedor, quero confirmar antes de remover, para não apagar um contato por clique acidental.
29. Como gestor, quero que o sistema me impeça de remover um Lead que tenha Deal em aberto, para não perder oportunidades do funil junto com o contato.
30. Como gestor, quero saber quantos Deals em aberto estão travando a remoção, para decidir o que fazer com eles antes.

### Negócios — criação e board

31. Como vendedor, quero cadastrar um Deal informando nome, valor estimado, vendedor responsável e Stage inicial, para colocar uma oportunidade no funil.
32. Como vendedor, quero vincular o Deal a um Lead já cadastrado buscando pelo nome, para não redigitar dados do contato.
33. Como vendedor, quero informar opcionalmente data prevista de fechamento e descrição do escopo, para registrar o que foi negociado.
34. Como vendedor, quero que o vendedor responsável do Deal venha pré-preenchido com o do Lead, para economizar um passo no caso comum.
35. Como vendedor, quero poder atribuir o Deal a um vendedor diferente do dono do Lead, para cobrir os casos em que quem prospecta não é quem fecha.
36. Como vendedor, quero ver o funil como um board com uma coluna por Stage, para entender a situação do pipeline de relance.
37. Como vendedor, quero ver em cada card o nome do Deal, o valor, o Lead e o avatar do vendedor, para identificar a oportunidade sem abrir nada.
38. Como vendedor, quero ver quantos Deals existem em cada coluna, para perceber onde o funil está entupido.
39. Como vendedor, quero buscar no board, para localizar um Deal específico entre as colunas.
40. Como vendedor, quero filtrar o board por vendedor responsável, para olhar apenas o meu funil.
41. Como vendedor, quero carregar mais cards de uma coluna cheia, para acessar tudo sem que a tela demore a abrir.

### Negócios — movimentação

42. Como vendedor, quero arrastar um card de uma coluna para outra, para registrar o avanço da negociação do jeito mais natural.
43. Como vendedor, quero que o card apareça na nova coluna imediatamente, para que a tela responda na velocidade do meu gesto.
44. Como vendedor, quero que o card volte para o lugar de origem se o servidor recusar o movimento, para nunca acreditar numa mudança que não foi salva.
45. Como vendedor, quero poder recuar um Deal para um Stage anterior, porque negociação real anda para trás.
46. Como vendedor, quero que soltar um card na coluna Fechado abra a escolha entre Ganho e Perdido, para que encerrar um negócio seja sempre uma decisão explícita.
47. Como vendedor, quero que o sistema não me deixe mover um Deal já encerrado, para que o histórico de negócios fechados permaneça confiável.
48. Como gestor, quero que cada mudança de Stage fique registrada na linha do tempo do Deal, para reconstituir depois como a negociação evoluiu.

### Negócios — detalhes e histórico

49. Como vendedor, quero clicar num card e ver um resumo do Deal num painel lateral, para consultar o essencial sem sair do board.
50. Como vendedor, quero abrir o detalhamento completo a partir do painel, para trabalhar o Deal sem perder o contexto do funil.
51. Como vendedor, quero ver o dossiê do cliente junto do Deal — nome, empresa, telefone, e-mail e responsável, para ligar sem procurar em outra tela.
52. Como vendedor, quero ver a linha do tempo de atividades do Deal, para saber o que já foi conversado antes de fazer contato.
53. Como vendedor, quero distinguir visualmente o que uma pessoa escreveu do que o sistema registrou, para não confundir anotação com evento.
54. Como vendedor, quero escrever um comentário no Deal, para deixar registrado o que foi combinado.
55. Como vendedor, quero ver o autor e o momento de cada item da linha do tempo, para saber quem disse o quê e quando.
56. Como vendedor, quero que meu comentário apareça no topo da linha do tempo assim que enviado, para confirmar que foi salvo.
57. Como vendedor, quero que comentar atualize a última interação do Deal e do Lead, para que a lista mostre atividade real.
58. Como vendedor, quero marcar um Deal como Ganho, para registrar a venda fechada.
59. Como vendedor, quero marcar um Deal como Perdido, para tirar do funil o que não vai acontecer.
60. Como vendedor, quero que marcar Ganho ou Perdido mova o Deal para a coluna Fechado e registre a data de fechamento, para não ter que atualizar duas coisas na mão.
61. Como vendedor, quero que o sistema recuse encerrar um Deal já encerrado, para não sobrescrever um resultado registrado.
62. Como gestor, quero distinguir Ganho de Perdido dentro da coluna Fechado, para ler o resultado sem abrir os cards.
63. Como vendedor, quero editar os dados de um Deal, para corrigir o valor ou a data prevista quando a proposta muda.
64. Como vendedor, quero remover um Deal cadastrado por engano, para manter o funil fiel à realidade.
65. Como vendedor, quero que o sistema recuse editar um Deal já encerrado, para preservar a integridade do que foi fechado.
66. Como vendedor, quero poder recarregar a página com o detalhamento aberto e continuar nele, para não perder o lugar ao atualizar.
67. Como vendedor, quero poder mandar a alguém o link direto de um Deal, para trazer um colega para a conversa sem explicar o caminho.
68. Como vendedor, quero fechar o detalhamento com o botão voltar do navegador, para navegar do jeito que já espero de um site.

### Dashboard

69. Como gestor, quero ver quanto valor está parado em cada Stage do funil, para saber onde concentrar o esforço do time.
70. Como gestor, quero ver quantos Deals existem em cada Stage, para distinguir volume de valor.
71. Como gestor, quero comparar ganhos e perdidos por vendedor, para acompanhar a performance individual.
72. Como gestor, quero uma tabela de Deals no dashboard, para descer do panorama ao caso concreto.
73. Como gestor, quero buscar, ordenar e paginar essa tabela, para chegar rápido ao negócio que me interessa.
74. Como gestor, quero abrir o detalhamento de um Deal direto da tabela do dashboard, para agir sem passar pelo board.

### Vendedores

75. Como gestor, quero ver a lista de vendedores do time, para saber quem pode receber Leads e Deals.
76. Como membro do time, quero reconhecer os vendedores pelo avatar com iniciais, para identificar o responsável de relance nos cards e nas tabelas.

### Avaliação e operação

77. Como desenvolvedor avaliando o projeto, quero subir o ambiente com poucos comandos documentados, para rodar o CRM sem descobrir os passos por tentativa.
78. Como desenvolvedor avaliando o projeto, quero encontrar o banco populado com dados de exemplo, para que as telas tenham conteúdo no primeiro acesso.
79. Como desenvolvedor avaliando o projeto, quero um `.env.example` completo, para saber exatamente quais variáveis preciso definir.
80. Como desenvolvedor avaliando o projeto, quero que lint, formatação, tipos e testes rodem em CI a cada push, para confiar que o que está na branch principal funciona.
81. Como desenvolvedor avaliando o projeto, quero ler no README por que Effect foi usado e onde ele entra, para julgar a decisão técnica e não apenas o resultado.
82. Como autor do projeto, quero comentários explicando cada conceito de Effect com o equivalente em TypeScript comum, para conseguir apresentar e defender as escolhas.

## Implementation Decisions

### Monorepo e stack

- npm workspaces com três pacotes: a API, o app web, e um pacote de domínio compartilhado.
  Sem Nx nem Turborepo — dois apps e um pacote não justificam a camada extra.
- Backend: Node + TypeScript + Effect-TS + Fastify + Prisma sobre Postgres.
- Frontend: React + TypeScript + Vite + React Router + TanStack Query + react-hook-form +
  Tailwind. Gráficos com Recharts.
- Postgres sobe por `docker-compose`; API e web rodam no host por npm. Sem imagem de produção.

### Fronteira do pacote compartilhado

- O pacote de domínio é **browser-safe**: nada que toque Node, Prisma ou I/O entra nele.
- Ele contém os Schemas do Effect (DTOs e entidades), os identificadores com brand, os
  `Data.TaggedError` do domínio, e as funções **puras** de regra de negócio.
- Os casos de uso que dependem de repositório vivem na API, não no pacote compartilhado.
- O frontend consome esse pacote em dois pontos concretos: os Schemas validam os formulários
  via `@hookform/resolvers/effect-ts`, e a regra pura de transição decide se uma coluna aceita
  o drop antes de qualquer ida ao servidor.

### Modelo de dados

- **User** — identidade única do sistema: nome, e-mail único, hash de senha, `role`
  (`MANAGER | SELLER`), `tokenVersion`. Não existe tabela de vendedor. Ver ADR-0001.
- **Lead** — nome, empresa, e-mail, telefone, cargo opcional, `source`, `ownerId`, `status`,
  observações opcionais, `lastInteractionAt`, `deletedAt`.
  O e-mail do Lead **não** é único: com remoção lógica, a linha apagada continuaria ocupando o
  índice e impediria recadastrar o mesmo contato.
- **Deal** — título, `valueInCents`, `leadId`, `ownerId`, `stage`, `result`, descrição opcional,
  data prevista opcional, `closedAt` opcional, `lastInteractionAt`, `deletedAt`.
- **Comment** — corpo, `kind` (`USER | SYSTEM`), `dealId` **obrigatório**, `authorId`.
  Uma FK não-nulável em vez de FKs nuláveis ou par tipo/id: o banco garante a integridade e
  nenhuma leitura precisa desambiguar alvo. Lead não recebe comentários; tem campo de
  observações.
- Identificadores são UUID, com brand nos Schemas para que um identificador de Lead não possa
  ser passado onde se espera um de Deal.
- Valores monetários são inteiros em centavos. `Decimal` do Prisma atravessa JSON como string e
  complica o Schema; ponto flutuante perde centavo.

### Stage e Result

Ver ADR-0003. Encodado como regra pura no pacote compartilhado:

```
NEW ⇄ CONTACT_MADE ⇄ PROPOSAL_SENT ⇄ NEGOTIATION      livre nos dois sentidos
                    ↓ markWon / markLost
                 CLOSED                                terminal

move(qualquer, CLOSED) → InvalidStageTransition
move(fechado, _)       → DealAlreadyClosed
close(fechado, _)      → DealAlreadyClosed
edit(fechado, _)       → DealAlreadyClosed
```

Fechar um Deal preenche `result` e `closedAt` e move o `stage` para `CLOSED`, numa operação só.
O Stage inicial informado na criação de um Deal só pode ser um dos quatro abertos.

### Status do Lead

O `status` é coluna própria, sincronizada pelo domínio nas ações de Deal, com a regra "último
evento vence":

```
Lead criado                          → NEW
Deal criado para o Lead              → CONTACT
Deal movido p/ PROPOSAL_SENT ou NEGOTIATION → NEGOTIATION
Deal fechado como ganho              → WON
Deal fechado como perdido            → LOST
```

Derivar na leitura exigiria regra de precedência entre múltiplos Deals do mesmo Lead e
agregação em toda listagem; deixar manual faria a lista de Leads divergir visivelmente do board.

### Última interação

Coluna em Lead e Deal, escrita pelas ações do domínio: criação, comentário, mudança de Stage e
fechamento. Não é derivada do comentário mais recente.

### Autenticação

Ver ADR-0004. Cookies `httpOnly`, access de 15 minutos e refresh de 7 dias, `tokenVersion` no
User conferido a cada requisição, logout incrementando a versão. Hash de senha com `bcryptjs`
(JS puro, sem compilação nativa — `argon2` exigiria toolchain de build na máquina de quem
avalia). Em desenvolvimento o Vite proxia `/api` para a API, deixando tudo same-origin.

O frontend concentra a renovação num wrapper de fetch: ao receber 401, requisições concorrentes
compartilham **uma única** promise de renovação e são refeitas depois dela.

Autorização é binária: qualquer User autenticado enxerga e altera tudo. `role` é rótulo para
listar vendedores, não regra de acesso.

### Consulta sempre no servidor

Busca, filtro, ordenação e paginação acontecem no banco, sem exceção. As listagens devolvem
`{ data, page, pageSize, total }`. A busca no frontend é atrasada em 300ms para não emitir uma
consulta por tecla.

O board é o caso especial: paginar um kanban não faz sentido como "página 2 do board". Um
endpoint dedicado devolve as cinco colunas de uma vez, cada uma com sua primeira página **e o
total real da coluna** — que alimenta o contador do cabeçalho. Uma coluna com mais itens carrega
as próximas páginas sob demanda pelo endpoint de listagem, filtrando por Stage.

### Remoção lógica

Lead e Deal têm `deletedAt`. O filtro que exclui apagados mora na camada de repositório, nunca
nas rotas — uma rota que esquecesse faria um registro removido reaparecer.

Remover um Lead com Deal em aberto falha com `LeadHasOpenDeals`, informando quantos travam a
operação. Comentários não são editáveis nem removíveis: a linha do tempo é registro histórico, e
um registro de sistema não pode ser apagado.

### Contrato HTTP

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
requisição inteira com um Schema só.

### Erros como dados

Todo erro de domínio é um `Data.TaggedError`. A tradução para HTTP acontece num único ponto,
por `switch` exaustivo sobre a tag — um erro novo sem mapeamento quebra a checagem de tipos no CI.

| Erro | HTTP |
| --- | --- |
| `ValidationFailed` | 400 |
| `InvalidCredentials`, `Unauthorized` | 401 |
| `LeadNotFound`, `DealNotFound`, `OwnerNotFound` | 404 |
| `DealAlreadyClosed`, `LeadHasOpenDeals` | 409 |
| `InvalidStageTransition` | 422 |

### Composição do runtime

Um `ManagedRuntime` construído uma vez no boot e descartado no shutdown, com as Layers de
repositório, autenticação e relógio. Ver ADR-0002.

### Navegação e telas

- Barra lateral fixa com Dashboard, Leads, Negócios e Vendedores, item ativo destacado, e o
  User logado no rodapé.
- Tema escuro, laranja como cor primária, verde para ganho e vermelho para perdido, selos
  coloridos por status, avatares circulares com iniciais derivadas do nome.
- O detalhamento de um Deal é um **modal quase de tela cheia**, não uma página — mas com URL
  própria: a rota do Deal renderiza o board com o modal aberto por cima. Recarregar mantém o
  modal, o botão voltar o fecha, e o link é compartilhável.
- Editar acontece dentro do mesmo modal, trocando o conteúdo pelo formulário. Remover confirma
  em linha no rodapé do modal. Nenhum modal sobre modal.
- O painel lateral do board é só leitura e enxuto: título, valor, selo de Stage, Lead, vendedor
  e última interação, mais o botão que abre o detalhamento.
- Leads seguem o mesmo padrão: clicar numa linha da tabela abre o modal com dados, edição e
  remoção.

### Idioma

Código, banco, enums e Schemas em inglês. Textos de interface em português, num mapa único de
rótulos por enum, sem biblioteca de internacionalização.

### Dados de exemplo

O seed reproduz os mockups: um gestor, três vendedores, os Leads da lista e os Deals do board,
com comentários na linha do tempo. O CRM aberto pela primeira vez se parece com o desenho.

## Testing Decisions

### O que faz um teste bom aqui

Testar comportamento observável, não estrutura interna. Um teste deve descrever uma regra de
negócio ou um contrato de API que continuaria valendo se a implementação por baixo fosse
reescrita. Nada de asserção sobre chamadas a repositório, ordem de operações internas ou forma
de objeto intermediário.

### Seam única

Os repositórios de User, Lead, Deal e Comment são `Context.Tag`, satisfeitos por duas Layers
alternativas: uma sobre Prisma e uma sobre estruturas em memória. **Essa é a única substituição
do projeto.**

Ela é a seam mais alta possível: abaixo dela roda tudo — rotas Fastify, validação de Schema,
middleware de autenticação, tradução de erro para HTTP e as regras de domínio. Acima dela sobra
apenas o Prisma. É por isso que os testes de API não precisam de banco.

A única outra substituição é o `Clock` do Effect pelo `TestClock`, para tornar `closedAt` e
`lastInteractionAt` determinísticos. Não é seam nova — vem pronta na biblioteca.

### Cobertura

Regras de domínio, exercitadas com a Layer em memória:

- Transições de Stage válidas nos dois sentidos entre os quatro Stages abertos.
- Transição para `CLOSED` recusada com `InvalidStageTransition`.
- Qualquer escrita em Deal fechado recusada com `DealAlreadyClosed`.
- Fechar um Deal preenche resultado, data de fechamento e move o Stage numa operação só.
- Criar Deal com Lead ou responsável inexistente falha com o erro correspondente.
- Criar Deal com Stage inicial `CLOSED` é recusado.
- Sincronização do status do Lead a cada evento de Deal.
- Remover Lead com Deal em aberto falha com `LeadHasOpenDeals`; sem Deal aberto, sucede.
- Mudança de Stage e fechamento geram registro de sistema na linha do tempo.
- Autenticação: senha errada, token inválido, e token com `tokenVersion` defasado.
- Funções puras de regra são testadas diretamente, sem Layer alguma.

Contrato HTTP, num arquivo de fluxo que sobe o Fastify com a Layer em memória:

- Login devolve os cookies; rota protegida sem cookie devolve 401.
- Criar Lead, criar Deal, mover de Stage, tentar mover para `CLOSED` (422), fechar (200),
  fechar de novo (409).
- Remover Lead com Deal em aberto devolve 409.
- Cada erro de domínio chega com o status da tabela de mapeamento.

Esse arquivo é o único lugar que cobre rota registrada, Schema de entrada, middleware de
autenticação e mapa de erro — coisas que nenhum teste de regra alcança.

### Prior art

Não há: o repositório está vazio. Os primeiros testes escritos estabelecem o padrão —
`@effect/vitest`, `it.effect`, e a Layer em memória fornecida no ponto de entrada do teste.
Testes posteriores devem seguir a forma dos primeiros em vez de inventar outra.

### Fora da suíte

Sem Postgres no CI: nenhum teste toca banco real, então as queries do Prisma não são cobertas
por teste automatizado. É trade-off consciente — cobri-las exigiria migration, serviço de banco
no job e limpeza de estado entre testes, e o retorno não paga nesta fase. Sem testes de
componente de UI e sem end-to-end de navegador.

## Out of Scope

- Integração de IA. A camada de comentários fica isolada e fácil de consumir depois, mas nada
  de IA é construído agora.
- Deploy, CD, Kubernetes e imagem Docker de produção. O `docker-compose` desta fase sobe apenas
  o Postgres para desenvolvimento local. CI de qualidade e testes **está** em escopo.
- OAuth e "Login via Google Workspace" — o botão do mockup é decorativo.
- "Esqueceu sua senha?" — decorativo, sem fluxo de recuperação.
- CRUD de User: criar, editar e remover contas. Usuários vêm do seed. A tela de Vendedores é
  somente leitura.
- Controle de acesso por papel. Qualquer User autenticado vê e altera tudo.
- Revogação de sessão individual por dispositivo. `tokenVersion` derruba todas as sessões do
  User de uma vez.
- Editar ou remover comentários, e reabrir Deal encerrado.
- Comentários em Lead.
- Identificador amigável de Deal no formato `#KK-9843`, visto no mockup.
- Notificações, e-mail, upload de arquivos, exportação de relatórios, campos personalizados,
  múltiplos pipelines.
- Fidelidade pixel-perfect ao Figma. A identidade visual deve ser reconhecível; o layout exato
  não é requisito.

## Further Notes

**Este código é material de estudo.** Todo conceito de Effect introduzido — `Effect.gen`,
`Data.TaggedError`, `Context.Tag`, `Layer`, `Schema`, `ManagedRuntime` — leva um comentário curto
com o equivalente aproximado em TypeScript comum, e o README traz a versão longa dessa mesma
explicação. O objetivo é que as escolhas sejam defensáveis numa entrevista, não apenas corretas.

**Effect fica onde rende.** O núcleo de domínio e o tratamento de erros são Effect idiomático;
a borda HTTP e o acesso a dados são pragmáticos. Poucas coisas bem-feitas e bem explicadas valem
mais que Effect meia-boca espalhado por toda a pilha.

**Ordem de construção.** As fatias vão do banco à tela e cada uma entrega algo demonstrável.
Editar e remover vêm depois dos Deals por dependência real: `LeadHasOpenDeals` não é
implementável antes de existir Deal. As colunas `deletedAt` já nascem nas migrations iniciais,
para não gerar migration extra depois.

**Fluxo de trabalho.** Uma branch por ticket. Todo conteúdo de git — mensagens de commit, nomes
de branch, descrições de PR — em inglês.
