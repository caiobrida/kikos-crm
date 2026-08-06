import {
  DealBoard,
  DealBoardQuery,
  DealListQuery,
  DealPage,
  type DealBoardColumn,
} from '@kikos/domain';
import { Effect, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeQuery } from '../http/validation';
import { DealRepository } from '../repositories/DealRepository';
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
};
