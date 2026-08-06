import { Layer, ManagedRuntime } from 'effect';
import { UserRepository } from './repositories/UserRepository';
import { UserRepositoryPrisma } from './repositories/UserRepositoryPrisma';

/**
 * Tudo que um programa desta API pode pedir. Cresce uma linha por fatia,
 * conforme os repositórios de Lead, Deal e Comment entram.
 */
export type AppServices = UserRepository;

/** A composição de produção: os repositórios sobre Prisma. */
export const AppLayerLive: Layer.Layer<AppServices> =
  Layer.mergeAll(UserRepositoryPrisma);

/**
 * `ManagedRuntime` é o que liga o mundo Effect ao mundo Fastify.
 *
 * Uma `Layer` é uma receita de construção de dependências; o `ManagedRuntime` a
 * executa **uma vez**, guarda os serviços prontos, e expõe `runPromise` — que
 * roda um programa Effect e devolve uma Promise comum, que é o que um handler
 * do Fastify sabe esperar.
 *
 * A alternativa seria `Effect.provide(AppLayer)` dentro de cada handler, o que
 * reconstruiria o grafo de dependências — e abriria uma conexão nova com o
 * Postgres — a cada requisição. Ver ADR-0002.
 */
export type AppRuntime = ManagedRuntime.ManagedRuntime<AppServices, never>;

export const makeRuntime = (layer: Layer.Layer<AppServices>): AppRuntime =>
  ManagedRuntime.make(layer);
