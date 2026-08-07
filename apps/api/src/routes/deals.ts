import {
  CreateDealInput,
  DealBoard,
  DealBoardQuery,
  DealListItem,
  DealListQuery,
  DealPage,
  InvalidStageTransition,
  LEAD_STATUS_AFTER_DEAL_CREATED,
  LeadNotFound,
  OwnerNotFound,
  isOpenDealStage,
  type DealBoardColumn,
} from '@kikos/domain';
import { Clock, Effect, Option, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeBody, decodeQuery } from '../http/validation';
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

    yield* leads.recordDealActivity(input.leadId, {
      status: LEAD_STATUS_AFTER_DEAL_CREATED,
      at: now,
    });

    return deal;
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
};
