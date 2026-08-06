# 09 — Marcar Negócio como Ganho ou Perdido

**What to build:** no modal de detalhes, o vendedor marca o negócio como Ganho ou Perdido. O
negócio vai para a coluna Fechado, ganha a data de fechamento, e o card fica verde ou vermelho —
dá para ler o resultado sem abrir nada. Arrastar um card para a coluna Fechado passa a abrir a
escolha entre os dois, em vez de apenas recusar. Um negócio já encerrado não pode ser encerrado
de novo.

Com esta fatia, **todos os requisitos obrigatórios do desafio estão cobertos.**

**Blocked by:** 08

**Status:** ready-for-agent

**Branch:** `feat/mark-deal-won-or-lost`

- [ ] Marcar Ganho move o card para Fechado, pinta de verde e grava a data de fechamento
- [ ] Marcar Perdido faz o mesmo, em vermelho
- [ ] Na coluna Fechado, ganhos e perdidos são distinguíveis sem abrir os cards
- [ ] Soltar um card na coluna Fechado abre a escolha entre Ganho e Perdido
- [ ] Tentar encerrar um negócio já encerrado devolve 409 e a interface informa o motivo
- [ ] Tentar mover um negócio encerrado continua sendo recusado
- [ ] O Lead vinculado passa a "Ganho" ou "Perdido" na lista de Leads
- [ ] O encerramento deixa registro de sistema na linha do tempo
- [ ] Testes cobrem que encerrar preenche resultado, data e estágio numa operação, e que
      encerrar duas vezes é recusado

## Decisões que valem lembrar

**Estágio e resultado são dimensões ortogonais** (ADR-0003). O estágio diz onde o negócio está;
o resultado diz se terminou e como. Encerrar preenche resultado e data de fechamento **e** move
o estágio para Fechado, tudo numa operação — não são dois passos que o usuário faz na mão.

O estado "estágio Fechado com resultado em aberto" é inalcançável por construção. É isso que
permite à coluna Fechado sempre saber pintar cada card de verde ou vermelho.

Negócio encerrado é terminal: mover, editar ou encerrar de novo falham. **Reabrir negócio não
existe** e está fora de escopo.
