import {
  BOARD_COLUMN_PAGE_SIZE,
  DEAL_STAGES,
  DealId,
  type ClosedDealResult,
  type DealBoardQuery,
  type DealListQuery,
  type DealResult,
  type DealSortBy,
  type DealStage,
  type DealTally,
  type LeadDossier,
  type LeadId,
  type LeadSummary,
  type SortOrder,
  type StageTally,
  type UserId,
  type UserSummary,
} from '@kikos/domain';
import { Context, Effect, Layer, Option, Ref, Schema } from 'effect';
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
  /** O que pinta o card de verde ou vermelho na coluna Fechado (ADR-0003). */
  readonly result: DealResult;
  readonly lead: LeadSummary;
  readonly owner: UserSummary;
}

/**
 * Um Deal com o **dossiê do cliente** resolvido — o que o painel lateral e o
 * modal de detalhamento desenham.
 *
 * A diferença para o card não é de tamanho, é de pergunta: o card responde "que
 * oportunidade é esta?", e por isso leva do Lead apenas nome e empresa; o
 * detalhamento responde "como eu falo com este cliente?", e por isso leva
 * telefone, e-mail e cargo. Um `JOIN` mais largo numa consulta que devolve uma
 * linha só, em vez de um `JOIN` largo em cada card de cinco colunas.
 *
 * O formato bate com o Schema `DealDetail` do pacote compartilhado, e é o
 * compilador quem cobra que continue batendo.
 */
export interface DealWithDossier {
  readonly id: DealId;
  readonly title: string;
  readonly valueInCents: number;
  readonly stage: DealStage;
  readonly result: DealResult;
  readonly description: string | null;
  readonly expectedCloseDate: Date | null;
  readonly closedAt: Date | null;
  readonly lastInteractionAt: Date;
  readonly lead: LeadDossier;
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

/**
 * O que a edição escreve num negócio: a carga do cadastro **menos o estágio**.
 *
 * As três ausências são a mesma decisão, vista de três ângulos:
 *
 * - `stage` porque mover é outra ação, com rota, regra e consequências próprias
 *   — o registro na linha do tempo, a última interação e o selo do contato.
 *   Deixá-lo aqui seria um segundo caminho até a mesma escrita, e o funil
 *   passaria a ter duas verdades sobre como um card muda de lugar.
 * - `result` e `closedAt` porque são escritos juntos pelo encerramento
 *   (ADR-0003), e um negócio encerrado não é editável de forma alguma.
 * - `lastInteractionAt` porque corrigir o valor de uma proposta não é
 *   acontecimento com o cliente. A lista dos que são está no spec, e editar não
 *   está nela: um card que subisse ao topo da coluna por causa de um ajuste de
 *   digitação mentiria sobre onde a negociação está viva.
 */
export type DealEdit = Omit<
  DealRecord,
  'id' | 'stage' | 'result' | 'closedAt' | 'lastInteractionAt' | 'deletedAt'
>;

/**
 * O que uma mudança de estágio escreve no negócio: a coluna de destino e o
 * momento do movimento.
 *
 * Os dois andam juntos de propósito, como no `LeadInteraction`: mover é um
 * acontecimento, e todo acontecimento avança a última interação. Separá-los
 * abriria a porta para um movimento que não aparece na ordenação da coluna nem
 * na carteira (ver o verbete "Última Interação" em CONTEXT.md).
 */
export interface DealStageMove {
  readonly stage: DealStage;
  readonly at: Date;
}

/**
 * O que o encerramento escreve no negócio: o desfecho escolhido e o momento.
 *
 * O estágio **não** está aqui, e a ausência é a decisão: encerrar move para
 * `CLOSED` sempre, e quem grava sabe disso. Se o estágio fosse parâmetro, existiria
 * uma chamada capaz de gravar um desfecho deixando o negócio no meio do funil —
 * exatamente o estado que ADR-0003 declara inalcançável. Uma escrita, três
 * colunas, e nenhuma delas escolhível por quem chama.
 *
 * `at` alimenta a data de fechamento **e** a última interação, pelo mesmo motivo
 * do `DealStageMove`: encerrar é um acontecimento, e todo acontecimento avança a
 * última interação.
 */
export interface DealClose {
  readonly result: ClosedDealResult;
  readonly at: Date;
}

/** Uma coluna do board: a primeira leva de cards e o total real da coluna. */
export interface DealColumn {
  readonly stage: DealStage;
  readonly total: number;
  readonly deals: readonly DealWithRelations[];
}

/**
 * O que um responsável fechou, como a agregação o devolve: por identificador, e
 * não com o nome resolvido.
 *
 * O `JOIN` com a tabela de Users **não** acontece aqui, ao contrário do card do
 * board. Não é economia de consulta: é que o gráfico mostra o time inteiro,
 * inclusive quem não fechou negócio nenhum, e um `GROUP BY` sobre a tabela de
 * negócios não tem como produzir a linha de quem não tem negócio. Quem junta as
 * duas metades é o caso de uso, que já sabe pedir o time — e é lá, acima da
 * seam, que a decisão fica testável.
 */
export interface OwnerResultTally extends DealTally {
  readonly ownerId: UserId;
  /** Só os dois resultados que encerram: em aberto não fecha nada. */
  readonly result: ClosedDealResult;
}

/**
 * O funil contado e somado pelas duas dimensões de ADR-0003, **numa leitura só**.
 *
 * As duas metades vêm juntas de propósito: elas descrevem o mesmo negócio por
 * dois lados — a coluna em que ele está e o resultado com que terminou —, e os
 * dois gráficos do dashboard não podem se contradizer. Duas consultas separadas
 * poderiam pegar o banco em instantes diferentes e mostrar um negócio encerrado
 * que ainda não foi ganho por ninguém.
 */
export interface DashboardTallies {
  /** As cinco colunas, na ordem de `DEAL_STAGES`, inclusive as vazias. */
  readonly byStage: readonly StageTally[];
  /** Uma linha por par (responsável, resultado) que existe no banco. */
  readonly byOwner: readonly OwnerResultTally[];
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
     * O funil contado e somado — o que os dois gráficos do dashboard leem.
     *
     * **A agregação acontece no banco**, e não sobre uma lista trazida para a
     * memória: somar o funil inteiro no processo custaria uma leitura de toda a
     * tabela para produzir dez números, e o custo cresceria com a base
     * exatamente na tela que o gestor abre primeiro.
     *
     * Sem recorte: o dashboard é o panorama do funil inteiro, e busca e filtro
     * são assunto da tabela abaixo dos gráficos — que reusa `list`. O único
     * filtro é o de sempre, o da remoção lógica, que vale aqui como em toda
     * leitura desta camada.
     */
    readonly tally: () => Effect.Effect<DashboardTallies>;
    /**
     * O negócio, ou `Option.none()` — inclusive quando ele existe mas foi
     * removido. É o que responde "esse card ainda está aí, e em que coluna?"
     * antes de decidir se o movimento vale.
     */
    readonly findById: (id: DealId) => Effect.Effect<Option.Option<DealRecord>>;
    /**
     * O negócio com o dossiê do cliente, ou `Option.none()` — o que uma leitura
     * do painel e do modal pede.
     *
     * Separado do `findById` de propósito: aquele responde "esse card ainda está
     * aí, e em que coluna?" para quem vai **escrever**, e por isso devolve a
     * linha crua, sem `JOIN` nenhum. Este responde à tela, e paga dois `JOIN`
     * para isso.
     */
    readonly detailById: (id: DealId) => Effect.Effect<Option.Option<DealWithDossier>>;
    /**
     * Grava o negócio e devolve o card como o board o desenha — com o Lead e o
     * responsável já resolvidos, que é o que a rota responde no 201. O mesmo
     * formato da listagem, pelo mesmo motivo do Lead: um Schema só descrevendo
     * "um Deal como o CRM o mostra".
     */
    readonly create: (deal: NewDeal) => Effect.Effect<DealWithRelations>;
    /**
     * Avança a última interação do negócio, sem mexer em mais nada.
     *
     * É o par do `recordLeadInteraction` do outro repositório, e existe pelo
     * mesmo motivo: comentar é acontecimento, e todo acontecimento faz o card
     * subir para o topo da coluna (ver o verbete "Última Interação" em
     * CONTEXT.md). Movimentação não passa por aqui — ela grava a data junto do
     * estágio, numa escrita só.
     */
    readonly recordDealInteraction: (id: DealId, at: Date) => Effect.Effect<void>;
    /**
     * Move o negócio de coluna e devolve o card no mesmo formato da listagem.
     *
     * **Não recusa nada**: quem decide se o movimento existe é a regra pura do
     * Pipeline, acima da seam, e quem confere se o negócio ainda está lá é o
     * caso de uso, com `findById`. Aqui só se escreve — é o que mantém a regra
     * onde os testes a alcançam sem banco.
     */
    readonly moveToStage: (
      id: DealId,
      move: DealStageMove,
    ) => Effect.Effect<DealWithRelations>;
    /**
     * Encerra o negócio — resultado, data de fechamento e estágio numa escrita
     * só — e devolve o card no mesmo formato da listagem.
     *
     * **Não recusa nada**, como `moveToStage`: quem decide se o encerramento
     * vale é a regra pura (`refuseDealClose`), acima da seam, e quem confere se
     * o negócio ainda está lá é o caso de uso. O que esta camada garante é a
     * outra metade de ADR-0003 — que as três colunas nunca andem separadas.
     */
    readonly close: (id: DealId, close: DealClose) => Effect.Effect<DealWithRelations>;
    /**
     * Regrava os campos do cadastro e devolve o card no mesmo formato da
     * listagem.
     *
     * **Não recusa nada**, como as outras escritas: quem decide se um negócio
     * encerrado aceita edição é a regra pura (`refuseDealEdit`), acima da seam, e
     * quem confere se o Lead e o responsável escolhidos existem é o caso de uso.
     */
    readonly update: (id: DealId, changes: DealEdit) => Effect.Effect<DealWithRelations>;
    /**
     * Marca o negócio como removido, gravando o momento em vez de apagar a
     * linha.
     *
     * **A linha continua no banco de propósito**: a linha do tempo aponta para
     * ela, e comentário não se apaga (ver o modelo em `schema.prisma`). O que
     * muda é que toda leitura desta camada passa a não enxergá-la — inclusive o
     * contador da coluna, que é onde a ausência do filtro apareceria primeiro.
     *
     * Não faz nada se o negócio não existir ou já tiver sido removido: quem
     * precisa da recusa é o caso de uso, e ele já perguntou antes.
     */
    readonly softDelete: (id: DealId, at: Date) => Effect.Effect<void>;
    /**
     * Quantos negócios **em aberto** o contato tem.
     *
     * É a pergunta que a remoção de um Lead faz antes de agir, e o número que a
     * recusa mostra a quem tentou. Em aberto quer dizer resultado `OPEN`: um
     * negócio encerrado é história registrada e não trava a limpeza da carteira,
     * e um negócio removido também não conta — a remoção lógica vale aqui como em
     * toda leitura desta camada.
     *
     * Ela mora no repositório de Deal, e não no de Lead, porque conta negócios: é
     * o caso de uso da remoção que junta as duas metades, que é onde as regras do
     * CRM moram.
     */
    readonly countOpenByLead: (leadId: LeadId) => Effect.Effect<number>;
    /**
     * Quantos negócios **em aberto** cada responsável tem — o segundo número da
     * tela de Vendedores.
     *
     * Mesma leitura de "em aberto" do `countOpenByLead`: resultado `OPEN`. Um
     * negócio encerrado é história registrada e não é trabalho na mesa de
     * ninguém, e um negócio removido não conta — a remoção lógica vale aqui como
     * em toda leitura desta camada.
     *
     * Como o `countByOwner` do outro repositório, **não** resolve o `JOIN` com a
     * tabela de Users nem filtra por papel: um `GROUP BY` sobre a tabela de
     * negócios não produz a linha de quem não tem negócio, e é o caso de uso que
     * junta as duas metades. Daí o `Map`: chave ausente é "nenhum negócio
     * aberto".
     */
    readonly countOpenByOwner: () => Effect.Effect<ReadonlyMap<UserId, number>>;
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

/**
 * Uma coluna contada e somada — o `_count` e o `_sum` do `GROUP BY`, escritos
 * em TypeScript.
 *
 * A soma em centavos inteiros é exata, e é por isso que ela pode ser feita com
 * um `reduce` comum: a coluna do banco é `Int`, não `Decimal` nem ponto
 * flutuante, justamente para que somar o funil não acumule centavo de erro (ver
 * `money.ts` no pacote de domínio).
 */
const tallyOf = (stage: DealStage, deals: readonly DealRecord[]): StageTally => ({
  stage,
  count: deals.length,
  valueInCents: deals.reduce((sum, deal) => sum + deal.valueInCents, 0),
});

/** Os Leads como o `JOIN` do card os enxerga: identificador, nome e empresa. */
const summarize = (leads: readonly LeadRecord[]): ReadonlyMap<LeadId, LeadSummary> =>
  new Map(
    leads.map((lead) => [
      lead.id,
      { id: lead.id, name: lead.name, company: lead.company },
    ]),
  );

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

      /**
       * O responsável de identificador `id`.
       *
       * Um responsável ausente é **defeito, não erro de domínio**: no banco a
       * chave estrangeira garante que isto não acontece, e num teste significa
       * fixture quebrada. `subject` entra na mensagem porque quem lê o estouro
       * precisa saber qual registro apontava para o vazio.
       */
      const ownerOf = (id: UserId, subject: string): UserSummary => {
        const owner = owners.get(id);

        if (owner === undefined) {
          throw new Error(
            `${subject} aponta para um responsável ausente da Layer em memória.`,
          );
        }

        return owner;
      };

      /** O dossiê de um contato: a linha do Lead mais o responsável dele. */
      const dossierOf = (lead: LeadRecord): LeadDossier => ({
        id: lead.id,
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        jobTitle: lead.jobTitle,
        owner: ownerOf(lead.ownerId, `O Lead ${lead.id}`),
      });

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
          result: deal.result,
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

      const select = (
        deals: readonly DealRecord[],
        leadsById: ReadonlyMap<LeadId, LeadSummary>,
        query: DealListQuery,
      ): Slice<DealWithRelations> => {
        const matching = deals.filter(
          (deal) =>
            // O filtro de remoção lógica vem primeiro e não é opcional.
            deal.deletedAt === null &&
            (query.stage === undefined || deal.stage === query.stage) &&
            (query.search === undefined ||
              matchesSearch(deal, query.search, leadsById)) &&
            (query.ownerId === undefined || deal.ownerId === query.ownerId),
        );

        const ordered = sortDeals(matching, query.sortBy, query.order, leadsById);
        const from = (query.page - 1) * query.pageSize;

        return {
          data: ordered
            .slice(from, from + query.pageSize)
            .map((deal) => resolve(deal, leadsById)),
          // O total é do recorte inteiro, não da página devolvida.
          total: matching.length,
        };
      };

      /**
       * O negócio de identificador `id` que ainda existe para quem lê.
       *
       * O filtro de remoção lógica não é repetido em cada caminho: ele é este
       * predicado, e é o mesmo que a Layer de Prisma escreve como
       * `where: { id, deletedAt: null }`.
       */
      const isVisible =
        (id: DealId) =>
        (deal: DealRecord): boolean =>
          deal.id === id && deal.deletedAt === null;

      /*
       * O funil e a carteira lidos no mesmo instante. Ler os dois a cada
       * consulta, em vez de guardar os Leads na montagem, é o que faz um
       * contato cadastrado agora já estar resolvido no card do negócio
       * seguinte.
       *
       * `Effect.all` sobre uma tupla é o `Promise.all` do Effect: ele espera os
       * dois e devolve os resultados na mesma ordem.
       */
      const world = Effect.all([Ref.get(store), Ref.get(leadStore)]).pipe(
        Effect.map(([deals, leads]) => [deals, summarize(leads)] as const),
      );

      /**
       * Aplica uma escrita ao negócio visível e devolve o card já resolvido.
       *
       * As duas escritas do funil — mover e encerrar — diferem no **que**
       * mudam, e em nada mais: as duas atualizam atomicamente, releem e
       * resolvem o `JOIN` do card. O que cada uma monta é o `changes`, que é
       * justamente a parte que ADR-0003 quer ver escrita num lugar só.
       *
       * `id` e `deletedAt` ficam de fora do tipo porque nenhuma escrita do
       * funil os toca: identificador não muda, e remoção lógica é outra
       * operação.
       */
      const write = (
        id: DealId,
        changes: Partial<Omit<DealRecord, 'id' | 'deletedAt'>>,
      ): Effect.Effect<DealWithRelations> =>
        Effect.gen(function* () {
          /*
           * `Ref.updateAndGet` é o `update` seguido de leitura, numa operação
           * atômica: em TypeScript comum seria `store = f(store); return store`,
           * com a diferença de que aqui ninguém pode ler entre as duas metades.
           */
          const deals = yield* Ref.updateAndGet(store, (current) =>
            current.map((deal) => (isVisible(id)(deal) ? { ...deal, ...changes } : deal)),
          );

          const deal = deals.find(isVisible(id));
          if (deal === undefined) {
            // Defeito, não erro de domínio: o caso de uso já conferiu com
            // `findById` que o negócio está lá antes de mandar escrever.
            throw new Error(`O negócio ${id} sumiu entre a leitura e a escrita.`);
          }

          const leads = yield* Ref.get(leadStore);
          return resolve(deal, summarize(leads));
        });

      return {
        list: (query) =>
          world.pipe(Effect.map(([deals, leadsById]) => select(deals, leadsById, query))),

        board: (query) =>
          world.pipe(
            Effect.map(([deals, leadsById]) =>
              DEAL_STAGES.map((stage) => {
                const slice = select(deals, leadsById, boardColumnQuery(stage, query));
                return { stage, total: slice.total, deals: slice.data };
              }),
            ),
          ),

        tally: () =>
          Ref.get(store).pipe(
            Effect.map((deals) => {
              // O filtro de remoção lógica vem primeiro e não é opcional, como
              // em toda leitura desta camada.
              const visible = deals.filter((deal) => deal.deletedAt === null);

              /*
               * As cinco colunas, e não só as que têm negócio: o `GROUP BY` do
               * Prisma omite a coluna vazia, e é aqui — e lá — que ela volta,
               * porque um estágio sem negócio nenhum também é informação sobre
               * o funil.
               */
              const byStage = DEAL_STAGES.map((stage) =>
                tallyOf(
                  stage,
                  visible.filter((deal) => deal.stage === stage),
                ),
              );

              /*
               * O `GROUP BY (ownerId, result)` do outro lado da seam, escrito
               * como acumulação num `Map`. A chave junta os dois campos porque
               * é por eles que a agregação agrupa; `result === 'OPEN'` fica de
               * fora, como o `where` do Prisma o deixa: quem está em aberto já
               * está contado no funil acima.
               */
              const byOwner = new Map<string, OwnerResultTally>();

              for (const deal of visible) {
                if (deal.result === 'OPEN') continue;

                const key = `${deal.ownerId}:${deal.result}`;
                const current = byOwner.get(key);

                byOwner.set(key, {
                  ownerId: deal.ownerId,
                  result: deal.result,
                  count: (current?.count ?? 0) + 1,
                  valueInCents: (current?.valueInCents ?? 0) + deal.valueInCents,
                });
              }

              return { byStage, byOwner: [...byOwner.values()] };
            }),
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

        findById: (id) =>
          // O filtro de remoção lógica vale aqui como em toda leitura.
          Ref.get(store).pipe(
            Effect.map((deals) => Option.fromNullable(deals.find(isVisible(id)))),
          ),

        detailById: (id) =>
          Effect.gen(function* () {
            const deals = yield* Ref.get(store);
            const deal = deals.find(isVisible(id));
            if (deal === undefined) return Option.none();

            const leads = yield* Ref.get(leadStore);
            /*
             * O contato é resolvido **sem** o filtro de remoção lógica, e é de
             * propósito: quem foi removido continua sendo o cliente do negócio,
             * e um dossiê em branco esconderia de quem abriu o detalhamento
             * justamente a informação de que o contato saiu da carteira. É o
             * mesmo que o `JOIN` do Prisma faz, que também não filtra a relação.
             */
            const lead = leads.find((candidate) => candidate.id === deal.leadId);

            if (lead === undefined) {
              // Defeito, não erro de domínio: no banco a chave estrangeira
              // garante que isto não acontece.
              throw new Error(
                `O negócio ${deal.id} aponta para um Lead ausente da Layer em memória.`,
              );
            }

            const {
              leadId: _leadId,
              ownerId: _ownerId,
              deletedAt: _deletedAt,
              ...rest
            } = deal;

            return Option.some({
              ...rest,
              lead: dossierOf(lead),
              owner: ownerOf(deal.ownerId, `O negócio ${deal.id}`),
            });
          }),

        recordDealInteraction: (id, at) =>
          Ref.update(store, (deals) =>
            deals.map((deal) =>
              isVisible(id)(deal) ? { ...deal, lastInteractionAt: at } : deal,
            ),
          ),

        update: (id, changes) => write(id, changes),

        softDelete: (id, at) =>
          Ref.update(store, (deals) =>
            // A linha continua no array, com a data preenchida: é assim que a
            // remoção lógica desaparece das leituras sem apagar a linha do tempo.
            deals.map((deal) =>
              isVisible(id)(deal) ? { ...deal, deletedAt: at } : deal,
            ),
          ),

        countOpenByLead: (leadId) =>
          Ref.get(store).pipe(
            Effect.map(
              (deals) =>
                deals.filter(
                  (deal) =>
                    deal.leadId === leadId &&
                    // O filtro de remoção lógica vem primeiro e não é opcional:
                    // um negócio já removido não trava a remoção do contato.
                    deal.deletedAt === null &&
                    deal.result === 'OPEN',
                ).length,
            ),
          ),

        countOpenByOwner: () =>
          Ref.get(store).pipe(
            Effect.map((deals) => {
              // O `GROUP BY ownerId` do outro lado da seam, com os mesmos dois
              // filtros do `where` do Prisma: removido não conta, encerrado
              // também não.
              const counts = new Map<UserId, number>();

              for (const deal of deals) {
                if (deal.deletedAt !== null || deal.result !== 'OPEN') continue;
                counts.set(deal.ownerId, (counts.get(deal.ownerId) ?? 0) + 1);
              }

              return counts;
            }),
          ),

        moveToStage: (id, move) =>
          write(id, { stage: move.stage, lastInteractionAt: move.at }),

        close: (id, closing) =>
          /*
           * As três colunas de ADR-0003 numa escrita só, e o `at` nas duas
           * datas: encerrar é um acontecimento, e a data de fechamento e a
           * última interação descrevem o mesmo instante. `stage` é constante e
           * não vem do parâmetro — chega-se em Fechado por aqui, e por nenhum
           * outro caminho.
           */
          write(id, {
            result: closing.result,
            closedAt: closing.at,
            stage: 'CLOSED',
            lastInteractionAt: closing.at,
          }),
      };
    }),
  );
