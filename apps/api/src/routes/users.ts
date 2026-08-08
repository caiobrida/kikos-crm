import { UserList, UserListQuery, UserWorkloadList } from '@kikos/domain';
import { Effect, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { toSessionUser } from '../auth/session';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeQuery } from '../http/validation';
import { DealRepository } from '../repositories/DealRepository';
import { LeadRepository } from '../repositories/LeadRepository';
import { UserRepository } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/**
 * O time comercial, para os lugares que precisam escolher um responsável: o
 * filtro de vendedor da lista de Leads, o `<select>` dos formulários e a tela de
 * Vendedores.
 *
 * Não existe tabela de vendedor (ADR-0001): "vendedor" é um User com `role`
 * igual a `SELLER`, e é por isso que a rota é `/users?role=SELLER` e não
 * `/sellers`.
 */

/**
 * O time com a carga de cada um — o que a tela de Vendedores desenha.
 *
 * O caso de uso é curto porque as duas contagens acontecem no banco, num
 * `GROUP BY` cada. O que sobra para cá é a decisão que o `GROUP BY` não sabe
 * tomar: **quem aparece na tela**. A resposta é o recorte inteiro de `GET
 * /users`, e não quem tem contato ou negócio — um agrupamento sobre a tabela de
 * Leads não produz a linha de quem está com a carteira vazia, e é exatamente
 * essa linha que uma tela de carga precisa mostrar.
 *
 * **São três leituras, e não uma transação.** É a diferença para o dashboard,
 * onde as duas agregações vão juntas sob `RepeatableRead`: lá as duas metades
 * descrevem o mesmo negócio por dois lados e não podem se contradizer; aqui os
 * dois números contam tabelas diferentes, e não há invariante entre eles que um
 * commit no meio possa quebrar. O que a tela promete é bater com a lista de
 * Leads e com o board — e isso quem garante é o filtro de remoção lógica, que
 * mora na camada de repositório.
 */
const summarizeWorkload = (
  query: UserListQuery,
): Effect.Effect<
  UserWorkloadList,
  never,
  UserRepository | LeadRepository | DealRepository
> =>
  Effect.gen(function* () {
    const users = yield* UserRepository;
    const team = yield* users.list(query);

    const leads = yield* LeadRepository;
    const deals = yield* DealRepository;

    const leadCounts = yield* leads.countByOwner();
    const openDealCounts = yield* deals.countOpenByOwner();

    return team.map((user) => ({
      // A mesma projeção que `GET /users` e `/auth/me` usam: sem hash de senha
      // e sem `tokenVersion`.
      user: toSessionUser(user),
      /*
       * A chave ausente **precisa** virar zero, e não sumir: quem ainda não
       * recebeu contato nenhum é justamente o que esta tela existe para mostrar.
       */
      leadCount: leadCounts.get(user.id) ?? 0,
      openDealCount: openDealCounts.get(user.id) ?? 0,
    }));
  });

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

  /*
   * A mesma lista, com as duas contagens da tela de Vendedores.
   *
   * É uma rota à parte, e não um campo a mais em `GET /users`, porque as duas
   * respondem a perguntas diferentes e custam preços diferentes: o `<select>` de
   * responsável de cada formulário e o filtro de vendedor de cada tela pedem
   * `/users` várias vezes por sessão, e não têm por que pagar dois `GROUP BY`
   * para desenhar nomes numa lista suspensa.
   *
   * O recorte é o mesmo — `?role=SELLER` para a tela, sem parâmetro para o time
   * inteiro —, e por isso o Schema de query também é.
   */
  app.get('/users/workload', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(UserListQuery, request.query).pipe(
      Effect.flatMap(summarizeWorkload),
    );

    return run(reply, program, (reply, team) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(UserWorkloadList)(team)),
    );
  });
};
