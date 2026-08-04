import { HealthResponse } from '@kikos/domain';
import { Schema } from 'effect';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config';

export interface BuildServerOptions {
  /** Desligado nos testes para não poluir a saída. */
  readonly logger?: boolean;
}

/**
 * Monta o servidor sem subir socket nenhum.
 *
 * Separar a montagem do `listen` é o que permite testar as rotas com
 * `app.inject()` — requisição de verdade, pela pilha inteira do Fastify, sem
 * porta aberta e sem banco.
 */
export const buildServer = (options: BuildServerOptions = {}): FastifyInstance => {
  const app = Fastify({
    logger: (options.logger ?? true) && {
      level: config.nodeEnv === 'development' ? 'info' : 'warn',
    },
  });

  app.get('/health', () => {
    /*
     * `Schema.encodeSync` leva o valor do lado decodificado (com `Date`) para
     * o lado codificado (com string ISO), que é o que vira JSON. O app web
     * decodifica com este mesmo Schema, importado do mesmo pacote — as duas
     * pontas não podem divergir sem quebrar o typecheck.
     */
    return Schema.encodeSync(HealthResponse)({
      status: 'ok',
      service: config.serviceName,
      checkedAt: new Date(),
    });
  });

  return app;
};
