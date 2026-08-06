import { UserId } from '@kikos/domain';
import { Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { UserRepositoryInMemory, type UserRecord } from '../repositories/UserRepository';
import { makeRuntime } from '../runtime';
import { buildServer } from '../server';

/*
 * A montagem de um servidor de teste.
 *
 * O único duble é a Layer em memória do repositório — abaixo dela roda tudo:
 * as rotas do Fastify, a validação de Schema, o bcrypt de verdade, o JWT de
 * verdade, o middleware de autenticação e o mapa de erro para HTTP. É por isso
 * que estes testes não precisam de Postgres.
 */

export const TEST_PASSWORD = 'kikos123';

/**
 * `Schema.decodeSync(UserId)` é a única forma de produzir um `UserId`: a marca
 * do Schema não deixa passar uma string qualquer. De quebra, um UUID inválido
 * estoura aqui, e não numa asserção obscura lá na frente.
 */
const newUserId = (): UserId => Schema.decodeSync(UserId)(randomUUID());

export interface TestHarness {
  readonly app: FastifyInstance;
  readonly manager: UserRecord;
  readonly seller: UserRecord;
  readonly close: () => Promise<void>;
}

export const makeTestHarness = async (): Promise<TestHarness> => {
  // Um hash só, reaproveitado: bcrypt é lento de propósito, e cada chamada a
  // mais aparece no tempo da suíte.
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const manager: UserRecord = {
    id: newUserId(),
    name: 'Rodrigo Ramos',
    email: 'rodrigo.ramos@kikos.com.br',
    passwordHash,
    role: 'MANAGER',
    tokenVersion: 0,
  };

  const seller: UserRecord = {
    id: newUserId(),
    name: 'Ana Paula Nogueira',
    email: 'ana.nogueira@kikos.com.br',
    passwordHash,
    role: 'SELLER',
    tokenVersion: 0,
  };

  const runtime = makeRuntime(UserRepositoryInMemory([manager, seller]));
  const app = buildServer({ runtime, logger: false });
  await app.ready();

  return {
    app,
    manager,
    seller,
    close: async () => {
      await app.close();
      // Descarta as Layers, como o `main.ts` faz no shutdown.
      await runtime.dispose();
    },
  };
};

/** O valor de um cookie na resposta, ou `undefined` se ele não foi gravado. */
export const cookieValue = (
  cookies: readonly { name: string; value: string }[],
  name: string,
): string | undefined => cookies.find((cookie) => cookie.name === name)?.value;
