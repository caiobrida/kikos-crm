import {
  LEAD_STATUSES,
  LeadId,
  type LeadListQuery,
  type LeadSortBy,
  type LeadSource,
  type LeadStatus,
  type SortOrder,
  type UserId,
  type UserSummary,
} from '@kikos/domain';
import { Context, Effect, Layer, Option, Ref, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import type { Slice } from './Slice';
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
 * Uma linha da lista: o Lead com o responsável já resolvido pelo `JOIN`, e sem
 * o que a tabela não desenha.
 *
 * O formato bate com o Schema `LeadListItem` do pacote compartilhado, e é o
 * compilador quem cobra que continue batendo: a rota codifica este valor com
 * aquele Schema, e um campo a mais ou a menos quebra o typecheck.
 */
export type LeadWithOwner = Omit<
  LeadRecord,
  'ownerId' | 'deletedAt' | 'jobTitle' | 'notes'
> & {
  readonly owner: UserSummary;
};

/**
 * Um Lead a caminho do banco: a linha inteira menos o identificador, que o
 * banco gera, e menos `deletedAt`, que só a remoção lógica escreve.
 *
 * `status` e `lastInteractionAt` **estão** aqui, e não são default de coluna: o
 * caso de uso os decide (Novo, agora) e esta camada apenas grava. É o que
 * mantém a regra acima da seam, onde os testes a alcançam sem banco.
 */
export type NewLead = Omit<LeadRecord, 'id' | 'deletedAt'>;

/**
 * O que uma ação de Deal escreve no Lead vinculado: o status novo e o momento
 * do acontecimento.
 *
 * Os dois andam juntos de propósito — quem decide o status é o domínio, com a
 * regra "último evento vence", e a mesma ação é o que torna este o contato de
 * última interação mais recente da carteira (ver o verbete em CONTEXT.md).
 */
export interface LeadInteraction {
  readonly status: LeadStatus;
  readonly at: Date;
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
    /**
     * O contato, ou `Option.none()` — inclusive quando ele existe mas foi
     * removido. É o que responde "esse Lead ainda está aí?" antes de vincular
     * um negócio a ele.
     */
    readonly findById: (id: LeadId) => Effect.Effect<Option.Option<LeadRecord>>;
    /**
     * Grava o contato e devolve a linha como a lista a mostra — com o
     * responsável já resolvido, que é o que a rota responde no 201. Devolver o
     * mesmo formato da listagem, e não o registro cru, mantém um Schema só
     * descrevendo "um Lead como o CRM o mostra".
     */
    readonly create: (lead: NewLead) => Effect.Effect<LeadWithOwner>;
    /**
     * Sincroniza o contato depois de uma ação de Deal. Não faz nada se o Lead
     * não existir ou tiver sido removido — quem precisa da recusa é o caso de
     * uso, e ele já perguntou antes de escrever.
     */
    readonly recordLeadInteraction: (
      id: LeadId,
      interaction: LeadInteraction,
    ) => Effect.Effect<void>;
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
    /*
     * `localeCompare('pt-BR')` e não `<`: para o Postgres concordar, o banco
     * é criado com collation ICU pt-BR (ver `docker-compose.yml`). Com a
     * collation padrão, que compara byte a byte, "Álvaro" cairia depois de
     * "Zeta" — e os dois lados da seam discordariam sem que teste algum visse.
     */
    case 'name':
      return (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    case 'company':
      return (a, b) => a.company.localeCompare(b.company, 'pt-BR');
    case 'email':
      return (a, b) => a.email.localeCompare(b.email, 'pt-BR');
    case 'phone':
      return (a, b) => a.phone.localeCompare(b.phone, 'pt-BR');
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

/**
 * O `Ref` vem de fora, e não é criado aqui dentro: o repositório de Deal lê a
 * mesma célula para resolver o `JOIN` do card, então um contato cadastrado
 * agora já está lá quando o negócio seguinte o vincula. Ver `inMemory.ts`.
 */
export const LeadRepositoryInMemory = (
  store: Ref.Ref<readonly LeadRecord[]>,
  /** Os Users que a listagem usa para resolver o responsável — o `JOIN` à mão. */
  users: readonly UserRecord[],
): Layer.Layer<LeadRepository> =>
  Layer.effect(
    LeadRepository,
    // `Effect.sync` e não `Effect.gen`: com o estado vindo de fora, montar o
    // serviço não espera por Effect nenhum.
    Effect.sync(() => {
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

        const {
          ownerId: _ownerId,
          deletedAt: _deletedAt,
          jobTitle: _jobTitle,
          notes: _notes,
          ...rest
        } = lead;
        return { ...rest, owner };
      };

      return {
        create: (lead) =>
          Effect.gen(function* () {
            /*
             * O identificador nasce aqui porque no Postgres ele nasce no banco
             * (`@default(uuid())`): as duas Layers precisam responder a mesma
             * coisa a quem chamou, e quem chamou não escolhe identificador.
             */
            const record: LeadRecord = {
              ...lead,
              id: Schema.decodeSync(LeadId)(randomUUID()),
              deletedAt: null,
            };

            yield* Ref.update(store, (leads) => [...leads, record]);
            return withOwner(record);
          }),

        findById: (id) =>
          Ref.get(store).pipe(
            Effect.map((leads) =>
              Option.fromNullable(
                // O filtro de remoção lógica vale aqui como em toda leitura.
                leads.find((lead) => lead.id === id && lead.deletedAt === null),
              ),
            ),
          ),

        recordLeadInteraction: (id, interaction) =>
          Ref.update(store, (leads) =>
            leads.map((lead) =>
              lead.id === id && lead.deletedAt === null
                ? {
                    ...lead,
                    status: interaction.status,
                    lastInteractionAt: interaction.at,
                  }
                : lead,
            ),
          ),

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
