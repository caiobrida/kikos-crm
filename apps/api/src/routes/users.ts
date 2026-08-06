import { UserList, UserListQuery } from '@kikos/domain';
import { Effect, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { toSessionUser } from '../auth/session';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeQuery } from '../http/validation';
import { UserRepository } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/**
 * O time comercial, para os lugares que precisam escolher um responsável: o
 * filtro de vendedor da lista de Leads, o `<select>` dos formulários e, mais
 * adiante, a tela de Vendedores.
 *
 * Não existe tabela de vendedor (ADR-0001): "vendedor" é um User com `role`
 * igual a `SELLER`, e é por isso que a rota é `/users?role=SELLER` e não
 * `/sellers`.
 */
export const registerUserRoutes = (app: FastifyInstance, runtime: AppRuntime): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  app.get('/users', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(UserListQuery, request.query).pipe(
      Effect.flatMap((query) =>
        Effect.gen(function* () {
          const users = yield* UserRepository;
          const found = yield* users.list(query);
          // `toSessionUser` é a projeção que deixa hash de senha e
          // `tokenVersion` para trás — a mesma que `/auth/me` usa.
          return found.map(toSessionUser);
        }),
      ),
    );

    return run(reply, program, (reply, team) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(UserList)(team)),
    );
  });
};
