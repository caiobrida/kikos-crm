import { LeadListQuery, LeadPage } from '@kikos/domain';
import { Effect, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeQuery } from '../http/validation';
import { LeadRepository } from '../repositories/LeadRepository';
import type { AppRuntime } from '../runtime';

/**
 * Monta a resposta paginada a partir do recorte que o repositório devolveu.
 *
 * Não há regra de negócio aqui: a consulta inteira — busca, filtro, ordenação e
 * corte da página — acontece no banco, e o que sobra para esta camada é
 * devolver, junto dos dados, em que página o recorte está e **quantos
 * registros ele tem no total**. É esse total que a tela mostra no contador; o
 * tamanho de `data` diria apenas quantas linhas couberam na página.
 */
const listLeads = (
  query: LeadListQuery,
): Effect.Effect<LeadPage, never, LeadRepository> =>
  Effect.gen(function* () {
    const leads = yield* LeadRepository;
    const slice = yield* leads.list(query);

    return {
      data: slice.data,
      page: query.page,
      pageSize: query.pageSize,
      total: slice.total,
    };
  });

export const registerLeadRoutes = (app: FastifyInstance, runtime: AppRuntime): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  app.get('/leads', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(LeadListQuery, request.query).pipe(
      Effect.flatMap(listLeads),
    );

    return run(reply, program, (reply, page) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(LeadPage)(page)),
    );
  });
};
