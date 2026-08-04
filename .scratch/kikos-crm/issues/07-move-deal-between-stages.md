# 07 — Mover Negócio entre colunas

**What to build:** o vendedor arrasta um card de uma coluna para outra e a negociação avança —
ou recua, porque negociação real anda para trás. O card pula para a coluna de destino no
instante do gesto, sem esperar o servidor; se o servidor recusar, ele volta sozinho para a
origem e o motivo aparece. Arrastar para a coluna Fechado não move nada: encerrar um negócio é
uma decisão explícita, que chega na fatia 09.

Construir em duas etapas dentro da branch: primeiro a mudança de estágio por ação simples,
depois o arrastar por cima. Assim existe um ponto intermediário funcionando caso o
arrastar-e-soltar se mostre custoso.

**Blocked by:** 06

**Status:** ready-for-agent

**Branch:** `feat/move-deal-between-stages`

- [ ] Arrastar entre os quatro estágios abertos funciona nos dois sentidos
- [ ] O card aparece na coluna de destino antes da resposta da API
- [ ] Recusa do servidor devolve o card à origem e informa o motivo
- [ ] Arrastar para Fechado é recusado pelo frontend, sem chamar a API
- [ ] Os contadores das duas colunas envolvidas se ajustam após o movimento
- [ ] O status do Lead acompanha o movimento: negócio em Proposta ou Negociação leva o Lead para
      "Negociação"
- [ ] A última interação do negócio e do Lead é atualizada a cada movimento
- [ ] Testes cobrem transições válidas nos dois sentidos, transição para Fechado recusada, e
      movimento em negócio já encerrado recusado

## Decisões que valem lembrar

A regra de transição (ADR-0003) é uma **função pura no pacote compartilhado**, consumida pelos
dois lados:

```
NEW ⇄ CONTACT_MADE ⇄ PROPOSAL_SENT ⇄ NEGOTIATION    livre nos dois sentidos
move(qualquer, CLOSED) → InvalidStageTransition
move(fechado, _)       → DealAlreadyClosed
```

**A mesma função decide o drop no navegador e a rejeição no servidor.** É o argumento mais
concreto a favor do pacote compartilhado — vale destacá-la no README.

Este é o ticket mais arriscado do projeto. Por isso ele não carrega entidade nova: o modelo de
comentário e o registro de eventos de sistema ficam na fatia 08, que é dona da linha do tempo
inteira. Lá, o caso de uso de movimentação ganha uma dependência e passa a registrar o evento.

Atenção ao cache: mover invalida o board e a lista de Leads, esta por causa do status.
