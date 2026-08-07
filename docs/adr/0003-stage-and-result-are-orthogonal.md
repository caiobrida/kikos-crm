# Stage e Result são ortogonais, e CLOSED só se alcança por ação

Um Deal tem duas dimensões independentes: o Stage, que diz onde ele está no Pipeline, e o
Result, que diz se ele terminou e como. Os quatro Stages abertos (`NEW`, `CONTACT_MADE`,
`PROPOSAL_SENT`, `NEGOTIATION`) aceitam movimento livre nos dois sentidos, porque vendedor real
avança e recua. `CLOSED` não é destino de movimentação: chega-se nele apenas marcando o Deal
como ganho ou perdido, e uma vez fechado o Deal é terminal.

## Consequences

- Arrastar um card para a coluna Fechado não move nada — abre o diálogo de Ganho/Perdido.
  Um `PATCH` de stage para `CLOSED` falha com `InvalidStageTransition`.
- Qualquer escrita em um Deal fechado (mover, editar, fechar de novo) falha com
  `DealAlreadyClosed`. Reabrir negócio não existe.
- **A recusa é sobre mudar o que foi registrado, não sobre acrescentar ao histórico.** Comentar
  num Deal fechado é permitido, e leva junto a `lastInteractionAt` do Deal e do Lead — é a regra
  da "Última interação" do spec, que lista comentário como um dos eventos. Sem isso ninguém
  poderia anotar por que a venda foi perdida, que é justamente o que se quer ler depois. A
  fronteira: as três escritas acima mudam o desfecho de um negócio encerrado; um comentário só
  registra que alguém voltou a falar dele.
- O estado `stage = CLOSED, result = OPEN` é inalcançável, então a coluna Fechado sempre sabe
  pintar cada card de verde ou vermelho.
- A regra de transição é uma função pura no pacote compartilhado, então o frontend recusa o
  drop inválido com a mesma lógica que o backend usa para rejeitá-lo.
