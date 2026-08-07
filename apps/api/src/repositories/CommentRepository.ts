import {
  CommentId,
  type CommentKind,
  type DealId,
  type UserId,
  type UserSummary,
} from '@kikos/domain';
import { Context, Effect, Layer, Ref, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import type { UserRecord } from './UserRepository';

/**
 * Um registro da linha do tempo, como ele existe no banco.
 *
 * Três colunas que os outros registros do CRM têm não aparecem aqui, e a
 * ausência é a decisão: não há `updatedAt`, não há `deletedAt` e não há
 * `deletedBy`. A linha do tempo é histórico — comentário não se edita nem se
 * remove, e registro de sistema muito menos. Onde não existe coluna não existe
 * rota distraída que a escreva.
 */
export interface CommentRecord {
  readonly id: CommentId;
  readonly body: string;
  readonly kind: CommentKind;
  /** Obrigatório: todo registro pertence a um negócio, e só a um. */
  readonly dealId: DealId;
  /** Obrigatório também nas de sistema: quem executou a ação assina o registro. */
  readonly authorId: UserId;
  readonly createdAt: Date;
}

/**
 * Um registro com o autor já resolvido pelo `JOIN` — o que a linha do tempo
 * desenha.
 *
 * O formato bate com o Schema `Comment` do pacote compartilhado, e é o
 * compilador quem cobra que continue batendo: a rota codifica este valor com
 * aquele Schema, e um campo a mais ou a menos quebra o typecheck.
 */
export interface CommentWithAuthor {
  readonly id: CommentId;
  readonly kind: CommentKind;
  readonly body: string;
  readonly author: UserSummary;
  readonly createdAt: Date;
}

/**
 * Um registro a caminho do banco: a linha inteira menos o identificador, que o
 * banco gera.
 *
 * `createdAt` **está** aqui, e não é default de coluna: quem o decide é o caso
 * de uso, com o mesmo `now` que grava a última interação do negócio e do
 * contato. É o que faz o item aparecer no topo da linha do tempo e o card subir
 * na coluna descrevendo o mesmo instante.
 */
export type NewComment = Omit<CommentRecord, 'id'>;

/**
 * O repositório de Comment.
 *
 * **É a camada que a integração de IA vai consumir numa fase futura**, e por
 * isso ela é estreita de propósito: ler a linha do tempo de um negócio e
 * acrescentar um registro. Não há edição, não há remoção, e não há consulta
 * atravessando negócios — cada uma dessas portas seria uma decisão a defender
 * depois.
 *
 * Como os outros, é um `Context.Tag` satisfeito por duas Layers: uma sobre
 * Prisma e uma sobre um array em memória.
 */
export class CommentRepository extends Context.Tag('CommentRepository')<
  CommentRepository,
  {
    /**
     * A linha do tempo de um negócio, do mais recente para o mais antigo.
     *
     * **Não confere se o negócio existe**: quem precisa responder 404 é o caso
     * de uso, que já perguntou ao repositório de Deal — e é lá que mora o filtro
     * de remoção lógica. Um negócio inexistente aqui devolveria lista vazia, que
     * é uma resposta pior do que a recusa.
     */
    readonly listByDeal: (dealId: DealId) => Effect.Effect<readonly CommentWithAuthor[]>;
    /** Grava o registro e o devolve com o autor resolvido, pronto para a tela. */
    readonly create: (comment: NewComment) => Effect.Effect<CommentWithAuthor>;
  }
>() {}

/*
 * ---------------------------------------------------------------------------
 * A implementação em memória, usada pelos testes.
 * ---------------------------------------------------------------------------
 */

/**
 * Do mais recente para o mais antigo, com desempate pelo identificador.
 *
 * O desempate não é cosmético aqui pelo mesmo motivo das listagens: dois
 * registros gravados no mesmo milissegundo — um comentário e o registro de
 * sistema da mesma ação — precisam sair sempre na mesma ordem, ou a linha do
 * tempo mudaria de forma a cada leitura. A consulta de Prisma carrega o mesmo
 * desempate.
 */
const newestFirst = (a: CommentRecord, b: CommentRecord): number => {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
};

/**
 * A Layer em memória.
 *
 * O `Ref` vem de fora, como nos outros repositórios: o mesmo estado atravessa a
 * sessão de teste, então o registro de sistema que uma movimentação grava já
 * está lá quando a leitura seguinte pede a linha do tempo. Ver `inMemory.ts`.
 */
export const CommentRepositoryInMemory = (
  store: Ref.Ref<readonly CommentRecord[]>,
  users: readonly UserRecord[],
): Layer.Layer<CommentRepository> =>
  Layer.effect(
    CommentRepository,
    Effect.sync(() => {
      // Os Users não mudam: o CRM não cadastra conta (ADR-0001).
      const authors = new Map<UserId, UserSummary>(
        users.map((user) => [user.id, { id: user.id, name: user.name }]),
      );

      const withAuthor = (comment: CommentRecord): CommentWithAuthor => {
        const author = authors.get(comment.authorId);

        if (author === undefined) {
          // Defeito, não erro de domínio: no banco a chave estrangeira garante
          // que isto não acontece, e num teste significa fixture quebrada.
          throw new Error(
            `O registro ${comment.id} aponta para um autor ausente da Layer em memória.`,
          );
        }

        const { dealId: _dealId, authorId: _authorId, ...rest } = comment;
        return { ...rest, author };
      };

      return {
        listByDeal: (dealId) =>
          Ref.get(store).pipe(
            Effect.map((comments) =>
              comments
                .filter((comment) => comment.dealId === dealId)
                .sort(newestFirst)
                .map(withAuthor),
            ),
          ),

        create: (comment) =>
          Effect.gen(function* () {
            /*
             * O identificador nasce aqui porque no Postgres ele nasce no banco
             * (`@default(uuid())`): as duas Layers precisam responder a mesma
             * coisa a quem chamou, e quem chamou não escolhe identificador.
             */
            const record: CommentRecord = {
              ...comment,
              id: Schema.decodeSync(CommentId)(randomUUID()),
            };

            yield* Ref.update(store, (comments) => [...comments, record]);
            return withAuthor(record);
          }),
      };
    }),
  );
