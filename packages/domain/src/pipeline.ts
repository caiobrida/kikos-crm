import { OPEN_DEAL_STAGES, type DealResult, type DealStage } from './enums';

/*
 * As regras do Pipeline — puras, sem Schema, sem Effect, sem I/O.
 *
 * As duas pontas leem daqui, cada uma do jeito que precisa: o formulário monta
 * o `<select>` de estágio inicial a partir de `OPEN_DEAL_STAGES`, e a rota
 * recusa quem enviar outra coisa por fora da tela com `isOpenDealStage` — que é
 * derivado da mesma lista. Uma regra só, escrita num lugar só; é o que impede o
 * formulário e a rota de discordarem sobre o que é um funil válido.
 *
 * O arquivo é dono das **duas** dimensões de ADR-0003, e não só do estágio: o
 * resultado é o que faz um negócio sair do funil, e as regras que decidem
 * movimento e encerramento leem uma à outra. Separá-las em dois módulos seria
 * separar as duas metades de uma decisão só.
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
 *    (Na fatia que encerra negócios, esse mesmo gesto passa a abrir a escolha
 *    entre Ganho e Perdido — ADR-0003. A regra daqui não muda: o que muda é o
 *    que a tela faz com a recusa.)
 *
 * Entre os quatro abertos o movimento é livre **nos dois sentidos**, e sem
 * pular etapa: negociação real avança, recua e às vezes salta. Mover para o
 * estágio em que o negócio já está também passa: `PATCH` é idempotente, e
 * recusar inventaria um erro que a tabela do spec não tem.
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

/*
 * ---------------------------------------------------------------------------
 * O encerramento
 * ---------------------------------------------------------------------------
 */

/**
 * Por que o CRM recusa encerrar um negócio.
 *
 * Uma recusa só, e o nome **é a tag do erro de domínio** correspondente, como em
 * `StageMoveRefusal`. A união de um membro não é cerimônia: é o que faz uma
 * recusa nova nascida aqui quebrar o `switch` que a traduz em HTTP, em vez de
 * escapar como 500.
 */
export type DealCloseRefusal = 'DealAlreadyClosed';

/**
 * O CRM aceita encerrar um negócio que está neste estágio? Devolve o motivo da
 * recusa, ou `undefined` quando o encerramento vale.
 *
 * A irmã de `refuseStageMove`, e curta pelo mesmo motivo que aquela é: **o
 * estágio de origem basta**. O estado "estágio Fechado com resultado em aberto"
 * é inalcançável por construção (ADR-0003), então quem está em `CLOSED` já tem
 * desfecho registrado — e negócio encerrado é terminal: mover, editar e encerrar
 * de novo falham, e reabrir não existe.
 *
 * O desfecho pedido não entra na regra de propósito. Encerrar como Ganho um
 * negócio já perdido não é "trocar o resultado", é a mesma escrita recusada pelo
 * mesmo motivo — e é por isso que a recusa não tem uma segunda variante.
 */
export const refuseDealClose = (from: DealStage): DealCloseRefusal | undefined =>
  from === 'CLOSED' ? 'DealAlreadyClosed' : undefined;

/**
 * O motivo da recusa em português, pronto para a tela — como em
 * `STAGE_MOVE_REFUSALS`.
 *
 * A diferença para aquele é onde a frase aparece. O board recusa o arrasto
 * sozinho e mostra o motivo sem falar com o servidor; aqui o detalhamento usa a
 * regra para **não oferecer** os botões, e por isso a frase só é lida quando o
 * servidor recusa de verdade — a corrida em que outra pessoa encerrou o negócio
 * primeiro, e o 409 chega com este mesmo texto no corpo.
 *
 * Ela é distinta da recusa de movimento apesar de a tag ser a mesma, porque o
 * que a pessoa acabou de tentar é outro: lá ela arrastou um card e quer saber
 * por que ele voltou; aqui ela clicou em "Ganho" e quer saber por que o desfecho
 * não mudou.
 */
export const DEAL_CLOSE_REFUSALS: Record<DealCloseRefusal, string> = {
  DealAlreadyClosed:
    'Este negócio já foi encerrado, e o desfecho registrado não muda. ' +
    'Reabrir negócio não existe.',
};

/*
 * ---------------------------------------------------------------------------
 * A edição
 * ---------------------------------------------------------------------------
 */

/**
 * Por que o CRM recusa editar um negócio.
 *
 * Uma recusa só, e o nome **é a tag do erro de domínio** correspondente, como nas
 * duas regras acima.
 */
export type DealEditRefusal = 'DealAlreadyClosed';

/**
 * O CRM aceita editar um negócio que está neste estágio? Devolve o motivo da
 * recusa, ou `undefined` quando a edição vale.
 *
 * A terceira irmã de `refuseStageMove` e `refuseDealClose`, e a mais curta —
 * pelo mesmo motivo que as outras duas são curtas: **o estágio de origem basta**.
 * Quem está em `CLOSED` já tem desfecho registrado (ADR-0003), e negócio
 * encerrado é terminal para toda escrita: mover, encerrar de novo e editar falham
 * juntas, e a lista das três está no ADR.
 *
 * Ela existe apesar de hoje concordar campo a campo com `refuseDealClose` — e o
 * teste que fixa essa concordância é justamente onde a duplicação estaria, se
 * fosse duplicação. O que separa as duas não é o valor de retorno: é a pergunta.
 * O detalhamento chama esta para decidir se **oferece** o botão "Editar", e
 * chama a outra para decidir se oferece "Ganho" e "Perdido" — e o dia em que a
 * regra de uma mudar, a outra não muda junto por acidente.
 *
 * Os campos editados não entram na regra, pelo mesmo motivo que o desfecho
 * pedido não entra em `refuseDealClose`: corrigir o valor de um negócio ganho não
 * é "uma edição menor", é a mesma escrita recusada pelo mesmo motivo.
 */
export const refuseDealEdit = (from: DealStage): DealEditRefusal | undefined =>
  from === 'CLOSED' ? 'DealAlreadyClosed' : undefined;

/**
 * O motivo da recusa em português, pronto para a tela.
 *
 * Distinta das outras duas apesar de a tag ser a mesma, e o critério é o de
 * sempre: a frase responde ao que a pessoa acabou de tentar. Lá ela arrastou um
 * card e quer saber por que ele voltou, ou clicou em "Ganho" e quer saber por que
 * o desfecho não mudou; aqui ela clicou em "Editar" e quer saber por que o
 * formulário não abriu.
 *
 * Como no encerramento, o detalhamento usa a regra para **não oferecer** o botão,
 * e por isso esta frase só é lida quando o servidor recusa de verdade — a corrida
 * em que outra pessoa encerrou o negócio enquanto o formulário estava aberto, e o
 * 409 chega com este mesmo texto no corpo.
 */
export const DEAL_EDIT_REFUSALS: Record<DealEditRefusal, string> = {
  DealAlreadyClosed:
    'Este negócio já foi encerrado, e o que ficou registrado não se corrige. ' +
    'Para registrar o que mudou, escreva um comentário na linha do tempo.',
};

/*
 * ---------------------------------------------------------------------------
 * O gesto
 * ---------------------------------------------------------------------------
 */

/**
 * O que soltar um card numa coluna faz.
 *
 * Existe porque desde a fatia que encerra negócios o board tem **três** respostas
 * possíveis para o mesmo gesto, e não duas: mover, abrir a escolha entre Ganho e
 * Perdido, ou recusar. `refuseStageMove` responde a outra pergunta — "esta
 * escrita vale?" —, e é a que a rota faz antes de gravar; esta responde "o que
 * este arrasto faz?", que é a que a coluna faz antes de aceitar o drop.
 *
 * As duas moram juntas e uma deriva da outra de propósito. A regra do funil não
 * mudou nesta fatia — `PATCH` de estágio para `CLOSED` continua sendo 422
 * (ADR-0003) —; o que mudou foi o que a tela faz com essa recusa, e este é o
 * lugar onde essa leitura fica escrita uma vez só, pura e testável, em vez de
 * virar um `if` sobre a tag do erro dentro de um componente.
 *
 * O `to` de `'move'` já vem estreitado para `OpenDealStage`: quem consome não
 * precisa reconferir o que a regra acabou de decidir.
 */
export type StageDrop =
  | { readonly kind: 'move'; readonly to: OpenDealStage }
  | { readonly kind: 'close' }
  | { readonly kind: 'refused'; readonly reason: StageMoveRefusal };

export const stageDrop = (from: DealStage, to: DealStage): StageDrop => {
  const refusal = refuseStageMove(from, to);

  // Negócio encerrado não se move **e** não se encerra de novo: a recusa vem
  // antes de qualquer leitura do destino, como na regra de movimento.
  if (refusal === 'DealAlreadyClosed') return { kind: 'refused', reason: refusal };

  /*
   * A recusa que sobra é sempre `InvalidStageTransition`, e sempre pelo mesmo
   * motivo: o destino é Fechado. É exatamente o gesto que abre a escolha —
   * "soltar um card na coluna Fechado abre a escolha entre Ganho e Perdido".
   */
  if (!isOpenDealStage(to)) return { kind: 'close' };

  return { kind: 'move', to };
};

/*
 * ---------------------------------------------------------------------------
 * Os rótulos
 * ---------------------------------------------------------------------------
 */

/**
 * O nome de cada estágio em português.
 *
 * Ele **morava no app web**, junto dos outros rótulos de enum, e desceu para cá
 * no instante em que deixou de ser só interface: o registro de sistema que uma
 * movimentação deixa na linha do tempo grava a frase pronta no banco, e é o
 * servidor quem a escreve. Duplicar o mapa deixaria o cabeçalho de uma coluna e
 * o histórico do negócio chamando o mesmo estágio por dois nomes.
 *
 * O `Record<DealStage, string>` continua sendo a trava de sempre: um estágio
 * novo no vocabulário sem rótulo aqui quebra o typecheck, em vez de virar uma
 * coluna sem nome na tela. Ver `labels.ts` no app web para o resto do
 * vocabulário de interface, que continua lá.
 */
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  NEW: 'Novo',
  CONTACT_MADE: 'Contato feito',
  PROPOSAL_SENT: 'Proposta enviada',
  NEGOTIATION: 'Negociação',
  CLOSED: 'Fechado',
};

/**
 * O nome de cada desfecho em português.
 *
 * Desceu do app web para cá pelo mesmo motivo e na mesma fatia em que o
 * encerramento nasceu: o registro de sistema que ele deixa na linha do tempo
 * grava a frase pronta no banco — "Negócio encerrado como Ganho." —, e quem a
 * escreve é o servidor. Duplicar o mapa deixaria o botão do detalhamento e o
 * histórico do negócio chamando o mesmo desfecho por dois nomes.
 *
 * `OPEN` continua aqui, mesmo não sendo escolha de encerramento: ele é um selo
 * que a tela desenha, e o `Record<DealResult, string>` é a trava de sempre —
 * um desfecho novo no vocabulário sem rótulo aqui quebra o typecheck.
 */
export const DEAL_RESULT_LABELS: Record<DealResult, string> = {
  OPEN: 'Em aberto',
  WON: 'Ganho',
  LOST: 'Perdido',
};
