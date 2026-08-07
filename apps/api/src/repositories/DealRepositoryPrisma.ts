import {
  DEAL_STAGES,
  type DealId,
  type DealListQuery,
  type DealSortBy,
  type LeadId,
  type SortOrder,
  type UserId,
} from '@kikos/domain';
import { Effect, Layer, Option } from 'effect';
import type { Prisma } from '../generated/prisma/client';
import { createPrismaClient } from '../prisma';
import {
  DealRepository,
  boardColumnQuery,
  type DealColumn,
  type DealRecord,
  type DealWithDossier,
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
  // As duas dimensões de ADR-0003. O desfecho vem no card porque a coluna
  // Fechado precisa distinguir ganho de perdido sem abrir nenhum deles.
  stage: true,
  result: true,
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

/**
 * O `SELECT` da linha inteira do domínio — as colunas que `DealRecord` declara,
 * e nenhuma a mais. É o que o caso de uso lê para saber em que coluna o negócio
 * está antes de decidir se o movimento vale.
 */
const RECORD_SELECT = {
  id: true,
  title: true,
  valueInCents: true,
  leadId: true,
  ownerId: true,
  stage: true,
  result: true,
  description: true,
  expectedCloseDate: true,
  closedAt: true,
  lastInteractionAt: true,
  deletedAt: true,
} satisfies Prisma.DealSelect;

type DealRecordRow = Prisma.DealGetPayload<{ select: typeof RECORD_SELECT }>;

const toDealRecord = (row: DealRecordRow): DealRecord => ({
  ...row,
  // As marcas dos identificadores: o Prisma devolve `string`, o domínio pede o
  // tipo marcado. A conferência de forma já foi feita pelo banco.
  id: row.id as DealId,
  leadId: row.leadId as LeadId,
  ownerId: row.ownerId as UserId,
});

/**
 * O `SELECT` do detalhamento: o negócio inteiro, com o **dossiê** do cliente em
 * vez do resumo do card — telefone, e-mail e cargo, mais o responsável pelo
 * contato.
 *
 * Um `JOIN` mais largo numa consulta que devolve uma linha só. O card do board
 * não paga por ele: lá o `LIST_SELECT` continua trazendo apenas nome e empresa,
 * multiplicados por cinco colunas.
 */
const DETAIL_SELECT = {
  id: true,
  title: true,
  valueInCents: true,
  stage: true,
  result: true,
  description: true,
  expectedCloseDate: true,
  closedAt: true,
  lastInteractionAt: true,
  lead: {
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      phone: true,
      jobTitle: true,
      owner: { select: { id: true, name: true } },
    },
  },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.DealSelect;

type DealDetailRow = Prisma.DealGetPayload<{ select: typeof DETAIL_SELECT }>;

const toDealWithDossier = (row: DealDetailRow): DealWithDossier => ({
  ...row,
  id: row.id as DealId,
  lead: {
    ...row.lead,
    id: row.lead.id as LeadId,
    owner: { id: row.lead.owner.id as UserId, name: row.lead.owner.name },
  },
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

      findById: (id) =>
        Effect.promise(async () =>
          Option.fromNullable(
            // O filtro de remoção lógica mora aqui, como em toda leitura:
            // `findFirst` com a cláusula, e não `findUnique` pelo identificador.
            await prisma.deal.findFirst({
              where: { id, deletedAt: null },
              select: RECORD_SELECT,
            }),
          ).pipe(Option.map(toDealRecord)),
        ),

      detailById: (id) =>
        Effect.promise(async () =>
          Option.fromNullable(
            // O filtro de remoção lógica mora aqui, como em toda leitura.
            await prisma.deal.findFirst({
              where: { id, deletedAt: null },
              select: DETAIL_SELECT,
            }),
          ).pipe(Option.map(toDealWithDossier)),
        ),

      recordDealInteraction: (id, at) =>
        Effect.promise(async () => {
          /*
           * `updateMany`, e não `update`: o caso de uso já conferiu que o
           * negócio está lá, mas entre a leitura e a escrita ele pode ter sido
           * removido — e `update` estouraria como defeito onde nada a fazer
           * resta. Zero linhas afetadas é resposta legítima aqui.
           */
          await prisma.deal.updateMany({
            where: { id, deletedAt: null },
            data: { lastInteractionAt: at },
          });
        }),

      moveToStage: (id, move) =>
        Effect.promise(async () => {
          /*
           * A cláusula de remoção entra no `where` do próprio `update`: o caso
           * de uso já perguntou se o negócio está lá, mas quem garante que ele
           * continua lá no instante da escrita é o banco, e não a leitura de um
           * instante atrás.
           */
          const row = await prisma.deal.update({
            where: { id, deletedAt: null },
            data: { stage: move.stage, lastInteractionAt: move.at },
            // O mesmo `select` da listagem: a linha volta pronta para o card.
            select: LIST_SELECT,
          });

          return toDealWithRelations(row);
        }),

      close: (id, closing) =>
        Effect.promise(async () => {
          /*
           * **Um `UPDATE`, três colunas.** É aqui que "encerrar preenche
           * resultado, data de fechamento e estágio numa operação só" (ADR-0003)
           * deixa de ser uma frase e passa a ser garantido pelo banco: não há
           * instante em que um negócio esteja ganho e ainda no meio do funil,
           * nem em Fechado com o resultado em aberto.
           *
           * A cláusula de remoção entra no `where` do próprio `update`, como na
           * movimentação.
           */
          const row = await prisma.deal.update({
            where: { id, deletedAt: null },
            data: {
              result: closing.result,
              closedAt: closing.at,
              stage: 'CLOSED',
              lastInteractionAt: closing.at,
            },
            select: LIST_SELECT,
          });

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
