# 05 — Board de Negócios em leitura

**What to build:** o vendedor abre "Negócios" e vê o funil como um board de cinco colunas, uma
por estágio, cada uma com o número real de negócios no cabeçalho. Cada card mostra o nome do
negócio, o valor, o Lead e o avatar do responsável. Ele busca no board e filtra por vendedor, e
as cinco colunas respondem juntas. Coluna cheia carrega mais sob demanda.

Ainda não se move nem se clica em card — isso vem depois.

**Blocked by:** 03

**Status:** ready-for-agent

**Branch:** `feat/deals-board`

- [ ] O board mostra os negócios do seed distribuídos pelas cinco colunas
- [ ] O contador de cada coluna vem do total do servidor, não do tamanho do array recebido
- [ ] A busca filtra as cinco colunas de uma vez
- [ ] O filtro por vendedor vale para o board inteiro
- [ ] Uma coluna com mais itens que a primeira página carrega os seguintes sob demanda
- [ ] Valores aparecem formatados em reais e são armazenados em centavos
- [ ] O board abre numa única ida ao servidor

## Decisões que valem lembrar

O modelo `Deal` nasce completo, incluindo estágio, resultado, data de fechamento, última
interação e a coluna de remoção lógica — esta última mesmo sem rota de remoção ainda, pelo mesmo
motivo do Lead.

**Valores monetários são inteiros em centavos.** O `Decimal` do Prisma atravessa JSON como
string e complica o Schema; ponto flutuante perde centavo.

**Paginar um kanban não faz sentido como "página 2 do board".** Por isso existe um endpoint
dedicado que devolve as cinco colunas de uma vez, cada uma com a primeira página de negócios e o
**total real da coluna**. É esse total que alimenta o contador do cabeçalho — sem ele, uma coluna
paginada mentiria o número. O endpoint de listagem paginada por estágio, que serve o "carregar
mais", nasce junto e é reusado pela tabela do dashboard na fatia 11.

Seed com os negócios dos mockups, espalhados pelas colunas.
