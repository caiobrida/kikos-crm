import {
  LEAD_STATUSES,
  type LeadId,
  type LeadListQuery,
  type LeadSortBy,
  type LeadSource,
  type LeadStatus,
  type SortOrder,
  type UserId,
  type UserSummary,
} from '@kikos/domain';
import { Context, Effect, Layer, Ref } from 'effect';
import type { UserRecord } from './UserRepository';

/**
 * O Lead como ele existe no banco.
 *
 * Duas colunas aqui não aparecem no Schema que sai pela API: `ownerId`, que a
 * listagem troca pelo responsável resolvido, e `deletedAt`, que é assunto
 * exclusivo desta camada.
 */
export interface LeadRecord {
  readonly id: LeadId;
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly phone: string;
  readonly jobTitle: string | null;
  readonly source: LeadSource;
  readonly status: LeadStatus;
  readonly ownerId: UserId;
  readonly notes: string | null;
  readonly lastInteractionAt: Date;
  /** Preenchido pela remoção lógica. Nunca sai desta camada. */
  readonly deletedAt: Date | null;
}

/**
 * O Lead com o responsável já resolvido — o resultado do `JOIN`.
 *
 * O formato bate com o Schema `Lead` do pacote compartilhado, e é o compilador
 * quem cobra que continue batendo: a rota codifica este valor com aquele
 * Schema, e um campo a mais ou a menos quebra o typecheck.
 */
export type LeadWithOwner = Omit<LeadRecord, 'ownerId' | 'deletedAt'> & {
  readonly owner: UserSummary;
};

/** Uma fatia de resultados: a página pedida e o tamanho do recorte inteiro. */
export interface Slice<A> {
  readonly data: readonly A[];
  /** O total do recorte depois dos filtros, antes do corte da página. */
  readonly total: number;
}

/**
 * O repositório de Lead.
 *
 * **O filtro que exclui registros removidos mora aqui, e em nenhum outro
 * lugar.** Uma rota que esquecesse de aplicá-lo faria um contato apagado
 * reaparecer na tela; nesta camada, todo caminho de leitura passa pelo mesmo
 * ponto e o esquecimento deixa de ser possível.
 *
 * Como o `UserRepository`, é um `Context.Tag` satisfeito por duas Layers — uma
 * sobre Prisma e uma sobre um `Map` em memória. É a seam que deixa os testes de
 * API exercitarem rota, Schema, autenticação e mapa de erro sem Postgres.
 */
export class LeadRepository extends Context.Tag('LeadRepository')<
  LeadRepository,
  {
    /** Busca, filtro, ordenação e paginação, resolvidos de uma vez só. */
    readonly list: (query: LeadListQuery) => Effect.Effect<Slice<LeadWithOwner>>;
  }
>() {}

/*
 * ---------------------------------------------------------------------------
 * A implementação em memória, usada pelos testes.
 * ---------------------------------------------------------------------------
 *
 * Ela repete em TypeScript o que a de Prisma pede em SQL. As duas precisam
 * concordar em detalhes que não são óbvios — a ordem do enum de status, o
 * desempate estável, o `ILIKE` que ignora a caixa — e é por isso que cada um
 * deles leva um comentário dos dois lados.
 */

const matchesSearch = (lead: LeadRecord, term: string): boolean => {
  // O mesmo que o `mode: 'insensitive'` do Prisma faz virar `ILIKE '%termo%'`.
  const needle = term.toLocaleLowerCase();

  return [lead.name, lead.company, lead.email].some((field) =>
    field.toLocaleLowerCase().includes(needle),
  );
};

/**
 * O comparador de uma coluna, sempre em ordem crescente. A direção é aplicada
 * depois, uma vez só — inverter aqui dobraria os casos a manter.
 */
const compareBy = (
  sortBy: LeadSortBy,
  owners: ReadonlyMap<UserId, UserSummary>,
): ((a: LeadRecord, b: LeadRecord) => number) => {
  switch (sortBy) {
    case 'name':
      return (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    case 'company':
      return (a, b) => a.company.localeCompare(b.company, 'pt-BR');
    case 'status':
      /*
       * A ordem do funil, não a do dicionário. No Postgres isto sai de graça:
       * `ORDER BY` sobre uma coluna `enum` usa a ordem em que os valores foram
       * declarados, que é a mesma de `LEAD_STATUSES`.
       */
      return (a, b) => LEAD_STATUSES.indexOf(a.status) - LEAD_STATUSES.indexOf(b.status);
    case 'owner':
      return (a, b) =>
        (owners.get(a.ownerId)?.name ?? '').localeCompare(
          owners.get(b.ownerId)?.name ?? '',
          'pt-BR',
        );
    case 'lastInteractionAt':
      return (a, b) => a.lastInteractionAt.getTime() - b.lastInteractionAt.getTime();
  }
};

const sortLeads = (
  leads: readonly LeadRecord[],
  sortBy: LeadSortBy,
  order: SortOrder,
  owners: ReadonlyMap<UserId, UserSummary>,
): readonly LeadRecord[] => {
  const compare = compareBy(sortBy, owners);
  const direction = order === 'asc' ? 1 : -1;

  return [...leads].sort((a, b) => {
    const result = compare(a, b) * direction;
    /*
     * O desempate pelo identificador não é cosmético: sem uma ordem total,
     * duas linhas empatadas podem trocar de lugar entre a consulta da página 1
     * e a da página 2, e um registro some ou aparece duas vezes. A consulta de
     * Prisma carrega o mesmo `id` como último critério.
     */
    return result !== 0 ? result : a.id.localeCompare(b.id);
  });
};

export const LeadRepositoryInMemory = (
  initialLeads: readonly LeadRecord[],
  /** Os Users que a listagem usa para resolver o responsável — o `JOIN` à mão. */
  users: readonly UserRecord[],
): Layer.Layer<LeadRepository> =>
  Layer.effect(
    LeadRepository,
    Effect.gen(function* () {
      const store = yield* Ref.make<readonly LeadRecord[]>(initialLeads);

      const owners = new Map<UserId, UserSummary>(
        users.map((user) => [user.id, { id: user.id, name: user.name }]),
      );

      const withOwner = (lead: LeadRecord): LeadWithOwner => {
        const owner = owners.get(lead.ownerId);
        if (owner === undefined) {
          // Defeito, não erro de domínio: no banco a chave estrangeira garante
          // que isto não acontece, e num teste significa fixture quebrada.
          throw new Error(
            `Lead ${lead.id} aponta para um responsável ausente da Layer em memória.`,
          );
        }

        const { ownerId: _ownerId, deletedAt: _deletedAt, ...rest } = lead;
        return { ...rest, owner };
      };

      return {
        list: (query) =>
          Ref.get(store).pipe(
            Effect.map((leads) => {
              const matching = leads.filter(
                (lead) =>
                  // O filtro de remoção lógica vem primeiro e não é opcional.
                  lead.deletedAt === null &&
                  (query.search === undefined || matchesSearch(lead, query.search)) &&
                  (query.status === undefined || lead.status === query.status) &&
                  (query.ownerId === undefined || lead.ownerId === query.ownerId),
              );

              const ordered = sortLeads(matching, query.sortBy, query.order, owners);
              const from = (query.page - 1) * query.pageSize;

              return {
                data: ordered.slice(from, from + query.pageSize).map(withOwner),
                // O total é do recorte inteiro, não da página devolvida.
                total: matching.length,
              };
            }),
          ),
      };
    }),
  );
