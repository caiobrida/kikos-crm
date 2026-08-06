import type { LeadId, LeadListQuery, LeadSortBy, SortOrder, UserId } from '@kikos/domain';
import { Effect, Layer } from 'effect';
import type { Prisma } from '../generated/prisma/client';
import { createPrismaClient } from '../prisma';
import { LeadRepository, type LeadWithOwner } from './LeadRepository';

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
 * Neutraliza os curingas do `LIKE` dentro do que o usuário digitou.
 *
 * O `contains` do Prisma vira `ILIKE '%termo%'`, e o termo entra no padrão sem
 * tratamento: uma busca por `_` sozinho casaria com **todas** as linhas, porque
 * `_` significa "um caractere qualquer". A barra invertida é o escape padrão do
 * `LIKE` no Postgres, e por isso precisa ser a primeira a ser escapada.
 *
 * Não é questão de segurança — o termo viaja como parâmetro, não concatenado —,
 * é de significado: aqui a busca casa com o que está escrito, como a Layer em
 * memória já fazia com `includes`.
 */
const escapeLikeWildcards = (term: string): string =>
  term.replace(/[\\%_]/g, (wildcard) => `\\${wildcard}`);

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
