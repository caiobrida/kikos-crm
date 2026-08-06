import { LoginRequest, SessionUser } from '@kikos/domain';
import { Effect, Schema } from 'effect';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticateRefreshToken, login, logout, toSessionUser } from '../auth/session';
import { makeAuthenticate, requireCurrentUser } from '../http/authenticate';
import {
  REFRESH_COOKIE,
  clearSessionCookies,
  issueAccessCookie,
  issueSessionCookies,
} from '../http/cookies';
import { makeRunner } from '../http/run';
import { decodeBody } from '../http/validation';
import type { UserRecord } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/** Codifica o User para JSON com o mesmo Schema que o app web decodifica. */
const sendSessionUser = (reply: FastifyReply, user: UserRecord): FastifyReply =>
  reply.send(Schema.encodeSync(SessionUser)(toSessionUser(user)));

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

    return run(reply, program, async (reply, user) => {
      await issueSessionCookies(reply, user);
      return sendSessionUser(reply, user);
    });
  });

  /*
   * A renovação silenciosa. Aceita **apenas** o token de refresh, que o
   * navegador só envia para esta rota por causa do `path` do cookie.
   *
   * Reemite só o access: o refresh continua o que o login gravou, e seus 7 dias
   * contam a partir da senha digitada. Renová-lo aqui também faria a validade
   * deslizar a cada 15 minutos e nunca vencer para quem usa o CRM todo dia.
   */
  app.post('/auth/refresh', (request, reply) =>
    run(
      reply,
      authenticateRefreshToken(request.cookies[REFRESH_COOKIE]),
      async (reply, user) => {
        await issueAccessCookie(reply, user);
        return sendSessionUser(reply, user);
      },
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
