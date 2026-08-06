import {
  BOARD_COLUMN_PAGE_SIZE,
  DEAL_STAGES,
  type DealBoardQuery,
  type DealId,
  type DealListQuery,
  type DealResult,
  type DealSortBy,
  type DealStage,
  type LeadId,
  type LeadSummary,
  type SortOrder,
  type UserId,
  type UserSummary,
} from '@kikos/domain';
import { Context, Effect, Layer, Ref } from 'effect';
import type { LeadRecord } from './LeadRepository';
import type { Slice } from './Slice';
import type { UserRecord } from './UserRepository';

/**
 * O Deal como ele existe no banco.
 *
 * O modelo nasce completo — estágio, resultado, data de fechamento, última
 * interação e remoção lógica —, mesmo que esta fatia só leia. As fatias de
 * movimentação e encerramento escrevem nessas colunas sem precisar de migration
 * nova, pelo mesmo motivo que o `deletedAt` do Lead nasceu antes da remoção.
 */
export interface DealRecord {
  readonly id: DealId;
  readonly title: string;
  /** Inteiro em centavos. Ver `money.ts` no pacote de domínio. */
  readonly valueInCents: number;
  readonly leadId: LeadId;
  readonly ownerId: UserId;
  readonly stage: DealStage;
  /** Ortogonal ao estágio: onde está × se terminou e como (ADR-0003). */
  readonly result: DealResult;
  readonly description: string | null;
  readonly expectedCloseDate: Date | null;
  /** Preenchido junto do resultado, no encerramento. */
  readonly closedAt: Date | null;
  readonly lastInteractionAt: Date;
  /** Preenchido pela remoção lógica. Nunca sai desta camada. */
  readonly deletedAt: Date | null;
}

/**
 * Um Deal com o Lead e o responsável já resolvidos pelo `JOIN` — o que o card
 * do board desenha e o que a listagem paginada devolve.
 *
 * O formato bate com o Schema `DealListItem` do pacote compartilhado, e é o
 * compilador quem cobra que continue batendo: a rota codifica este valor com
 * aquele Schema, e um campo a mais ou a menos quebra o typecheck.
 */
export interface DealWithRelations {
  readonly id: DealId;
  readonly title: string;
  readonly valueInCents: number;
  readonly stage: DealStage;
  readonly lead: LeadSummary;
  readonly owner: UserSummary;
}

/** Uma coluna do board: a primeira leva de cards e o total real da coluna. */
export interface DealColumn {
  readonly stage: DealStage;
  readonly total: number;
  readonly deals: readonly DealWithRelations[];
}

/**
 * O recorte de uma coluna do board, **escrito na forma da listagem paginada**.
 *
 * É daqui que sai a garantia mais importante desta fatia: o board não tem
 * consulta própria, ele é a listagem rodada cinco vezes com o estágio fixado.
 * Ordem e tamanho de página nascem no mesmo lugar, então a página 2 que o
 * "carregar mais" pede a `GET /deals` continua exatamente de onde a coluna
 * parou — sem repetir nem pular card.
 */
export const boardColumnQuery = (
  stage: DealStage,
  query: DealBoardQuery,
): DealListQuery => ({
  stage,
  search: query.search,
  ownerId: query.ownerId,
  // O mesmo default de `DealListQuery`: mais recente primeiro.
  sortBy: 'lastInteractionAt',
  order: 'desc',
  page: 1,
  pageSize: BOARD_COLUMN_PAGE_SIZE,
});

/**
 * O repositório de Deal.
 *
 * Como o de Lead, **o filtro que exclui registros removidos mora aqui e em
 * nenhum outro lugar**, e é um `Context.Tag` satisfeito por duas Layers — uma
 * sobre Prisma e uma sobre um array em memória.
 */
export class DealRepository extends Context.Tag('DealRepository')<
  DealRepository,
  {
    /** Busca, filtro, ordenação e paginação, resolvidos de uma vez só. */
    readonly list: (query: DealListQuery) => Effect.Effect<Slice<DealWithRelations>>;
    /** As cinco colunas do board, cada uma com a primeira página e o total. */
    readonly board: (query: DealBoardQuery) => Effect.Effect<readonly DealColumn[]>;
  }
>() {}

/*
 * ---------------------------------------------------------------------------
 * A implementação em memória, usada pelos testes.
 * ---------------------------------------------------------------------------
 *
 * Como a de Lead, ela repete em TypeScript o que a de Prisma pede em SQL, e os
 * detalhes em que as duas precisam concordar — a ordem do enum de estágio, o
 * desempate estável, o `ILIKE` que ignora a caixa — levam comentário dos dois
 * lados.
 */

/** O comparador de uma coluna, sempre crescente. A direção é aplicada depois. */
const compareBy = (
  sortBy: DealSortBy,
  leads: ReadonlyMap<LeadId, LeadSummary>,
  owners: ReadonlyMap<UserId, UserSummary>,
): ((a: DealRecord, b: DealRecord) => number) => {
  switch (sortBy) {
    // `localeCompare('pt-BR')` e não `<`: o banco é criado com collation ICU
    // pt-BR justamente para os dois lados da seam concordarem.
    case 'title':
      return (a, b) => a.title.localeCompare(b.title, 'pt-BR');
    case 'valueInCents':
      return (a, b) => a.valueInCents - b.valueInCents;
    case 'lead':
      return (a, b) =>
        (leads.get(a.leadId)?.name ?? '').localeCompare(
          leads.get(b.leadId)?.name ?? '',
          'pt-BR',
        );
    case 'owner':
      return (a, b) =>
        (owners.get(a.ownerId)?.name ?? '').localeCompare(
          owners.get(b.ownerId)?.name ?? '',
          'pt-BR',
        );
    case 'stage':
      /*
       * A ordem do funil, não a do dicionário. No Postgres isto sai de graça:
       * `ORDER BY` sobre coluna `enum` usa a ordem de declaração dos valores,
       * que é a mesma de `DEAL_STAGES`.
       */
      return (a, b) => DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage);
    case 'lastInteractionAt':
      return (a, b) => a.lastInteractionAt.getTime() - b.lastInteractionAt.getTime();
  }
};

export const DealRepositoryInMemory = (
  initialDeals: readonly DealRecord[],
  /** Os Leads e os Users que a listagem usa para resolver o `JOIN` à mão. */
  leads: readonly LeadRecord[],
  users: readonly UserRecord[],
): Layer.Layer<DealRepository> =>
  Layer.effect(
    DealRepository,
    Effect.gen(function* () {
      const store = yield* Ref.make<readonly DealRecord[]>(initialDeals);

      const leadsById = new Map<LeadId, LeadSummary>(
        leads.map((lead) => [
          lead.id,
          { id: lead.id, name: lead.name, company: lead.company },
        ]),
      );

      const owners = new Map<UserId, UserSummary>(
        users.map((user) => [user.id, { id: user.id, name: user.name }]),
      );

      const resolve = (deal: DealRecord): DealWithRelations => {
        const lead = leadsById.get(deal.leadId);
        const owner = owners.get(deal.ownerId);

        if (lead === undefined || owner === undefined) {
          // Defeito, não erro de domínio: no banco as chaves estrangeiras
          // garantem que isto não acontece, e num teste significa fixture
          // quebrada.
          throw new Error(
            `O negócio ${deal.id} aponta para Lead ou responsável ausente da Layer em memória.`,
          );
        }

        return {
          id: deal.id,
          title: deal.title,
          valueInCents: deal.valueInCents,
          stage: deal.stage,
          lead,
          owner,
        };
      };

      // O mesmo que o `mode: 'insensitive'` do Prisma faz virar `ILIKE '%termo%'`.
      const matchesSearch = (deal: DealRecord, term: string): boolean => {
        const needle = term.toLocaleLowerCase();
        const lead = leadsById.get(deal.leadId);

        return [deal.title, lead?.name ?? '', lead?.company ?? ''].some((field) =>
          field.toLocaleLowerCase().includes(needle),
        );
      };

      const sortDeals = (
        deals: readonly DealRecord[],
        sortBy: DealSortBy,
        order: SortOrder,
      ): readonly DealRecord[] => {
        const compare = compareBy(sortBy, leadsById, owners);
        const direction = order === 'asc' ? 1 : -1;

        return [...deals].sort((a, b) => {
          const result = compare(a, b) * direction;
          /*
           * O desempate pelo identificador não é cosmético: sem uma ordem
           * total, dois cards empatados podem trocar de lugar entre a primeira
           * página de uma coluna e a segunda, e um negócio some ou aparece duas
           * vezes. A consulta de Prisma carrega o mesmo desempate.
           */
          return result !== 0 ? result : a.id.localeCompare(b.id);
        });
      };

      const select = (
        deals: readonly DealRecord[],
        query: DealListQuery,
      ): Slice<DealWithRelations> => {
        const matching = deals.filter(
          (deal) =>
            // O filtro de remoção lógica vem primeiro e não é opcional.
            deal.deletedAt === null &&
            (query.stage === undefined || deal.stage === query.stage) &&
            (query.search === undefined || matchesSearch(deal, query.search)) &&
            (query.ownerId === undefined || deal.ownerId === query.ownerId),
        );

        const ordered = sortDeals(matching, query.sortBy, query.order);
        const from = (query.page - 1) * query.pageSize;

        return {
          data: ordered.slice(from, from + query.pageSize).map(resolve),
          // O total é do recorte inteiro, não da página devolvida.
          total: matching.length,
        };
      };

      return {
        list: (query) => Ref.get(store).pipe(Effect.map((deals) => select(deals, query))),

        board: (query) =>
          Ref.get(store).pipe(
            Effect.map((deals) =>
              DEAL_STAGES.map((stage) => {
                const slice = select(deals, boardColumnQuery(stage, query));
                return { stage, total: slice.total, deals: slice.data };
              }),
            ),
          ),
      };
    }),
  );
