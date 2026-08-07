import type { CommentId, UserId } from '@kikos/domain';
import { Effect, Layer } from 'effect';
import type { Prisma } from '../generated/prisma/client';
import { createPrismaClient } from '../prisma';
import { CommentRepository, type CommentWithAuthor } from './CommentRepository';

/*
 * A implementação sobre Prisma.
 *
 * Como as outras, o que existe aqui é tradução para SQL, e não regra de negócio
 * — é por isso que a seam de teste fica acima daqui.
 */

/** O `SELECT` da linha do tempo: o que a tela desenha, e só isso. */
const TIMELINE_SELECT = {
  id: true,
  kind: true,
  body: true,
  createdAt: true,
  // O `JOIN` do autor, escrito como relação: ele vem junto de cada registro, em
  // vez de uma consulta por item depois.
  author: { select: { id: true, name: true } },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof TIMELINE_SELECT }>;

const toCommentWithAuthor = (row: CommentRow): CommentWithAuthor => ({
  ...row,
  // As marcas dos identificadores: o Prisma devolve `string`, o domínio pede o
  // tipo marcado. A conferência de forma já foi feita pelo banco.
  id: row.id as CommentId,
  author: { id: row.author.id as UserId, name: row.author.name },
});

export const CommentRepositoryPrisma: Layer.Layer<CommentRepository> = Layer.scoped(
  CommentRepository,
  Effect.gen(function* () {
    const prisma = yield* Effect.acquireRelease(
      Effect.sync(createPrismaClient),
      (client) => Effect.promise(() => client.$disconnect()),
    );

    return {
      listByDeal: (dealId) =>
        Effect.promise(async () => {
          const rows = await prisma.comment.findMany({
            where: { dealId },
            select: TIMELINE_SELECT,
            /*
             * Do mais recente para o mais antigo, com o `id` como desempate:
             * um comentário e o registro de sistema da mesma ação podem cair no
             * mesmo instante, e sem ordem total a linha do tempo mudaria de
             * forma a cada leitura. A Layer em memória carrega o mesmo
             * desempate.
             */
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          });

          return rows.map(toCommentWithAuthor);
        }),

      create: (comment) =>
        Effect.promise(async () => {
          // O mesmo `select` da leitura: a linha volta pronta para a tela, com
          // o autor trazido pelo `JOIN` da própria inserção.
          const row = await prisma.comment.create({
            data: comment,
            select: TIMELINE_SELECT,
          });

          return toCommentWithAuthor(row);
        }),
    };
  }),
);
