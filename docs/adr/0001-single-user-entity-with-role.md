# Uma única entidade User, com Role, em vez de Seller separado

Um CRM normalmente separa "quem faz login" de "a quem o trabalho é atribuído", e a proposta
inicial deste projeto tinha uma tabela `Seller` própria. Os mockups derrubaram isso: na linha
do tempo de um Deal, os comentários são assinados tanto pelo gestor logado quanto por
vendedores — ou seja, vendedor comenta, logo vendedor é usuário do sistema. Decidimos ter uma
tabela `User` só, com `role: MANAGER | SELLER`, onde Leads e Deals apontam para um `ownerId`
e Comments para um `authorId`, ambos para `User`.

## Considered Options

- **Seller separado sem login** — `Comment.authorId` só poderia apontar para `User`, então
  nenhum vendedor conseguiria assinar um comentário. Contradiz os mockups.
- **Seller separado com User espelho** — reproduz os mockups, mas cria duas linhas para a
  mesma pessoa e obriga todo código de atribuição e autoria a escolher qual das duas usar.

## Consequences

- A tela "Vendedores" é uma consulta por `role`, não uma entidade própria.
- As iniciais do avatar são derivadas do `name` na exibição; não existe coluna `initials`.
- `role` é rótulo, não permissão: qualquer User autenticado enxerga todos os Leads e Deals.
  Se controle de acesso por papel entrar em escopo depois, o campo já está no lugar certo.
