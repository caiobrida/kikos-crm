import { LoginRequest, SessionUser } from '@kikos/domain';
import { Effect, Schema } from 'effect';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticateRefreshToken, login, logout, toSessionUser } from '../auth/session';
import { makeAuthenticate, requireCurrentUser } from '../http/authenticate';
import {
  REFRESH_COOKIE,
  clearSessionCookies,
  issueSessionCookies,
  readCookie,
} from '../http/cookies';
import { makeRunner } from '../http/run';
import { decodeBody } from '../http/validation';
import type { UserRecord } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/** Codifica o User para JSON com o mesmo Schema que o app web decodifica. */
const sendSessionUser = (reply: FastifyReply, user: UserRecord): FastifyReply =>
  reply.send(Schema.encodeSync(SessionUser)(toSessionUser(user)));

/** Renova os cookies e devolve o User — a resposta de login e de refresh. */
const startSession = async (
  reply: FastifyReply,
  user: UserRecord,
): Promise<FastifyReply> => {
  await issueSessionCookies(reply, user);
  return sendSessionUser(reply, user);
};

export const registerAuthRoutes = (app: FastifyInstance, runtime: AppRuntime): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  app.post('/auth/login', (request, reply) => {
    /*
     * O programa inteiro em uma expressão: valida o corpo com o Schema
     * compartilhado, e só então tenta o login. `Effect.flatMap` encadeia sem
     * executar nada — quem executa é o `run`, uma linha abaixo.
     */
    const program = decodeBody(LoginRequest, request.body).pipe(Effect.flatMap(login));

    return run(reply, program, startSession);
  });

  /*
   * A renovação silenciosa. Aceita **apenas** o token de refresh, que o
   * navegador só envia para esta rota por causa do `path` do cookie.
   */
  app.post('/auth/refresh', (request, reply) =>
    run(
      reply,
      authenticateRefreshToken(readCookie(request, REFRESH_COOKIE)),
      startSession,
    ),
  );

  /*
   * Sair de verdade: incrementar a `tokenVersion` invalida no servidor todo
   * token já emitido para este User. Limpar os cookies sozinho só faria o
   * navegador esquecer um token que continuaria valendo.
   */
  app.post('/auth/logout', { preHandler: authenticate }, (request, reply) =>
    run(reply, logout(requireCurrentUser(request)), (reply) => {
      clearSessionCookies(reply);
      return reply.status(204).send();
    }),
  );

  app.get('/auth/me', { preHandler: authenticate }, (request, reply) =>
    sendSessionUser(reply, requireCurrentUser(request)),
  );
};
