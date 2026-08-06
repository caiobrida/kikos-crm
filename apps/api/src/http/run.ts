import type { DomainError } from '@kikos/domain';
import { Effect, Either } from 'effect';
import type { FastifyReply } from 'fastify';
import type { AppRuntime, AppServices } from '../runtime';
import { toHttpError } from './errors';

/**
 * O que um handler faz depois que o programa Effect deu certo. O default manda
 * o valor como JSON; quem precisa mexer nos cookies passa o seu.
 *
 * Devolver a `reply` é a convenção do Fastify para handler `async`: é assim que
 * ele sabe que a resposta já foi enviada e não deve serializar um retorno.
 */
export type OnSuccess<A> = (
  reply: FastifyReply,
  value: A,
) => FastifyReply | Promise<FastifyReply>;

/**
 * Traduz um erro de domínio e responde. Único ponto de envio de falha na API —
 * o `runHandler` abaixo e o middleware de autenticação passam os dois por aqui.
 */
export const sendDomainError = (
  reply: FastifyReply,
  error: DomainError,
): FastifyReply => {
  const { status, body } = toHttpError(error);
  return reply.status(status).send(body);
};

export interface EffectRunner {
  <A>(
    reply: FastifyReply,
    program: Effect.Effect<A, DomainError, AppServices>,
    onSuccess?: OnSuccess<A>,
  ): Promise<FastifyReply>;
}

/**
 * A ponte entre o programa Effect e a resposta do Fastify.
 *
 * `Effect.either` transforma `Effect<A, E>` em `Effect<Either<A, E>, never>` —
 * o erro sai do canal de erro e vira valor. Depois disso o programa não falha
 * mais, e `runPromise` só rejeita em caso de defeito (banco fora do ar, bug),
 * que o Fastify transforma em 500. Erro de domínio nunca vira 500 por acidente.
 */
export const makeRunner =
  (runtime: AppRuntime): EffectRunner =>
  async (reply, program, onSuccess) => {
    const outcome = await runtime.runPromise(Effect.either(program));

    if (Either.isLeft(outcome)) return sendDomainError(reply, outcome.left);

    return onSuccess === undefined
      ? reply.send(outcome.right)
      : onSuccess(reply, outcome.right);
  };
