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
