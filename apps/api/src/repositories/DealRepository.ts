import {
  BOARD_COLUMN_PAGE_SIZE,
  DEAL_STAGES,
  DealId,
  type DealBoardQuery,
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
import { Context, Effect, Layer, Ref, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
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

/**
 * Um Deal a caminho do banco: a linha inteira menos o identificador, que o
 * banco gera, e menos `deletedAt`, que só a remoção lógica escreve.
 *
 * `result`, `closedAt` e `lastInteractionAt` **estão** aqui, e não são default
 * de coluna: o caso de uso os decide — em aberto, sem data de fechamento, agora
 * — e esta camada apenas grava. É o que mantém a regra acima da seam, onde os
 * testes a alcançam sem banco.
 */
export type NewDeal = Omit<DealRecord, 'id' | 'deletedAt'>;

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
    /**
     * Grava o negócio e devolve o card como o board o desenha — com o Lead e o
     * responsável já resolvidos, que é o que a rota responde no 201. O mesmo
     * formato da listagem, pelo mesmo motivo do Lead: um Schema só descrevendo
     * "um Deal como o CRM o mostra".
     */
    readonly create: (deal: NewDeal) => Effect.Effect<DealWithRelations>;
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

/** Os Leads como o `JOIN` do card os enxerga: identificador, nome e empresa. */
const summarize = (leads: readonly LeadRecord[]): ReadonlyMap<LeadId, LeadSummary> =>
  new Map(
    leads.map((lead) => [
      lead.id,
      { id: lead.id, name: lead.name, company: lead.company },
    ]),
  );

/** O funil e a carteira lidos no mesmo instante, prontos para uma consulta. */
interface World {
  readonly deals: readonly DealRecord[];
  readonly leadsById: ReadonlyMap<LeadId, LeadSummary>;
}

/**
 * A Layer em memória.
 *
 * Os dois `Ref` vêm de fora, e o dos Leads é **o mesmo** que o repositório de
 * Lead escreve (ver `inMemory.ts`). Não é detalhe de montagem: sem isso, um
 * negócio criado para um contato cadastrado na mesma sessão não teria como
 * resolver o `JOIN` do card, e o teste que cobre esse caminho falharia por
 * limitação do duble — não por defeito do produto.
 */
export const DealRepositoryInMemory = (
  store: Ref.Ref<readonly DealRecord[]>,
  leadStore: Ref.Ref<readonly LeadRecord[]>,
  users: readonly UserRecord[],
): Layer.Layer<DealRepository> =>
  Layer.effect(
    DealRepository,
    // `Effect.sync` e não `Effect.gen`: com o estado vindo de fora, montar o
    // serviço não espera por Effect nenhum.
    Effect.sync(() => {
      // Os Users não mudam: o CRM não cadastra conta (ADR-0001).
      const owners = new Map<UserId, UserSummary>(
        users.map((user) => [user.id, { id: user.id, name: user.name }]),
      );

      const resolve = (
        deal: DealRecord,
        leadsById: ReadonlyMap<LeadId, LeadSummary>,
      ): DealWithRelations => {
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
      const matchesSearch = (
        deal: DealRecord,
        term: string,
        leadsById: ReadonlyMap<LeadId, LeadSummary>,
      ): boolean => {
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
        leadsById: ReadonlyMap<LeadId, LeadSummary>,
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

      const select = (world: World, query: DealListQuery): Slice<DealWithRelations> => {
        const matching = world.deals.filter(
          (deal) =>
            // O filtro de remoção lógica vem primeiro e não é opcional.
            deal.deletedAt === null &&
            (query.stage === undefined || deal.stage === query.stage) &&
            (query.search === undefined ||
              matchesSearch(deal, query.search, world.leadsById)) &&
            (query.ownerId === undefined || deal.ownerId === query.ownerId),
        );

        const ordered = sortDeals(matching, query.sortBy, query.order, world.leadsById);
        const from = (query.page - 1) * query.pageSize;

        return {
          data: ordered
            .slice(from, from + query.pageSize)
            .map((deal) => resolve(deal, world.leadsById)),
          // O total é do recorte inteiro, não da página devolvida.
          total: matching.length,
        };
      };

      /*
       * O funil e a carteira lidos no mesmo instante. Ler os dois a cada
       * consulta, em vez de guardar os Leads na montagem, é o que faz um
       * contato cadastrado agora já estar resolvido no card do negócio
       * seguinte.
       */
      const world = Effect.all([Ref.get(store), Ref.get(leadStore)]).pipe(
        Effect.map(([deals, leads]) => ({ deals, leadsById: summarize(leads) })),
      );

      return {
        list: (query) => world.pipe(Effect.map((current) => select(current, query))),

        board: (query) =>
          world.pipe(
            Effect.map((current) =>
              DEAL_STAGES.map((stage) => {
                const slice = select(current, boardColumnQuery(stage, query));
                return { stage, total: slice.total, deals: slice.data };
              }),
            ),
          ),

        create: (deal) =>
          Effect.gen(function* () {
            /*
             * O identificador nasce aqui porque no Postgres ele nasce no banco
             * (`@default(uuid())`): as duas Layers precisam responder a mesma
             * coisa a quem chamou, e quem chamou não escolhe identificador.
             */
            const record: DealRecord = {
              ...deal,
              id: Schema.decodeSync(DealId)(randomUUID()),
              deletedAt: null,
            };

            yield* Ref.update(store, (deals) => [...deals, record]);

            const leads = yield* Ref.get(leadStore);
            return resolve(record, summarize(leads));
          }),
      };
    }),
  );
