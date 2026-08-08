# 11 — Dashboard

**What to build:** o gestor entra no CRM e cai numa tela que responde duas perguntas de relance:
onde está parado o valor do funil, e como cada vendedor está indo. Um gráfico mostra quantidade e
valor somado por estágio; outro compara ganhos e perdidos por vendedor. Abaixo, uma tabela de
negócios com busca, ordenação e paginação, onde clicar numa linha abre o mesmo modal de detalhes
do board.

**Blocked by:** 09

**Status:** done

**Branch:** `feat/dashboard`

- [x] Os números dos gráficos batem com o board e com a lista de Leads
- [x] Um negócio removido some dos gráficos e da tabela
- [x] Encerrar um negócio como ganho move o número entre os gráficos
- [x] A tabela busca, ordena e pagina pelo servidor
- [x] Abrir um negócio pela tabela leva ao mesmo modal do board
- [x] Os gráficos são legíveis no tema escuro e têm rótulos claros
- [x] O Dashboard deixa de ser inerte na barra lateral e vira a tela inicial após o login

## Decisões que valem lembrar

**Carregar a skill `dataviz` antes de escrever a primeira linha de código de gráfico**, e antes
de escolher cores e formas. Ela existe exatamente para isso.

As agregações são feitas **no banco**, não em memória, e registros removidos ficam de fora de
ambas.

**Cuidado com dupla contagem:** um negócio encerrado tem estágio Fechado *e* resultado ganho ou
perdido. Os dois gráficos olham dimensões diferentes do mesmo dado (ADR-0003) e não podem se
contradizer.

A tabela sai quase de graça porque reusa o endpoint de listagem paginada criado na fatia 05. Se
ele precisar de campo novo, é sinal de que a listagem deveria tê-lo desde o começo — corrigir
lá, não criar um endpoint paralelo.
