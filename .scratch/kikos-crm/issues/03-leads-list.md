# 03 — Lista de Leads

**What to build:** o vendedor abre "Leads" e vê a carteira de contatos numa tabela com nome,
empresa, e-mail, telefone, vendedor responsável, status e última interação. Ele busca por texto,
filtra por status e por vendedor, ordena clicando nos cabeçalhos, e navega entre páginas. O
contador diz quantos contatos existem no recorte atual.

Tudo isso é resolvido no banco: nenhuma filtragem, ordenação ou paginação acontece no navegador.

**Blocked by:** 02

**Status:** ready-for-agent

**Branch:** `feat/leads-list`

- [x] A tabela mostra os Leads do seed com os selos coloridos corretos por status
- [x] Buscar por parte do nome, da empresa ou do e-mail filtra no servidor
- [x] Os filtros de status e de vendedor funcionam juntos e combinam com a busca
- [x] Clicar num cabeçalho ordena; clicar de novo inverte
- [x] A paginação navega, e o contador reflete o total do recorte, não o tamanho da página
- [x] Digitar rápido na busca não dispara uma requisição por tecla
- [x] Nenhuma filtragem, ordenação ou paginação acontece no navegador
- [x] Os avatares mostram as iniciais derivadas do nome do responsável

## Decisões que valem lembrar

O modelo `Lead` nasce completo, incluindo a coluna de remoção lógica — mesmo sem rota de remoção
ainda, para não gerar migration extra na fatia 10.

**O e-mail do Lead não é único.** Com remoção lógica, a linha apagada continuaria ocupando o
índice e impediria recadastrar o mesmo contato depois.

**O filtro que exclui registros removidos mora na camada de repositório, nunca nas rotas.** Uma
rota que esquecesse faria um registro removido reaparecer. Nasce aqui e vale para todas as
consultas seguintes.

O formato de resposta paginada definido aqui é reusado pela listagem de Negócios e pela tabela
do dashboard — vale defini-lo como Schema genérico no pacote compartilhado.

Enums em inglês no banco e nos Schemas; os rótulos em português vivem num mapa único no
frontend.

A busca no frontend é atrasada em 300ms.
