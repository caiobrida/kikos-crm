import {
  CreateDealInput,
  DealAlreadyClosed,
  DealBoard,
  DealBoardQuery,
  DealId,
  DealListItem,
  DealListQuery,
  DealNotFound,
  DealPage,
  InvalidStageTransition,
  LEAD_STATUS_AFTER_DEAL_CREATED,
  LeadNotFound,
  MoveDealStageInput,
  OwnerNotFound,
  STAGE_MOVE_REFUSALS,
  isOpenDealStage,
  leadStatusAfterDealMoved,
  refuseStageMove,
  type DealBoardColumn,
  type StageMoveRefusal,
} from '@kikos/domain';
import { Clock, Effect, Option, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeBody, decodeParams, decodeQuery } from '../http/validation';
import { DealRepository, type DealWithRelations } from '../repositories/DealRepository';
import { LeadRepository } from '../repositories/LeadRepository';
import { UserRepository } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/**
 * O board inteiro numa ida ao servidor.
 *
 * Paginar um kanban como "página 2 do board" não significa nada: as cinco
 * colunas são cinco recortes que o vendedor olha ao mesmo tempo. Por isso este
 * endpoint existe separado da listagem — ele devolve as cinco de uma vez, cada
 * uma com a sua primeira leva de cards e, principalmente, **com o total real da
 * coluna**. É esse total que vira o contador do cabeçalho; o tamanho de `deals`
 * diria apenas quantos cards couberam na primeira leva.
 */
const openBoard = (
  query: DealBoardQuery,
): Effect.Effect<
  { readonly columns: readonly DealBoardColumn[] },
  never,
  DealRepository
> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const columns = yield* deals.board(query);

    return { columns };
  });

/**
 * Uma página de negócios.
 *
 * Tem dois consumidores: o "carregar mais" de uma coluna cheia do board, que
 * fixa `stage` e deixa a ordenação no default, e a tabela de negócios do
 * dashboard. Como na lista de Leads, não há regra de negócio aqui — a consulta
 * inteira acontece no banco, e o que sobra é dizer em que página o recorte está
 * e quantos registros ele tem no total.
 */
const listDeals = (
  query: DealListQuery,
): Effect.Effect<DealPage, never, DealRepository> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const slice = yield* deals.list(query);

    return {
      data: slice.data,
      page: query.page,
      pageSize: query.pageSize,
      total: slice.total,
    };
  });

/**
 * Cadastra um negócio.
 *
 * O Schema já garantiu a forma de cada campo — é o mesmo que o formulário usou
 * antes de enviar. Sobram para cá as três coisas que ele não alcança:
 *
 * 1. **negócio nenhum nasce fechado.** A regra é pura e vive no pacote
 *    compartilhado, então o formulário nem oferece a opção; aqui ela recusa
 *    quem enviar por fora, com 422 — o estágio existe, o movimento é que não.
 * 2. **o Lead e o responsável escolhidos ainda existem?** A tela montou os dois
 *    campos com dados de quando carregou, e o banco é quem tem a palavra final.
 *    Sem esta conferência a inserção falharia na chave estrangeira, o que
 *    viraria 500 em vez do 404 que a tela sabe explicar.
 * 3. **o Lead vinculado passa a estar "Em contato".** O status do Lead é
 *    sincronizado pelo domínio a cada ação de Deal, com a regra "último evento
 *    vence" — é o que faz a lista de contatos e o board contarem a mesma
 *    história.
 *
 * As duas escritas não compartilham transação: cada repositório tem o seu
 * cliente, e a seam de teste está acima deles. O pior caso é um negócio criado
 * com o status do contato um passo atrás — e a próxima ação sobre o Deal o
 * corrige, porque a regra é "último evento vence", não um acumulador.
 */
const createDeal = (
  input: CreateDealInput,
): Effect.Effect<
  DealWithRelations,
  InvalidStageTransition | LeadNotFound | OwnerNotFound,
  DealRepository | LeadRepository | UserRepository
> =>
  Effect.gen(function* () {
    if (!isOpenDealStage(input.stage)) {
      return yield* Effect.fail(
        new InvalidStageTransition({
          message:
            'Um negócio não nasce fechado. Escolha um estágio em aberto — ' +
            'para encerrar, marque o negócio como ganho ou perdido.',
        }),
      );
    }

    const leads = yield* LeadRepository;
    const lead = yield* leads.findById(input.leadId);

    if (Option.isNone(lead)) {
      return yield* Effect.fail(
        new LeadNotFound({ message: 'O Lead escolhido não existe mais.' }),
      );
    }

    const users = yield* UserRepository;
    const owner = yield* users.findById(input.ownerId);

    if (Option.isNone(owner)) {
      return yield* Effect.fail(
        new OwnerNotFound({
          message: 'O vendedor responsável escolhido não existe mais.',
        }),
      );
    }

    // A hora vem do `Clock` do Effect, e não de `new Date()`: é um serviço do
    // runtime, como os repositórios, e é o que um teste troca por `TestClock`
    // quando precisa que a data pare de variar.
    const now = new Date(yield* Clock.currentTimeMillis);

    const deals = yield* DealRepository;
    const deal = yield* deals.create({
      ...input,
      // O Schema entrega `undefined` para o campo opcional em branco; a coluna
      // do banco quer `NULL`. A tradução acontece uma vez, aqui.
      description: input.description ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
      /*
       * Em aberto e sem data de fechamento — as duas nascem juntas, no
       * encerramento (ADR-0003). Nenhum dos dois campos existe no Schema de
       * entrada, então não há como o corpo da requisição escolhê-los.
       */
      result: 'OPEN',
      closedAt: null,
      lastInteractionAt: now,
    });

    yield* leads.recordLeadInteraction(input.leadId, {
      status: LEAD_STATUS_AFTER_DEAL_CREATED,
      at: now,
    });

    return deal;
  });

/**
 * O `:id` do caminho, conferido pelo mesmo mecanismo que confere um corpo.
 *
 * O identificador chega como texto vindo de fora, e é este Schema que devolve o
 * `DealId` **com marca** — a única forma de produzir um (ver `ids.ts`). Um `id`
 * malformado vira 400 com o campo apontado, e não uma consulta ao banco.
 */
const DealIdParams = Schema.Struct({ id: DealId });

/** A recusa da regra pura, como o erro de domínio que a rota devolve. */
const stageMoveError = (
  refusal: StageMoveRefusal,
): InvalidStageTransition | DealAlreadyClosed => {
  /*
   * A frase é a mesma que o navegador mostra ao recusar o drop: ela vem do
   * pacote compartilhado, junto da regra. O `switch` existe só para escolher a
   * tag — e é ele que faz uma recusa nova nascida na regra quebrar o typecheck
   * aqui, em vez de escapar sem status HTTP.
   */
  const message = STAGE_MOVE_REFUSALS[refusal];

  switch (refusal) {
    case 'DealAlreadyClosed':
      return new DealAlreadyClosed({ message });
    case 'InvalidStageTransition':
      return new InvalidStageTransition({ message });
  }
};

/**
 * Move um negócio de coluna.
 *
 * **A regra que decide o movimento não é desta rota.** Ela é a mesma função
 * pura que o board consulta antes de aceitar o drop (`refuseStageMove`, no
 * pacote compartilhado), e é esse compartilhamento que garante que o card que o
 * navegador recusa é exatamente o que a API recusaria. O que sobra para cá são
 * as três coisas que só o servidor sabe ou pode fazer:
 *
 * 1. **o negócio ainda existe, e em que coluna ele está de verdade?** O board
 *    da tela é de um instante atrás; outra pessoa pode ter movido ou removido o
 *    card nesse meio-tempo.
 * 2. **escrever o movimento junto da última interação**, que é o que faz o card
 *    subir para o topo da coluna de destino.
 * 3. **sincronizar o contato vinculado**: o status do Lead acompanha o
 *    movimento, com a regra "último evento vence".
 *
 * As duas escritas não compartilham transação, pelo mesmo motivo do cadastro: a
 * seam de teste está acima dos repositórios. O pior caso é um negócio movido
 * com o status do contato um passo atrás, e a próxima ação sobre o Deal o
 * corrige.
 */
const moveDealStage = (
  id: DealId,
  input: MoveDealStageInput,
): Effect.Effect<
  DealWithRelations,
  DealNotFound | InvalidStageTransition | DealAlreadyClosed,
  DealRepository | LeadRepository
> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const found = yield* deals.findById(id);

    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new DealNotFound({ message: 'Este negócio não existe mais.' }),
      );
    }

    const deal = found.value;
    const refusal = refuseStageMove(deal.stage, input.stage);

    if (refusal !== undefined) return yield* Effect.fail(stageMoveError(refusal));

    /*
     * O destino é um dos quatro abertos — é o que a regra acabou de garantir —,
     * mas o compilador não acompanha essa dedução através da recusa. O type
     * guard o diz de novo, e o `else` é inalcançável: o próprio
     * `refuseStageMove` já teria recusado.
     */
    if (!isOpenDealStage(input.stage)) {
      return yield* Effect.fail(stageMoveError('InvalidStageTransition'));
    }

    // A hora vem do `Clock` do Effect, como no cadastro: é serviço do runtime, e
    // é o que um teste troca por `TestClock` quando precisa parar o tempo.
    const now = new Date(yield* Clock.currentTimeMillis);

    const moved = yield* deals.moveToStage(id, { stage: input.stage, at: now });

    const leads = yield* LeadRepository;
    yield* leads.recordLeadInteraction(deal.leadId, {
      status: leadStatusAfterDealMoved(input.stage),
      at: now,
    });

    return moved;
  });

export const registerDealRoutes = (app: FastifyInstance, runtime: AppRuntime): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  /*
   * Registrado antes de qualquer `/deals/:id` que venha nas próximas fatias: no
   * Fastify a rota estática vence a paramétrica independentemente da ordem, mas
   * ler as duas na ordem em que são resolvidas evita a dúvida.
   */
  app.get('/deals/board', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(DealBoardQuery, request.query).pipe(
      Effect.flatMap(openBoard),
    );

    return run(reply, program, (reply, board) =>
      reply.send(Schema.encodeSync(DealBoard)(board)),
    );
  });

  app.get('/deals', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(DealListQuery, request.query).pipe(
      Effect.flatMap(listDeals),
    );

    return run(reply, program, (reply, page) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(DealPage)(page)),
    );
  });

  app.post('/deals', { preHandler: authenticate }, (request, reply) => {
    const program = decodeBody(CreateDealInput, request.body).pipe(
      Effect.flatMap(createDeal),
    );

    return run(reply, program, (reply, deal) =>
      /*
       * 201 com o card que nasceu, no mesmo Schema do board. A tela não o usa
       * para desenhar a coluna à mão: recortar no navegador é justamente o que
       * este CRM não faz, então ela invalida o cache e deixa o servidor devolver
       * o funil já com o negócio na coluna certa.
       */
      reply.status(201).send(Schema.encodeSync(DealListItem)(deal)),
    );
  });

  /*
   * `PATCH`, e não `PUT`: o corpo é a coluna de destino, não o negócio inteiro.
   * Mover é uma ação sobre um registro que já existe, e o sub-recurso no
   * caminho (`/stage`) é o que deixa a rota de edição livre para receber o
   * formulário completo na fatia que a implementa.
   */
  app.patch<{ Params: unknown }>(
    '/deals/:id/stage',
    { preHandler: authenticate },
    (request, reply) => {
      const program = Effect.all([
        decodeParams(DealIdParams, request.params),
        decodeBody(MoveDealStageInput, request.body),
      ]).pipe(Effect.flatMap(([params, input]) => moveDealStage(params.id, input)));

      return run(reply, program, (reply, deal) =>
        /*
         * O card no mesmo Schema do board. A tela não o usa para redesenhar a
         * coluna à mão — ela já mostrou o movimento no instante do gesto e
         * invalida o cache depois; o corpo é o que confirma o que o servidor de
         * fato registrou.
         */
        reply.send(Schema.encodeSync(DealListItem)(deal)),
      );
    },
  );
};
