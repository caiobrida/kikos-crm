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

- [x] Marcar Ganho move o card para Fechado, pinta de verde e grava a data de fechamento
- [x] Marcar Perdido faz o mesmo, em vermelho
- [x] Na coluna Fechado, ganhos e perdidos são distinguíveis sem abrir os cards
- [x] Soltar um card na coluna Fechado abre a escolha entre Ganho e Perdido
- [x] Tentar encerrar um negócio já encerrado devolve 409 e a interface informa o motivo
- [x] Tentar mover um negócio encerrado continua sendo recusado
- [x] O Lead vinculado passa a "Ganho" ou "Perdido" na lista de Leads
- [x] O encerramento deixa registro de sistema na linha do tempo
- [x] Testes cobrem que encerrar preenche resultado, data e estágio numa operação, e que
      encerrar duas vezes é recusado

## Decisões que valem lembrar

**Estágio e resultado são dimensões ortogonais** (ADR-0003). O estágio diz onde o negócio está;
o resultado diz se terminou e como. Encerrar preenche resultado e data de fechamento **e** move
o estágio para Fechado, tudo numa operação — não são dois passos que o usuário faz na mão.

O estado "estágio Fechado com resultado em aberto" é inalcançável por construção. É isso que
permite à coluna Fechado sempre saber pintar cada card de verde ou vermelho.

Negócio encerrado é terminal: mover, editar ou encerrar de novo falham. **Reabrir negócio não
existe** e está fora de escopo.

## Decisões tomadas durante a implementação

**O corpo de `POST /deals/:id/close` aceita `WON | LOST`, e não os três resultados.** É a
diferença desta entrada para as duas outras do funil, que aceitam o vocabulário inteiro e
deixam a regra pura recusar com 422: `stage: 'CLOSED'` no cadastro é um estágio legítimo pedido
num movimento que não existe, enquanto `result: 'OPEN'` não é desfecho nenhum — encerrar *é*
escolher entre Ganho e Perdido. Deixá-lo entrar para recusá-lo adiante abriria, por um
instante, a porta para o estado que o ADR declara inalcançável. A recusa é 400, do Schema, e
`ClosedDealResult` deriva de `CLOSED_DEAL_RESULTS`, a mesma lista que desenha os dois botões.

**`DealListItem` ganhou `result`.** O card do board carregava só o estágio, e "ganhos e perdidos
distinguíveis sem abrir os cards" não é alcançável assim: ou a coluna Fechado pediria um
detalhamento por card só para escolher a cor, ou pintaria todos igual. Nas outras quatro colunas
o campo é sempre `OPEN` — o par estágio/resultado é ortogonal, mas nem toda combinação existe.

**`stageDrop` nasceu ao lado de `refuseStageMove`, em vez de a segunda mudar.** A regra do funil
não mudou nesta fatia — `PATCH` de estágio para `CLOSED` continua 422 —, e o que mudou é o que a
tela faz com o gesto, como o próprio ADR-0003 antecipa. As duas perguntas são diferentes: "esta
escrita vale?", que é a da rota, e "o que este arrasto faz?", que é a da coluna e agora tem três
respostas. `stageDrop` é a segunda, pura e derivada da primeira, e é o que impede a leitura do
gesto de virar um `if` sobre a tag do erro dentro de um componente.

**`DEAL_RESULT_LABELS` desceu do app web para o pacote compartilhado**, atrás de
`DEAL_STAGE_LABELS` e pelo mesmo motivo: o registro de sistema do encerramento grava a frase
pronta no banco, e é o servidor quem a escreve. `labels.ts` re-exporta os dois.

**O rodapé do detalhamento não mostra botão para negócio encerrado** — nem desabilitado. Um
controle que existe convida a tentar, e aqui não há segunda tentativa; o que o rodapé mostra é o
desfecho registrado e a data. A recusa de 409 continua existindo para a corrida (duas abas, duas
pessoas), e a frase dela vive **acima** dos botões justamente porque eles somem quando a
invalidação traz o negócio já fechado.

**`Button` ganhou os tons `won` e `lost`, separados de `danger`.** `lost` e `danger` pintam
igual, e a distinção é a mesma que o selo já fazia: o tom carrega o significado, não a cor.
Encerrar como perdido não destrói nada — registra que a venda não aconteceu —, e colapsá-lo em
`danger` faria "Marcar como Perdido" e "Remover" dizerem a mesma coisa a quem lê a interface por
convenção de cor.

**O painel lateral ganhou o selo de resultado, ao lado do de estágio.** O spec enumera o
conteúdo do painel e não o inclui, então fica registrado: sem ele, um negócio ganho e um perdido
apareceriam idênticos no resumo — os dois dizendo apenas "Fechado" —, e o painel contradiria o
card colorido de onde a pessoa acabou de clicar. É a mesma regra que o detalhamento já seguia:
o selo só aparece quando existe desfecho.

**Dois comentários de exemplo mudaram de data no seed.** Os registros de encerramento nascem no
mesmo instante do `closedAt` de cada negócio fechado, e dois comentários que já existiam caíam
exatamente nesse instante; eles recuaram um dia para que a linha do tempo dos dois negócios
tenha ordem estrita. O texto deles não mudou.

**Achado fora do escopo, corrigido junto:** o teste `deixa um registro por movimento` em
`comments.test.ts` falhava em cerca de uma a cada seis execuções da suíte, **antes desta fatia**.
Dois movimentos seguidos caem no mesmo milissegundo, e nesse empate a linha do tempo desempata
pelo identificador — ordem estável, que é o que o produto promete, mas não cronológica. O teste
afirmava a posição de cada registro; passou a afirmar o conjunto dos dois. O produto não mudou.
