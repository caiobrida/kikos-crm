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
 * O Lead como ele sai da API.
 *
 * O responsável vem embutido e já resolvido: a tabela desenha o avatar dele em
 * toda linha, e mandar só o `ownerId` obrigaria a tela a buscar os vendedores
 * antes de conseguir renderizar qualquer coisa.
 *
 * `deletedAt` não está aqui de propósito. A remoção lógica é assunto do
 * repositório — nenhuma tela precisa saber que a coluna existe, e um campo que
 * não existe no Schema não tem como vazar num `GET` distraído.
 */
export const Lead = Schema.Struct({
  id: LeadId,
  name: Schema.String,
  company: Schema.String,
  email: Email,
  phone: Schema.String,
  /** O cargo do contato na empresa dele. Opcional no cadastro. */
  jobTitle: Schema.NullOr(Schema.String),
  source: LeadSource,
  status: LeadStatus,
  owner: UserSummary,
  notes: Schema.NullOr(Schema.String),
  /** `Schema.DateFromString`: string ISO no JSON, `Date` no código. */
  lastInteractionAt: Schema.DateFromString,
});

export type Lead = typeof Lead.Type;
export type LeadEncoded = typeof Lead.Encoded;

/** Uma página de Leads — o que `GET /leads` responde. */
export const LeadPage = Paginated(Lead);
export type LeadPage = Paginated<Lead>;

/**
 * As colunas por onde a tabela deixa ordenar.
 *
 * A união fechada é o que impede a query string de virar um vetor de injeção:
 * `?sortBy=` só aceita um destes cinco nomes, e o repositório traduz o nome
 * para a coluna. Nada do que o usuário digita chega ao `ORDER BY`.
 */
export const LeadSortBy = Schema.Literal(
  'name',
  'company',
  'status',
  'owner',
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
