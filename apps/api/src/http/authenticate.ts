import { Effect, Either } from 'effect';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { authenticateAccessToken } from '../auth/session';
import type { UserRecord } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';
import { ACCESS_COOKIE, readCookie } from './cookies';
import { toHttpError } from './errors';

/*
 * O middleware de autenticação.
 *
 * `declare module` é a forma do TypeScript de acrescentar um campo a um tipo de
 * biblioteca. O campo é opcional porque, do ponto de vista do compilador, uma
 * requisição pode não ter passado pelo middleware — quem garante o contrário é
 * o `preHandler`, e é o `requireCurrentUser` abaixo que faz essa garantia
 * virar um tipo não-nulável no handler.
 */
declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: UserRecord;
  }
}

export const requireCurrentUser = (request: FastifyRequest): UserRecord => {
  const user = request.currentUser;
  if (user === undefined) {
    throw new Error(
      'Rota lida com currentUser sem registrar o preHandler de autenticação.',
    );
  }
  return user;
};

/**
 * Recusa a requisição quando não há sessão válida.
 *
 * A conferência acontece **a cada requisição**, e não só no login: é a leitura
 * do User que compara a `tokenVersion` do token com a do banco (ADR-0004).
 */
export const makeAuthenticate = (runtime: AppRuntime): preHandlerAsyncHookHandler =>
  async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> {
    const outcome = await runtime.runPromise(
      Effect.either(authenticateAccessToken(readCookie(request, ACCESS_COOKIE))),
    );

    if (Either.isLeft(outcome)) {
      const { status, body } = toHttpError(outcome.left);
      // Responder de dentro de um preHandler interrompe a cadeia: o handler
      // da rota não chega a rodar.
      return reply.status(status).send(body);
    }

    request.currentUser = outcome.right;
    return undefined;
  };
