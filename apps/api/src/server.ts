import fastifyCookie from '@fastify/cookie';
import { HealthResponse } from '@kikos/domain';
import { Schema } from 'effect';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config';
import { registerAuthRoutes } from './routes/auth';
import { registerDealRoutes } from './routes/deals';
import { registerLeadRoutes } from './routes/leads';
import { registerUserRoutes } from './routes/users';
import type { AppRuntime } from './runtime';

export interface BuildServerOptions {
  /**
   * O runtime que resolve as dependências dos programas Effect. Produção passa
   * o construído sobre Prisma; os testes passam um sobre a Layer em memória —
   * é a seam que os deixa exercitar rota, Schema, autenticação e mapa de erro
   * sem banco nenhum.
   */
  readonly runtime: AppRuntime;
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
export const buildServer = (options: BuildServerOptions): FastifyInstance => {
  const app = Fastify({
    logger: (options.logger ?? true) && {
      level: config.nodeEnv === 'development' ? 'info' : 'warn',
    },
  });

  /*
   * Sem `secret`: os cookies de sessão não são assinados pelo Fastify porque
   * o que viaja dentro deles já é um JWT assinado. Assinar duas vezes só
   * acrescentaria um segredo a gerenciar.
   */
  void app.register(fastifyCookie);

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

  registerAuthRoutes(app, options.runtime);
  registerUserRoutes(app, options.runtime);
  registerLeadRoutes(app, options.runtime);
  registerDealRoutes(app, options.runtime);

  return app;
};
