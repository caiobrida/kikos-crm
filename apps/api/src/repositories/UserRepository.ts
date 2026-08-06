import type { UserId, UserRole } from '@kikos/domain';
import { Context, Effect, Layer, Option, Ref } from 'effect';

/**
 * O User como ele existe no banco — com o hash da senha e a `tokenVersion`,
 * que o `SessionUser` do pacote compartilhado não carrega.
 *
 * Este tipo mora na API de propósito: `packages/domain` é importado pelo
 * navegador, e um hash de senha não tem o que fazer lá.
 */
export interface UserRecord {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly tokenVersion: number;
}

/**
 * O repositório de User.
 *
 * `Context.Tag` é injeção de dependência com verificação de tipo: a classe é
 * ao mesmo tempo a *chave* (o que um programa pede) e o *tipo do serviço* (o
 * que uma implementação precisa oferecer). Em TypeScript comum seria uma
 * `interface UserRepository` mais um contêiner que resolve a implementação —
 * com a diferença de que aqui a dependência aparece no tipo do programa: um
 * `Effect<A, E, UserRepository>` não roda enquanto alguém não fornecer a Layer.
 *
 * **Esta é a seam de teste de todo o projeto.** Duas Layers a satisfazem: uma
 * sobre Prisma e uma sobre um `Map` em memória. É a substituição mais alta
 * possível — abaixo dela rodam as rotas do Fastify, a validação de Schema, o
 * middleware de autenticação e o mapa de erro. É por isso que os testes de API
 * não precisam de banco.
 *
 * Nenhum método tem canal de erro: "não encontrado" é um `Option`, e banco fora
 * do ar é defeito, não erro de domínio — vira 500, não um `switch` a mais.
 */
export class UserRepository extends Context.Tag('UserRepository')<
  UserRepository,
  {
    /** O e-mail chega já normalizado pelo Schema `Email` (aparado, caixa baixa). */
    readonly findByEmail: (email: string) => Effect.Effect<Option.Option<UserRecord>>;
    readonly findById: (id: UserId) => Effect.Effect<Option.Option<UserRecord>>;
    /** Invalida todos os tokens do User. Não faz nada se o User não existir. */
    readonly incrementTokenVersion: (id: UserId) => Effect.Effect<void>;
  }
>() {}

/**
 * A implementação em memória, usada pelos testes.
 *
 * `Ref` é uma célula mutável que só é lida e escrita dentro de um Effect — o
 * equivalente a uma variável de módulo, mas sem estado escapando para fora do
 * grafo de execução. Cada Layer construída aqui tem o seu, então dois testes
 * rodando em paralelo não enxergam a escrita um do outro.
 */
export const UserRepositoryInMemory = (
  initialUsers: readonly UserRecord[],
): Layer.Layer<UserRepository> =>
  Layer.effect(
    UserRepository,
    Effect.gen(function* () {
      /*
       * `Effect.gen` é a notação `async/await` do Effect: `yield*` no lugar de
       * `await`, e o que ele desembrulha é um Effect em vez de uma Promise.
       */
      const store = yield* Ref.make<ReadonlyMap<UserId, UserRecord>>(
        new Map(initialUsers.map((user) => [user.id, user])),
      );

      return {
        findByEmail: (email) =>
          Ref.get(store).pipe(
            Effect.map((users) =>
              Option.fromNullable(
                [...users.values()].find((user) => user.email === email),
              ),
            ),
          ),

        findById: (id) =>
          Ref.get(store).pipe(Effect.map((users) => Option.fromNullable(users.get(id)))),

        incrementTokenVersion: (id) =>
          Ref.update(store, (users) => {
            const user = users.get(id);
            if (user === undefined) return users;

            const updated = new Map(users);
            updated.set(id, { ...user, tokenVersion: user.tokenVersion + 1 });
            return updated;
          }),
      };
    }),
  );
