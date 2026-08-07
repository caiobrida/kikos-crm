import {
  DEAL_STAGES,
  type DealId,
  type DealListQuery,
  type DealSortBy,
  type LeadId,
  type SortOrder,
  type UserId,
} from '@kikos/domain';
import { Effect, Layer } from 'effect';
import type { Prisma } from '../generated/prisma/client';
import { createPrismaClient } from '../prisma';
import {
  DealRepository,
  boardColumnQuery,
  type DealColumn,
  type DealWithRelations,
} from './DealRepository';
import { escapeLikeWildcards } from './like';

/*
 * A implementação sobre Prisma.
 *
 * Como a de Lead, o que existe aqui é tradução de um recorte já validado para
 * SQL, e não regra de negócio — é por isso que a seam de teste fica acima daqui.
 */

/** O `SELECT` da listagem: o que o card do board desenha, e só isso. */
const LIST_SELECT = {
  id: true,
  title: true,
  valueInCents: true,
  stage: true,
  // Os dois `JOIN`, escritos como relação: o Lead e o responsável vêm junto de
  // cada linha, em vez de uma consulta por card depois.
  lead: { select: { id: true, name: true, company: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.DealSelect;

type DealRow = Prisma.DealGetPayload<{ select: typeof LIST_SELECT }>;

const toDealWithRelations = (row: DealRow): DealWithRelations => ({
  ...row,
  id: row.id as DealId,
  lead: { ...row.lead, id: row.lead.id as LeadId },
  owner: { id: row.owner.id as UserId, name: row.owner.name },
});

/** O que o board e a listagem filtram — tudo menos ordem e página. */
type DealFilters = Pick<DealListQuery, 'stage' | 'search' | 'ownerId'>;

/**
 * O `WHERE` da listagem.
 *
 * A primeira condição é a que não pode faltar em consulta nenhuma: registro
 * removido não existe para quem lê. Ela mora aqui, e não na rota, porque uma
 * rota nova que esquecesse a cláusula faria um negócio apagado reaparecer no
 * funil — e, pior, no contador da coluna.
 */
const whereFrom = (filters: DealFilters): Prisma.DealWhereInput => {
  const search =
    filters.search === undefined ? undefined : escapeLikeWildcards(filters.search);

  return {
    deletedAt: null,
    ...(filters.stage === undefined ? {} : { stage: filters.stage }),
    ...(filters.ownerId === undefined ? {} : { ownerId: filters.ownerId }),
    ...(search === undefined
      ? {}
      : {
          /*
           * A busca do board atravessa o `JOIN`: o vendedor procura tanto pelo
           * negócio ("esteiras") quanto pelo cliente ("Ritmo"), e das duas
           * formas o card que ele quer está na mesma coluna.
           * `mode: 'insensitive'` vira `ILIKE`.
           */
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { lead: { name: { contains: search, mode: 'insensitive' } } },
            { lead: { company: { contains: search, mode: 'insensitive' } } },
          ],
        }),
  };
};

/** A coluna pedida, mais o desempate que torna a paginação confiável. */
const orderByFrom = (
  sortBy: DealSortBy,
  order: SortOrder,
): Prisma.DealOrderByWithRelationInput[] => {
  const column: Prisma.DealOrderByWithRelationInput =
    sortBy === 'lead'
      ? { lead: { name: order } }
      : sortBy === 'owner'
        ? { owner: { name: order } }
        : { [sortBy]: order };

  /*
   * O `id` como último critério não é firula: sem uma ordem total, dois cards
   * empatados podem trocar de lugar entre a primeira página de uma coluna e a
   * segunda, e um negócio some ou aparece duas vezes no "carregar mais". A
   * Layer em memória carrega o mesmo desempate.
   */
  return [column, { id: 'asc' }];
};

/**
 * A consulta de uma página, escrita **uma vez** e usada pelos dois caminhos: a
 * listagem paginada e cada coluna do board.
 *
 * É o que garante, do lado do SQL, o que `boardColumnQuery` garante do lado do
 * recorte: a página 2 de uma coluna sai da mesma consulta que produziu a
 * página 1.
 */
const findPage = (
  client: Prisma.TransactionClient,
  query: DealListQuery,
  /*
   * `PrismaPromise`, e não `Promise`: só o tipo do Prisma pode entrar na forma
   * em lista do `$transaction`, que é como a listagem manda a página e a
   * contagem numa transação só.
   */
): Prisma.PrismaPromise<DealRow[]> =>
  client.deal.findMany({
    where: whereFrom(query),
    select: LIST_SELECT,
    orderBy: orderByFrom(query.sortBy, query.order),
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

export const DealRepositoryPrisma: Layer.Layer<DealRepository> = Layer.scoped(
  DealRepository,
  Effect.gen(function* () {
    const prisma = yield* Effect.acquireRelease(
      Effect.sync(createPrismaClient),
      (client) => Effect.promise(() => client.$disconnect()),
    );

    return {
      create: (deal) =>
        Effect.promise(async () => {
          // O mesmo `select` da listagem: a linha volta pronta para o card, com
          // o Lead e o responsável trazidos pelo `JOIN` da própria inserção.
          const row = await prisma.deal.create({ data: deal, select: LIST_SELECT });

          return toDealWithRelations(row);
        }),

      list: (query) =>
        Effect.promise(async () => {
          /*
           * As duas consultas vão juntas: a página pedida e o tamanho do
           * recorte inteiro. `$transaction` as manda numa transação só, então o
           * total nunca descreve um recorte diferente do que os dados mostram.
           */
          const [rows, total] = await prisma.$transaction([
            findPage(prisma, query),
            prisma.deal.count({ where: whereFrom(query) }),
          ]);

          return { data: rows.map(toDealWithRelations), total };
        }),

      board: (query) =>
        Effect.promise(async () =>
          /*
           * O board é uma transação só, com seis consultas: um `GROUP BY` que
           * traz os cinco contadores de uma vez, e uma página por coluna.
           *
           * Contar por agregação em vez de cinco `count` separados não é
           * economia de linha: é o que mantém os totais e os cards descrevendo
           * o mesmo instante do funil, que é o ponto inteiro de o contador vir
           * do servidor.
           */
          prisma.$transaction(async (tx) => {
            const totals = await tx.deal.groupBy({
              by: ['stage'],
              where: whereFrom(query),
              _count: { _all: true },
            });

            const columns: DealColumn[] = [];

            for (const stage of DEAL_STAGES) {
              const rows = await findPage(tx, boardColumnQuery(stage, query));

              columns.push({
                stage,
                // Uma coluna sem negócio nenhum não aparece no `GROUP BY`, e
                // ela precisa aparecer no board: coluna vazia também é
                // informação sobre o funil.
                total: totals.find((row) => row.stage === stage)?._count._all ?? 0,
                deals: rows.map(toDealWithRelations),
              });
            }

            return columns;
          }),
        ),
    };
  }),
);
