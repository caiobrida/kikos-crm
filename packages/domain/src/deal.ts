import { Schema } from 'effect';
import { Chosen } from './choice';
import { OptionalDate } from './dates';
import { ClosedDealResult, DealResult, DealStage } from './enums';
import { DealId, LeadId, UserId } from './ids';
import { LeadDossier, LeadSummary } from './lead';
import { ValueInCents } from './money';
import {
  DEFAULT_PAGE_SIZE,
  PageNumber,
  PageSize,
  Paginated,
  SearchTerm,
  SortOrder,
} from './pagination';
import { OptionalText, RequiredText } from './text';
import { UserSummary } from './user';

/**
 * Um Deal como um card do board o mostra.
 *
 * São os quatro dados que o card desenha — título, valor, o Lead e o
 * responsável —, mais o identificador e as duas dimensões de ADR-0003, que
 * dizem **onde** o card está e **se ele terminou**. Nada além disso: descrição,
 * data prevista e a linha do tempo pertencem ao detalhamento, e repeti-los em
 * cada card de cinco colunas seria tráfego que ninguém lê.
 *
 * `result` está aqui por um requisito concreto: na coluna Fechado, ganhos e
 * perdidos precisam ser distinguíveis **sem abrir os cards** — é a pergunta que
 * o gestor faz de relance. Sem ele, ou a coluna pediria um detalhamento por
 * card, ou pintaria todos da mesma cor. Nas outras quatro colunas ele é sempre
 * `OPEN`, porque "estágio Fechado com resultado em aberto" — e o seu contrário —
 * são inalcançáveis por construção.
 *
 * O mesmo item serve a listagem paginada (`GET /deals`), que é o que carrega as
 * páginas seguintes de uma coluna cheia. Card e linha de listagem são o mesmo
 * Deal visto de dois lugares; um Schema só é o que garante que a página 2 de uma
 * coluna case com a página 1 que o board já mostrou.
 *
 * Como no Lead, `deletedAt` não está aqui de propósito: remoção lógica é assunto
 * do repositório, e um campo que não existe no Schema não vaza num `GET`
 * distraído.
 */
export const DealListItem = Schema.Struct({
  id: DealId,
  title: Schema.String,
  /** Inteiro em centavos. Quem formata em reais é a tela. Ver `money.ts`. */
  valueInCents: ValueInCents,
  /** Onde o negócio está × se ele terminou e como. Ortogonais (ADR-0003). */
  stage: DealStage,
  result: DealResult,
  lead: LeadSummary,
  owner: UserSummary,
});

export type DealListItem = typeof DealListItem.Type;
export type DealListItemEncoded = typeof DealListItem.Encoded;

/** Uma página de Deals — o que `GET /deals` responde. */
export const DealPage = Paginated(DealListItem);
export type DealPage = Paginated<DealListItem>;

/*
 * ---------------------------------------------------------------------------
 * O board
 * ---------------------------------------------------------------------------
 */

/**
 * Quantos cards uma coluna traz na primeira leva.
 *
 * Cinco, e não os dez das tabelas: uma coluna de kanban é estreita e alta, e
 * cinco cards são o que cabe na tela sem rolar. O número é **compartilhado de
 * propósito** — o board devolve esta quantidade por coluna, e o "carregar mais"
 * pede as páginas seguintes com este mesmo tamanho. Se as duas pontas
 * discordassem, a página 2 pularia ou repetiria cards.
 */
export const BOARD_COLUMN_PAGE_SIZE = 5;

/**
 * Uma coluna do board: o Stage, a primeira leva de cards, e **quantos negócios a
 * coluna tem de verdade**.
 *
 * O `total` é o número que o cabeçalho mostra, e ele não é o tamanho de `deals`.
 * Sem ele, uma coluna com trinta negócios anunciaria "5" — o contador mentiria
 * exatamente onde o funil está mais entupido, que é justamente o que se quer
 * enxergar.
 */
export const DealBoardColumn = Schema.Struct({
  stage: DealStage,
  total: Schema.Int,
  deals: Schema.Array(DealListItem),
});

export type DealBoardColumn = typeof DealBoardColumn.Type;

/**
 * O board inteiro — o que `GET /deals/board` responde.
 *
 * **Paginar um kanban não faz sentido como "página 2 do board"**: as cinco
 * colunas são cinco recortes independentes, e o vendedor olha todas ao mesmo
 * tempo. Por isso existe este endpoint dedicado, que devolve as cinco de uma
 * vez, cada uma com a sua primeira página e o seu total. É uma ida ao servidor
 * para abrir a tela, não cinco.
 *
 * As colunas vêm na ordem do Pipeline (`DEAL_STAGES`), e vêm todas — inclusive
 * as vazias, que também são informação sobre o funil.
 */
export const DealBoard = Schema.Struct({
  columns: Schema.Array(DealBoardColumn),
});

export type DealBoard = typeof DealBoard.Type;

/**
 * O recorte pedido a `GET /deals/board`.
 *
 * Busca e vendedor valem para o board inteiro, e não por coluna: filtrar uma
 * coluna de cada vez daria cinco recortes que não se somam em funil nenhum.
 */
export const DealBoardQuery = Schema.Struct({
  /** Casa com parte do título do negócio, do nome ou da empresa do Lead. */
  search: Schema.optional(SearchTerm),
  ownerId: Schema.optional(UserId),
});

export type DealBoardQuery = typeof DealBoardQuery.Type;
export type DealBoardQueryEncoded = typeof DealBoardQuery.Encoded;

/*
 * ---------------------------------------------------------------------------
 * A listagem paginada
 * ---------------------------------------------------------------------------
 */

/**
 * As colunas por onde a listagem deixa ordenar.
 *
 * Como no Lead, a união fechada é o que impede a query string de virar um vetor
 * de injeção: `?sortBy=` só aceita um destes nomes, e é o repositório que
 * traduz o nome para a coluna do banco.
 */
export const DealSortBy = Schema.Literal(
  'title',
  'valueInCents',
  'lead',
  'owner',
  'stage',
  'lastInteractionAt',
);
export type DealSortBy = typeof DealSortBy.Type;

/**
 * O recorte pedido a `GET /deals`.
 *
 * Esta listagem tem dois consumidores, e é por isso que ela nasce completa: o
 * "carregar mais" de uma coluna do board (que fixa `stage` e deixa o resto no
 * default) e a tabela de negócios do dashboard, que usa busca, ordenação e
 * paginação como a tabela de Leads usa.
 *
 * O default de ordenação é o mesmo que o board aplica dentro de cada coluna —
 * mais recente primeiro. Não é coincidência: é o que faz a página 2 de uma
 * coluna continuar de onde a primeira parou, sem repetir nem pular card.
 */
export const DealListQuery = Schema.Struct({
  stage: Schema.optional(DealStage),
  search: Schema.optional(SearchTerm),
  ownerId: Schema.optional(UserId),
  sortBy: Schema.optionalWith(DealSortBy, {
    default: (): DealSortBy => 'lastInteractionAt',
  }),
  order: Schema.optionalWith(SortOrder, { default: (): SortOrder => 'desc' }),
  page: Schema.optionalWith(PageNumber, { default: () => 1 }),
  pageSize: Schema.optionalWith(PageSize, { default: () => DEFAULT_PAGE_SIZE }),
});

export type DealListQuery = typeof DealListQuery.Type;
export type DealListQueryEncoded = typeof DealListQuery.Encoded;

/*
 * ---------------------------------------------------------------------------
 * O detalhamento
 * ---------------------------------------------------------------------------
 */

/**
 * O negócio inteiro — o que `GET /deals/:id` responde, e o que o painel lateral
 * e o modal de detalhamento desenham.
 *
 * **Painel e modal leem o mesmo Schema, pela mesma consulta.** O painel usa uma
 * parte pequena dele (título, valor, selo, Lead, responsável, última interação);
 * o modal usa o resto. Fossem duas respostas diferentes, abrir o detalhamento a
 * partir do painel custaria uma segunda ida ao servidor para buscar dados que a
 * tela já tinha — e haveria dois caches a invalidar a cada comentário.
 *
 * É aqui que o `LeadSummary` do card dá lugar ao `LeadDossier`: o board mostra
 * quem é o cliente, o detalhamento mostra como falar com ele.
 *
 * `result` e `closedAt` estão no Schema mesmo antes de existir a ação que os
 * escreve: eles já existem no banco, a coluna Fechado do funil de exemplo já os
 * tem preenchidos, e um negócio encerrado aberto no modal precisa dizer se foi
 * ganho ou perdido. Quem os **escreve** é a fatia que encerra negócios.
 *
 * `deletedAt` não está aqui, como nos outros Schemas: remoção lógica é assunto
 * do repositório.
 */
export const DealDetail = Schema.Struct({
  id: DealId,
  title: Schema.String,
  /** Inteiro em centavos. Quem formata em reais é a tela. Ver `money.ts`. */
  valueInCents: ValueInCents,
  /** Onde o negócio está × se ele terminou e como. Ortogonais (ADR-0003). */
  stage: DealStage,
  result: DealResult,
  /*
   * Os três campos que o card não carrega. `NullOr` e não opcional: as colunas
   * são nuláveis no banco, e "não informado" é uma resposta que a tela desenha.
   */
  description: Schema.NullOr(Schema.String),
  expectedCloseDate: Schema.NullOr(Schema.DateFromString),
  closedAt: Schema.NullOr(Schema.DateFromString),
  lastInteractionAt: Schema.DateFromString,
  lead: LeadDossier,
  owner: UserSummary,
});

export type DealDetail = typeof DealDetail.Type;
export type DealDetailEncoded = typeof DealDetail.Encoded;

/*
 * ---------------------------------------------------------------------------
 * O cadastro
 * ---------------------------------------------------------------------------
 */

/**
 * O corpo de `POST /deals` — e, campo por campo, o formulário "Cadastrar Novo
 * Negócio".
 *
 * Como no cadastro de Lead, o mesmo objeto valida o formulário no navegador,
 * via `@hookform/resolvers/effect-ts`, e a requisição na rota: não existem duas
 * regras que possam divergir.
 *
 * Duas escolhas merecem nota:
 *
 * - **`stage` aceita os cinco estágios, inclusive `CLOSED`.** Quem proíbe
 *   nascer fechado é a regra pura do Pipeline (`isOpenDealStage`), e é ela que
 *   responde 422 — "esse movimento não existe" —, em vez de 400, que diria
 *   "esse campo está malformado". O formulário nem oferece a opção, mas a
 *   recusa precisa existir para quem enviar por fora da tela.
 * - **`valueInCents` é o inteiro em centavos**, aqui como em todo o resto do
 *   CRM — inclusive no corpo da requisição. A conversão do que o vendedor
 *   digita em reais acontece na tela, na mesma borda que formata o valor de
 *   volta; o Schema recebe o campo de dinheiro já convertido.
 *
 * O que **não** está aqui é tão deliberado quanto o que está: `result`,
 * `closedAt` e `lastInteractionAt` são decididos pelo domínio no momento da
 * criação, e um campo que não existe no Schema não tem como ser escolhido pelo
 * corpo da requisição.
 */
export const CreateDealInput = Schema.Struct({
  title: RequiredText('Informe o nome do negócio.', 120),
  valueInCents: ValueInCents,
  /** O contato de quem é o negócio, escolhido buscando pelo nome. */
  leadId: Chosen(LeadId, 'Escolha o Lead do negócio.'),
  /** Pode ser diferente do dono do Lead: quem prospecta nem sempre é quem fecha. */
  ownerId: Chosen(UserId, 'Escolha o vendedor responsável.'),
  stage: DealStage,
  expectedCloseDate: Schema.optional(OptionalDate),
  description: Schema.optional(OptionalText(2000)),
});

export type CreateDealInput = typeof CreateDealInput.Type;
export type CreateDealInputEncoded = typeof CreateDealInput.Encoded;

/**
 * O corpo de `PUT /deals/:id` — o cadastro **menos o estágio**.
 *
 * Como no Lead, `PUT` recebe a carga completa e não um punhado de campos
 * mexidos: a requisição inteira é validada por um Schema só, o formulário de
 * cadastro é reusado, e não existe estado intermediário em que metade do negócio
 * foi salva. Os campos são derivados de `CreateDealInput` em vez de reescritos —
 * um campo novo no cadastro entra na edição sozinho, que é o que impede os dois
 * formulários de divergirem.
 *
 * **A ausência do estágio é a decisão desta entrada.** Mover um negócio já é uma
 * ação, com rota própria (`PATCH /deals/:id/stage`), regra própria
 * (`refuseStageMove`) e três consequências que a edição não tem: o registro na
 * linha do tempo, a última interação e o selo do contato vinculado. Deixá-lo
 * entrar aqui seria um segundo caminho até a mesma escrita — um que a coluna do
 * board não consulta e que o histórico não registra —, e o funil passaria a ter
 * duas verdades sobre como um card muda de lugar.
 *
 * `result` e `closedAt` ficam de fora pelo mesmo motivo, e mais um: eles são
 * escritos juntos pelo encerramento (ADR-0003), e um negócio encerrado não é
 * editável de forma alguma — quem recusa é `refuseDealEdit`, antes de qualquer
 * escrita.
 *
 * `leadId` **continua editável**: um negócio cadastrado no contato errado é
 * exatamente o tipo de engano que a edição existe para corrigir, e a busca por
 * nome é a mesma do cadastro. Trocar o contato não sincroniza selo nenhum, como
 * nenhuma edição sincroniza: o status do Lead segue os acontecimentos do funil, e
 * corrigir um vínculo não é um deles.
 */
export const UpdateDealInput = Schema.Struct(
  /*
   * `Struct.omit` copia os campos do cadastro deixando `stage` de fora. Em
   * TypeScript comum seria um `Omit<>` de tipo — a diferença é que aqui o objeto
   * também existe em tempo de execução, e é ele que valida a requisição.
   */
  CreateDealInput.omit('stage').fields,
);

export type UpdateDealInput = typeof UpdateDealInput.Type;
export type UpdateDealInputEncoded = typeof UpdateDealInput.Encoded;

/*
 * ---------------------------------------------------------------------------
 * O movimento
 * ---------------------------------------------------------------------------
 */

/**
 * O corpo de `PATCH /deals/:id/stage` — a coluna em que o card foi solto.
 *
 * Um campo só, e o menor corpo do CRM: mover é uma ação, não a edição de um
 * formulário. O que muda junto — a última interação do negócio e do contato, e
 * o status do Lead — é decidido pelo domínio, e por isso nada disso existe
 * aqui: um campo que não está no Schema não tem como ser escolhido pelo corpo
 * da requisição.
 *
 * Como no cadastro, `stage` aceita os cinco estágios do vocabulário, inclusive
 * `CLOSED`. Quem recusa o destino é a regra pura do Pipeline
 * (`refuseStageMove`), e é ela que responde 422 — "esse movimento não existe" —
 * em vez de 400, que diria "esse campo está malformado". O board nem chega a
 * chamar a rota nesse caso; a recusa existe para quem enviar por fora da tela.
 */
export const MoveDealStageInput = Schema.Struct({
  stage: DealStage,
});

export type MoveDealStageInput = typeof MoveDealStageInput.Type;
export type MoveDealStageInputEncoded = typeof MoveDealStageInput.Encoded;

/*
 * ---------------------------------------------------------------------------
 * O encerramento
 * ---------------------------------------------------------------------------
 */

/**
 * O corpo de `POST /deals/:id/close` — o desfecho escolhido, e nada mais.
 *
 * `POST`, e não `PATCH`: encerrar não é editar um campo, é uma ação que muda
 * três colunas de uma vez — resultado, data de fechamento e estágio — e que não
 * se repete. `closedAt` e `stage` não estão aqui justamente por isso: quem os
 * decide é o domínio, e um campo que não existe no Schema não tem como ser
 * escolhido pelo corpo da requisição.
 *
 * **`result` é `ClosedDealResult`, e não `DealResult`.** É a diferença desta
 * entrada para as duas outras do funil, que aceitam o vocabulário inteiro e
 * deixam a regra pura recusar com 422: aqui `OPEN` não é um pedido que o CRM
 * recusa, é um pedido que não existe — encerrar *é* escolher entre Ganho e
 * Perdido. Deixá-lo entrar para recusá-lo adiante abriria, por um instante, a
 * porta para o estado "estágio Fechado com resultado em aberto" que ADR-0003
 * declara inalcançável. Quem enviar `OPEN` por fora da tela leva 400 com o campo
 * apontado, como qualquer outra carga malformada.
 */
export const CloseDealInput = Schema.Struct({
  result: ClosedDealResult,
});

export type CloseDealInput = typeof CloseDealInput.Type;
export type CloseDealInputEncoded = typeof CloseDealInput.Encoded;
