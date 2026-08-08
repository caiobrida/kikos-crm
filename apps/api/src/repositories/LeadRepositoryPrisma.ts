import type { LeadId, LeadListQuery, LeadSortBy, SortOrder, UserId } from '@kikos/domain';
import { Effect, Layer, Option } from 'effect';
import type { Prisma } from '../generated/prisma/client';
import { createPrismaClient } from '../prisma';
import {
  LeadRepository,
  type LeadDetailWithOwner,
  type LeadRecord,
  type LeadWithOwner,
} from './LeadRepository';
import { escapeLikeWildcards } from './like';
import { toOwnerCounts } from './ownerCounts';

/*
 * A implementação sobre Prisma.
 *
 * O contrato inteiro da listagem cabe em uma consulta e uma contagem, e é essa
 * a razão de a seam de teste ficar acima daqui: o que existe neste arquivo é
 * tradução de um recorte já validado para SQL, e não regra de negócio.
 */

/** O `SELECT` da listagem: as colunas que a tabela desenha, e só elas. */
const LIST_SELECT = {
  id: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  source: true,
  status: true,
  lastInteractionAt: true,
  // O `JOIN`, escrito como relação: o responsável vem junto de cada linha, em
  // vez de uma consulta por Lead depois.
  owner: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

type LeadRow = Prisma.LeadGetPayload<{ select: typeof LIST_SELECT }>;

const toLeadWithOwner = (row: LeadRow): LeadWithOwner => ({
  ...row,
  id: row.id as LeadId,
  owner: { id: row.owner.id as UserId, name: row.owner.name },
});

/**
 * O `SELECT` da linha inteira do domínio — as colunas que `LeadRecord` declara,
 * e nenhuma a mais. É o que o caso de uso lê para conferir se o contato ainda
 * está aí antes de vincular um negócio a ele.
 */
const RECORD_SELECT = {
  id: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  jobTitle: true,
  source: true,
  status: true,
  ownerId: true,
  notes: true,
  lastInteractionAt: true,
  deletedAt: true,
} satisfies Prisma.LeadSelect;

type LeadRecordRow = Prisma.LeadGetPayload<{ select: typeof RECORD_SELECT }>;

const toLeadRecord = (row: LeadRecordRow): LeadRecord => ({
  ...row,
  // As marcas dos identificadores: o Prisma devolve `string`, o domínio pede o
  // tipo marcado. A conferência de forma já foi feita pelo banco.
  id: row.id as LeadId,
  ownerId: row.ownerId as UserId,
});

/**
 * O `SELECT` do detalhamento: o contato inteiro, com o responsável resolvido.
 *
 * A diferença para o da listagem são `jobTitle` e `notes` — as duas colunas que
 * a tabela não desenha e que o formulário de edição precisa preencher. Um
 * `SELECT` mais largo numa consulta que devolve uma linha só; a lista continua
 * pagando o estreito, multiplicado por dez linhas.
 */
const DETAIL_SELECT = {
  ...LIST_SELECT,
  jobTitle: true,
  notes: true,
} satisfies Prisma.LeadSelect;

type LeadDetailRow = Prisma.LeadGetPayload<{ select: typeof DETAIL_SELECT }>;

const toLeadDetail = (row: LeadDetailRow): LeadDetailWithOwner => ({
  ...row,
  id: row.id as LeadId,
  owner: { id: row.owner.id as UserId, name: row.owner.name },
});

/**
 * O `WHERE` da listagem.
 *
 * A primeira condição é a que não pode faltar em consulta nenhuma: registro
 * removido não existe para quem lê. Ela mora aqui, e não na rota, porque uma
 * rota nova que esquecesse a cláusula faria um contato apagado reaparecer.
 */
const whereFrom = (query: LeadListQuery): Prisma.LeadWhereInput => {
  const search =
    query.search === undefined ? undefined : escapeLikeWildcards(query.search);

  return {
    deletedAt: null,
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.ownerId === undefined ? {} : { ownerId: query.ownerId }),
    ...(search === undefined
      ? {}
      : {
          // `mode: 'insensitive'` vira `ILIKE`: buscar "RITMO" acha "Academia
          // Ritmo".
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { company: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
  };
};

/** A coluna pedida, mais o desempate que torna a paginação confiável. */
const orderByFrom = (
  sortBy: LeadSortBy,
  order: SortOrder,
): Prisma.LeadOrderByWithRelationInput[] => {
  const column: Prisma.LeadOrderByWithRelationInput =
    sortBy === 'owner' ? { owner: { name: order } } : { [sortBy]: order };

  /*
   * O `id` como último critério não é firula: sem uma ordem total, duas linhas
   * empatadas — dois Leads com o mesmo status, por exemplo — podem trocar de
   * lugar entre a consulta da página 1 e a da página 2, e aí um registro some
   * ou aparece duas vezes. A Layer em memória carrega o mesmo desempate.
   *
   * Ordenar por `status` também sai certo de graça: no Postgres um `ORDER BY`
   * sobre coluna `enum` segue a ordem em que os valores foram declarados, que
   * é a do funil.
   */
  return [column, { id: 'asc' }];
};

export const LeadRepositoryPrisma: Layer.Layer<LeadRepository> = Layer.scoped(
  LeadRepository,
  Effect.gen(function* () {
    const prisma = yield* Effect.acquireRelease(
      Effect.sync(createPrismaClient),
      (client) => Effect.promise(() => client.$disconnect()),
    );

    return {
      create: (lead) =>
        Effect.promise(async () => {
          // O mesmo `select` da listagem: a linha volta pronta para a tabela,
          // com o responsável trazido pelo `JOIN` da própria inserção.
          const row = await prisma.lead.create({ data: lead, select: LIST_SELECT });

          return toLeadWithOwner(row);
        }),

      findById: (id) =>
        Effect.promise(async () =>
          Option.fromNullable(
            // O filtro de remoção lógica mora aqui, como em toda leitura:
            // `findFirst` com a cláusula, e não `findUnique` pelo identificador.
            await prisma.lead.findFirst({
              where: { id, deletedAt: null },
              select: RECORD_SELECT,
            }),
          ).pipe(Option.map(toLeadRecord)),
        ),

      detailById: (id) =>
        Effect.promise(async () =>
          Option.fromNullable(
            // O filtro de remoção lógica mora aqui, como em toda leitura.
            await prisma.lead.findFirst({
              where: { id, deletedAt: null },
              select: DETAIL_SELECT,
            }),
          ).pipe(Option.map(toLeadDetail)),
        ),

      update: (id, changes) =>
        Effect.promise(async () => {
          /*
           * A cláusula de remoção entra no `where` do próprio `update`: o caso
           * de uso já perguntou se o contato está lá, mas quem garante que ele
           * continua lá no instante da escrita é o banco, e não a leitura de um
           * instante atrás.
           */
          const row = await prisma.lead.update({
            where: { id, deletedAt: null },
            data: changes,
            // O mesmo `select` da listagem: a linha volta pronta para a tabela.
            select: LIST_SELECT,
          });

          return toLeadWithOwner(row);
        }),

      softDelete: (id, at) =>
        Effect.promise(async () => {
          /*
           * `updateMany`, e não `delete`: a remoção é lógica. A linha continua
           * no banco — os negócios dela apontam para ela —, e o que muda é que
           * toda leitura desta camada deixa de enxergá-la.
           *
           * O `where` com `deletedAt: null` também torna a operação idempotente:
           * remover duas vezes não sobrescreve a data da primeira, que é a que
           * conta.
           */
          await prisma.lead.updateMany({
            where: { id, deletedAt: null },
            data: { deletedAt: at },
          });
        }),

      recordLeadInteraction: (id, interaction) =>
        Effect.promise(async () => {
          /*
           * `updateMany` e não `update`: só ele aceita `deletedAt` no `where`.
           * Um contato removido não é sincronizado, e a operação não estoura —
           * quem precisava da recusa é o caso de uso, que perguntou antes.
           */
          await prisma.lead.updateMany({
            where: { id, deletedAt: null },
            data: {
              lastInteractionAt: interaction.at,
              // A coluna fora do `data` é coluna que o `UPDATE` não toca: é
              // assim que a interação sem status deixa o selo onde está.
              ...(interaction.status === undefined ? {} : { status: interaction.status }),
            },
          });
        }),

      countByOwner: () =>
        Effect.promise(() =>
          /*
           * O `GROUP BY` faz o trabalho no banco: o que atravessa a rede é uma
           * linha por responsável, e não a carteira inteira para ser contada em
           * memória. O filtro de remoção lógica vale aqui como em toda leitura
           * desta camada — sem ele, a tela de Vendedores mostraria contatos que
           * a lista de Leads não mostra.
           */
          prisma.lead.groupBy({
            by: ['ownerId'],
            where: { deletedAt: null },
            _count: { _all: true },
          }),
        ).pipe(Effect.map(toOwnerCounts)),

      list: (query) =>
        Effect.promise(async () => {
          const where = whereFrom(query);

          /*
           * As duas consultas vão juntas: a página pedida e o tamanho do
           * recorte inteiro. `$transaction` com uma lista as manda numa
           * transação só, então o total nunca descreve um recorte diferente do
           * que os dados mostram.
           */
          const [rows, total] = await prisma.$transaction([
            prisma.lead.findMany({
              where,
              select: LIST_SELECT,
              orderBy: orderByFrom(query.sortBy, query.order),
              skip: (query.page - 1) * query.pageSize,
              take: query.pageSize,
            }),
            prisma.lead.count({ where }),
          ]);

          return { data: rows.map(toLeadWithOwner), total };
        }),
    };
  }),
);
