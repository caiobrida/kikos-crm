import {
  DashboardSummary,
  NO_DEALS,
  type ClosedDealResult,
  type DealTally,
  type OwnerTally,
  type UserId,
} from '@kikos/domain';
import { Effect, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { DealRepository, type OwnerResultTally } from '../repositories/DealRepository';
import { UserRepository } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/**
 * O que um responsável fechou com este resultado, ou o par zerado.
 *
 * O `find` é sobre dez linhas no máximo — um par por (responsável, resultado)
 * que existe no banco —, e é ele que transforma "esta linha não veio da
 * agregação" em "este responsável não ganhou nada ainda". A ausência **precisa**
 * virar zero, e não sumir: uma linha vazia é uma resposta, uma linha ausente é
 * um silêncio.
 */
const resultOf = (
  byOwner: readonly OwnerResultTally[],
  ownerId: UserId,
  result: ClosedDealResult,
): DealTally => {
  const found = byOwner.find(
    (tally) => tally.ownerId === ownerId && tally.result === result,
  );

  return found === undefined
    ? NO_DEALS
    : { count: found.count, valueInCents: found.valueInCents };
};

/**
 * O panorama do funil — o que o gestor lê ao entrar no CRM.
 *
 * O caso de uso é curto porque a agregação inteira acontece no banco, num
 * instante só. O que sobra para cá é a decisão que o `GROUP BY` não sabe tomar:
 * **quem aparece no segundo gráfico**.
 *
 * A resposta é o time inteiro, e não quem fechou negócio. Custa uma leitura da
 * tabela de Users — que não tem paginação, porque o time comercial cabe numa
 * tela — e paga por duas coisas:
 *
 * 1. quem não fechou nada aparece com a linha em zero, que é justamente o que um
 *    gráfico de performance existe para mostrar;
 * 2. a soma dos dois gráficos fecha. Se a lista fosse `?role=SELLER`, um negócio
 *    encerrado por um gestor sumiria daquele gráfico e continuaria contado na
 *    coluna Fechado — e os dois passariam a discordar sobre o mesmo negócio. Um
 *    Deal pertence a um User (ADR-0001), e o verbete que descreve quem recebeu o
 *    negócio é **Owner**, não Seller (ver CONTEXT.md).
 *
 * A ordem é a de `GET /users` — alfabética —, e não um ranking por vitórias: uma
 * barra que troca de lugar a cada venda fechada obriga a reler o eixo inteiro
 * para achar a pessoa que se estava acompanhando.
 */
const summarizeDashboard = (): Effect.Effect<
  DashboardSummary,
  never,
  DealRepository | UserRepository
> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const tallies = yield* deals.tally();

    const users = yield* UserRepository;
    const team = yield* users.list({});

    const owners: readonly OwnerTally[] = team.map((user) => ({
      // A mesma projeção que o card e a tabela usam: identificador e nome, sem
      // e-mail nem hash de senha (ver `UserSummary`).
      owner: { id: user.id, name: user.name },
      won: resultOf(tallies.byOwner, user.id, 'WON'),
      lost: resultOf(tallies.byOwner, user.id, 'LOST'),
    }));

    return { pipeline: tallies.byStage, owners };
  });

export const registerDashboardRoutes = (
  app: FastifyInstance,
  runtime: AppRuntime,
): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  /*
   * Sem query string, ao contrário de toda outra leitura do CRM: o dashboard é
   * o panorama do funil inteiro. Busca, filtro e página são da tabela abaixo dos
   * gráficos, e ela não tem endpoint próprio — reusa `GET /deals`, a mesma
   * listagem que carrega as páginas seguintes de uma coluna do board.
   */
  app.get('/dashboard/summary', { preHandler: authenticate }, (_request, reply) =>
    run(reply, summarizeDashboard(), (reply, panorama) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(DashboardSummary)(panorama)),
    ),
  );
};
