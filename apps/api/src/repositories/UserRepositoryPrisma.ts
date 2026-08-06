import type { UserId } from '@kikos/domain';
import { Effect, Layer, Option } from 'effect';
import { createPrismaClient } from '../prisma';
import { UserRepository, type UserRecord } from './UserRepository';

/*
 * A implementação sobre Prisma.
 *
 * `Layer.scoped` amarra o ciclo de vida da conexão ao ciclo de vida da Layer:
 * `acquireRelease` abre o client quando o `ManagedRuntime` é construído no boot
 * e fecha quando ele é descartado no shutdown. É o motivo de existir um runtime
 * único em vez de `Effect.provide` dentro de cada handler (ADR-0002) — com um
 * singleton de módulo o `$disconnect` acabaria por fora do Effect, que é
 * justamente o que a Layer existe para evitar.
 */

/** A linha do banco tem mais colunas do que o domínio precisa. */
const toRecord = (row: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'MANAGER' | 'SELLER';
  tokenVersion: number;
}): UserRecord => ({
  id: row.id as UserId,
  name: row.name,
  email: row.email,
  passwordHash: row.passwordHash,
  role: row.role,
  tokenVersion: row.tokenVersion,
});

export const UserRepositoryPrisma: Layer.Layer<UserRepository> = Layer.scoped(
  UserRepository,
  Effect.gen(function* () {
    const prisma = yield* Effect.acquireRelease(
      Effect.sync(createPrismaClient),
      (client) => Effect.promise(() => client.$disconnect()),
    );

    return {
      /*
       * `Effect.promise` é para a Promise que não se espera que rejeite: uma
       * falha vira defeito (500), não erro de domínio. Banco fora do ar não é
       * uma regra de negócio, e não deve aparecer no `switch` de erro para HTTP.
       */
      findByEmail: (email) =>
        Effect.promise(() => prisma.user.findUnique({ where: { email } })).pipe(
          Effect.map(Option.fromNullable),
          Effect.map(Option.map(toRecord)),
        ),

      findById: (id) =>
        Effect.promise(() => prisma.user.findUnique({ where: { id } })).pipe(
          Effect.map(Option.fromNullable),
          Effect.map(Option.map(toRecord)),
        ),

      incrementTokenVersion: (id) =>
        Effect.promise(() =>
          prisma.user.updateMany({
            where: { id },
            data: { tokenVersion: { increment: 1 } },
          }),
        ),
    };
  }),
);
