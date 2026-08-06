import { Schema } from 'effect';
import { LeadSource, LeadStatus } from './enums';
import { LeadId, UserId } from './ids';
import {
  DEFAULT_PAGE_SIZE,
  PageNumber,
  PageSize,
  Paginated,
  SearchTerm,
  SortOrder,
} from './pagination';
import { OptionalText, RequiredText } from './text';
import { Email, UserSummary } from './user';

/**
 * Um Lead como uma linha da lista o mostra.
 *
 * São exatamente as sete colunas da tabela, e nada além delas. `jobTitle` e
 * `notes` ficam de fora pelo mesmo motivo que o `owner` vem enxuto: são texto
 * livre que nenhuma linha desenha, e repeti-los em cada uma das dez linhas de
 * cada página seria tráfego que ninguém lê. Eles chegam com o detalhamento do
 * Lead, na fatia que abre o modal.
 *
 * O responsável vem embutido e já resolvido: a tabela desenha o avatar dele em
 * toda linha, e mandar só o `ownerId` obrigaria a tela a buscar os vendedores
 * antes de conseguir renderizar qualquer coisa.
 *
 * `deletedAt` não está aqui de propósito. A remoção lógica é assunto do
 * repositório — nenhuma tela precisa saber que a coluna existe, e um campo que
 * não existe no Schema não tem como vazar num `GET` distraído.
 */
export const LeadListItem = Schema.Struct({
  id: LeadId,
  name: Schema.String,
  company: Schema.String,
  email: Email,
  phone: Schema.String,
  source: LeadSource,
  status: LeadStatus,
  owner: UserSummary,
  /** `Schema.DateFromString`: string ISO no JSON, `Date` no código. */
  lastInteractionAt: Schema.DateFromString,
});

export type LeadListItem = typeof LeadListItem.Type;
export type LeadListItemEncoded = typeof LeadListItem.Encoded;

/** Uma página de Leads — o que `GET /leads` responde. */
export const LeadPage = Paginated(LeadListItem);
export type LeadPage = Paginated<LeadListItem>;

/**
 * As colunas por onde a tabela deixa ordenar — todas as que ela mostra.
 *
 * A união fechada é o que impede a query string de virar um vetor de injeção:
 * `?sortBy=` só aceita um destes nomes, e o repositório traduz o nome para a
 * coluna. Nada do que o usuário digita chega ao `ORDER BY`.
 */
export const LeadSortBy = Schema.Literal(
  'name',
  'company',
  'email',
  'phone',
  'owner',
  'status',
  'lastInteractionAt',
);
export type LeadSortBy = typeof LeadSortBy.Type;

/**
 * O recorte pedido a `GET /leads`.
 *
 * Todos os campos são opcionais e todos combinam entre si: busca mais status
 * mais vendedor mais ordenação mais página são uma consulta só, e é o banco
 * quem a resolve.
 *
 * `Schema.optionalWith(X, { default })` preenche o valor quando a query string
 * não traz o parâmetro — do lado decodificado o campo é obrigatório, então o
 * repositório nunca precisa perguntar "e se vier `undefined`?".
 */
export const LeadListQuery = Schema.Struct({
  /** Casa com parte do nome, da empresa ou do e-mail, sem diferenciar caixa. */
  search: Schema.optional(SearchTerm),
  status: Schema.optional(LeadStatus),
  ownerId: Schema.optional(UserId),
  sortBy: Schema.optionalWith(LeadSortBy, {
    default: (): LeadSortBy => 'lastInteractionAt',
  }),
  /*
   * O default é o mais recente primeiro: quem abre a tela quer ver o que se
   * mexeu hoje, não o contato mais antigo da carteira.
   */
  order: Schema.optionalWith(SortOrder, { default: (): SortOrder => 'desc' }),
  page: Schema.optionalWith(PageNumber, { default: () => 1 }),
  pageSize: Schema.optionalWith(PageSize, { default: () => DEFAULT_PAGE_SIZE }),
});

export type LeadListQuery = typeof LeadListQuery.Type;
export type LeadListQueryEncoded = typeof LeadListQuery.Encoded;

/*
 * ---------------------------------------------------------------------------
 * O cadastro
 * ---------------------------------------------------------------------------
 */

const isLeadSource = Schema.is(LeadSource);
const isUserId = Schema.is(UserId);

/*
 * Os dois `<select>` do formulário, como o navegador de fato os manda.
 *
 * Um `<select>` sem escolha manda `""` — não a ausência do campo. Se o Schema
 * pedisse `LeadSource` direto, o lado *codificado* seria a união fechada, e o
 * formulário não teria como nascer em branco sem mentir para o compilador.
 *
 * `Schema.filter` com um type guard resolve os dois lados de uma vez: o lado
 * codificado continua `string`, o decodificado é o tipo estreito, e a recusa
 * carrega a frase que vai aparecer embaixo do campo. O guard é o `Schema.is` do
 * próprio Schema de origem — a regra continua escrita num lugar só.
 */
const ChosenLeadSource = Schema.String.pipe(
  Schema.filter((value): value is LeadSource => isLeadSource(value), {
    message: () => 'Escolha a origem do Lead.',
    identifier: 'ChosenLeadSource',
  }),
);

const ChosenOwnerId = Schema.String.pipe(
  Schema.filter((value): value is UserId => isUserId(value), {
    message: () => 'Escolha o vendedor responsável.',
    identifier: 'ChosenOwnerId',
  }),
);

/**
 * O corpo de `POST /leads` — e, campo por campo, o formulário "Criar Novo Lead".
 *
 * **Este é o ponto em que "TypeScript ponta a ponta" deixa de ser slogan.** O
 * mesmo objeto valida o formulário no navegador, via
 * `@hookform/resolvers/effect-ts`, e a requisição na rota. Não existem duas
 * regras que possam divergir: mudar o tamanho máximo de um campo aqui muda o
 * que o navegador recusa antes de enviar e o que a API recusa se enviarem
 * assim mesmo.
 *
 * `Schema` faz aqui o papel que um Zod faria, com uma diferença que este
 * Schema usa o tempo todo: ele não só *valida* a entrada, ele descreve a
 * **transformação** entre a forma que trafega e a forma do domínio. O lado
 * codificado é o que o `<form>` produz — tudo string, opcionais em branco. O
 * lado decodificado é o que o domínio quer — aparado, e-mail normalizado,
 * `undefined` no lugar de `""`, `ownerId` com marca de `UserId`.
 *
 * O que **não** está aqui é tão deliberado quanto o que está: `status` e
 * `lastInteractionAt` são decididos pelo domínio no momento da criação, e um
 * campo que não existe no Schema não tem como ser escolhido pelo corpo da
 * requisição.
 */
export const CreateLeadInput = Schema.Struct({
  name: RequiredText('Informe o nome do contato.', 120),
  company: RequiredText('Informe a empresa.', 120),
  email: Email,
  phone: RequiredText('Informe o telefone.', 40),
  jobTitle: Schema.optional(OptionalText(120)),
  source: ChosenLeadSource,
  ownerId: ChosenOwnerId,
  notes: Schema.optional(OptionalText(2000)),
});

export type CreateLeadInput = typeof CreateLeadInput.Type;
export type CreateLeadInputEncoded = typeof CreateLeadInput.Encoded;
