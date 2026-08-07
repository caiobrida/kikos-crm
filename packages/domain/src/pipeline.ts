import { OPEN_DEAL_STAGES, type DealStage } from './enums';

/*
 * As regras do Pipeline — puras, sem Schema, sem Effect, sem I/O.
 *
 * As duas pontas leem daqui, cada uma do jeito que precisa: o formulário monta
 * o `<select>` de estágio inicial a partir de `OPEN_DEAL_STAGES`, e a rota
 * recusa quem enviar outra coisa por fora da tela com `isOpenDealStage` — que é
 * derivado da mesma lista. Uma regra só, escrita num lugar só; é o que impede o
 * formulário e a rota de discordarem sobre o que é um funil válido.
 */

/**
 * Um dos quatro estágios abertos: onde um negócio pode nascer e por onde ele
 * caminha enquanto está em aberto.
 *
 * `(typeof OPEN_DEAL_STAGES)[number]` é a união dos literais da tupla —
 * `'NEW' | 'CONTACT_MADE' | 'PROPOSAL_SENT' | 'NEGOTIATION'`. Deriva da lista
 * em vez de ser escrita de novo, então acrescentar um estágio ao funil não
 * deixa este tipo para trás.
 */
export type OpenDealStage = (typeof OPEN_DEAL_STAGES)[number];

/**
 * O estágio aceita um negócio que está em aberto?
 *
 * **`CLOSED` não é destino de escolha nem de movimentação** (ADR-0003):
 * chega-se nele marcando Ganho ou Perdido, e por nenhum outro caminho. Por isso
 * o formulário de cadastro nem oferece a opção, e a rota recusa com
 * `InvalidStageTransition` — 422, e não 400: o valor é um estágio legítimo do
 * vocabulário, o que não existe é o movimento.
 *
 * O retorno é um type guard (`stage is OpenDealStage`), então quem passa por
 * ele sai com o tipo estreito e não precisa conferir de novo mais adiante.
 */
export const isOpenDealStage = (stage: DealStage): stage is OpenDealStage =>
  (OPEN_DEAL_STAGES as readonly DealStage[]).includes(stage);

/*
 * ---------------------------------------------------------------------------
 * O movimento
 * ---------------------------------------------------------------------------
 */

/**
 * Por que o funil recusa um movimento.
 *
 * Os dois nomes **são as tags dos erros de domínio** correspondentes, e não uma
 * enumeração paralela: a rota traduz o nome no `Data.TaggedError` de mesmo
 * nome, e o app web reconhece a recusa que vem do servidor pelo mesmo nome que
 * a sua própria checagem produziu. Um vocabulário só para a mesma regra.
 */
export type StageMoveRefusal = 'DealAlreadyClosed' | 'InvalidStageTransition';

/**
 * O funil aceita levar um negócio de um estágio para outro? Devolve o motivo da
 * recusa, ou `undefined` quando o movimento vale.
 *
 * **É a função mais compartilhada do projeto**, e o argumento mais concreto a
 * favor do pacote de domínio: a coluna do board pergunta a ela se aceita o card
 * — antes de qualquer ida ao servidor — e a rota pergunta a ela antes de
 * escrever. Não existem duas regras de funil que possam divergir, e é por isso
 * que o card que o navegador recusa é exatamente o que a API recusaria.
 *
 * As duas recusas, em ordem de precedência (ADR-0003):
 *
 * 1. **negócio encerrado não se move.** Qualquer escrita nele é recusada, e a
 *    checagem vem primeiro porque essa é a explicação verdadeira do que
 *    aconteceu — mesmo quando o destino também seria inválido por si só.
 * 2. **`CLOSED` não é destino de movimentação.** Chega-se nele marcando Ganho
 *    ou Perdido, e por nenhum outro caminho; arrastar para lá não move nada.
 *
 * Entre os quatro abertos o movimento é livre **nos dois sentidos**, e sem
 * pular etapa: negociação real avança, recua e às vezes salta.
 *
 * O estágio de origem basta para saber que um negócio está encerrado: o estado
 * "estágio Fechado com resultado em aberto" é inalcançável por construção
 * (ADR-0003), e é o que permite ao card do board — que carrega o estágio, e não
 * o resultado — decidir o drop sozinho.
 */
export const refuseStageMove = (
  from: DealStage,
  to: DealStage,
): StageMoveRefusal | undefined => {
  if (from === 'CLOSED') return 'DealAlreadyClosed';
  if (!isOpenDealStage(to)) return 'InvalidStageTransition';

  return undefined;
};

/**
 * O motivo da recusa em português, pronto para a tela.
 *
 * Mora aqui junto da regra, e não de cada lado: a mensagem que o navegador
 * mostra ao recusar o drop e a que a API devolve no corpo do erro são **a mesma
 * frase**. Ver `labels.ts` no app web para o resto do vocabulário de interface;
 * a diferença é que estas frases explicam uma regra, e a regra é compartilhada.
 */
export const STAGE_MOVE_REFUSALS: Record<StageMoveRefusal, string> = {
  DealAlreadyClosed:
    'Este negócio já foi encerrado e não volta ao funil. O histórico de ' +
    'negócios fechados não muda.',
  InvalidStageTransition:
    'Fechado não é destino de arrasto. Para encerrar, marque o negócio como ' +
    'ganho ou perdido.',
};
