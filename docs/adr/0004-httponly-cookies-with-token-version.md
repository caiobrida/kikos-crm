# Autenticação por cookies httpOnly, com access curto, refresh e tokenVersion

A autenticação é JWT próprio, sem provedor externo. Os tokens viajam em cookies `httpOnly`
(inacessíveis ao JavaScript da página, ao contrário de `localStorage`), com o Vite proxiando
`/api` para a API em desenvolvimento, de modo que tudo é same-origin e não há configuração de
CORS com credenciais. São dois: um access de 15 minutos e um refresh de 7 dias, este último
restrito por `path` à rota de renovação.

Como JWT é stateless, um token roubado valeria até expirar. Para dar cancelamento real sem
criar tabela de sessão, `User` carrega um `tokenVersion`: o número entra no payload assinado e
é conferido contra o banco a cada requisição. O logout incrementa a coluna, o que invalida de
verdade todos os tokens daquele User — em vez de apenas pedir ao navegador que esqueça o cookie.

## Considered Options

- **Só access token de 7 dias** — cobre o requisito com muito menos código, e num backend único
  com cookie httpOnly a diferença de segurança real é pequena. Rejeitado por decisão explícita
  de demonstrar o padrão completo.
- **Tabela `RefreshToken` com rotação e detecção de reuso** — único caminho para revogar uma
  sessão específica sem derrubar as outras. Rejeitado: faria de auth o maior módulo de um
  projeto cujo requisito é "login/logout com JWT".

## Consequences

- Sair em um navegador derruba as sessões daquele User em todos os outros. Aceitável aqui.
- O middleware de autenticação lê o User a cada requisição para comparar o `tokenVersion`.
  É uma busca por chave primária, e o User já é necessário para autoria de comentários.
- O frontend precisa de um wrapper de fetch que, ao receber 401, renove e refaça a requisição.
  Requisições concorrentes compartilham uma única promise de renovação, para não dispararem
  várias renovações simultâneas.
