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
