import { Schema } from 'effect';
import { Chosen } from './choice';
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
import type { OpenDealStage } from './pipeline';
import { OptionalText, RequiredText } from './text';
import { Email, UserSummary } from './user';

/**
 * O Lead como ele aparece **dentro** de um Deal — no card do board e, adiante,
 * na tabela do dashboard.
 *
 * Nome e empresa juntos porque um card sem os dois não identifica a
 * oportunidade: "Juliana Prado" existe em muitas academias, e "Smart Fit
 * Morumbi" tem mais de um contato. Telefone, e-mail e o resto do dossiê chegam
 * com o detalhamento do Deal, não em cada card do funil.
 */
export const LeadSummary = Schema.Struct({
  id: LeadId,
  name: Schema.String,
  company: Schema.String,
});

export type LeadSummary = typeof LeadSummary.Type;

/**
 * O Lead como o detalhamento de um Deal o mostra — **o dossiê do cliente**.
 *
 * A pergunta que ele responde é uma só, e concreta: quem eu ligo agora, e para
 * qual número? Por isso ele carrega telefone e e-mail, que o `LeadSummary` do
 * card deliberadamente não carrega — num board de cinco colunas seriam dados que
 * ninguém lê repetidos em cada card; aqui são o motivo de a seção existir.
 *
 * `jobTitle` é `NullOr` e não opcional: a coluna do banco é nulável, e a tela
 * precisa distinguir "não informado" de "não veio na resposta". `status` fica de
 * fora de propósito — o modal já mostra o Stage do negócio, e pôr os dois selos
 * lado a lado convidaria justamente a confusão entre Stage e Status que o
 * vocabulário separa (ver CONTEXT.md).
 */
export const LeadDossier = Schema.Struct({
  id: LeadId,
  name: Schema.String,
  company: Schema.String,
  email: Email,
  phone: Schema.String,
  jobTitle: Schema.NullOr(Schema.String),
  /** O responsável **pelo contato**, que pode não ser o do negócio. */
  owner: UserSummary,
});

export type LeadDossier = typeof LeadDossier.Type;

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
  /* Os dois `<select>` do formulário, como o navegador de fato os manda: `""`
     enquanto ninguém escolheu, o valor do vocabulário depois. Ver `Chosen`. */
  source: Chosen(LeadSource, 'Escolha a origem do Lead.'),
  ownerId: Chosen(UserId, 'Escolha o vendedor responsável.'),
  notes: Schema.optional(OptionalText(2000)),
});

export type CreateLeadInput = typeof CreateLeadInput.Type;
export type CreateLeadInputEncoded = typeof CreateLeadInput.Encoded;

/**
 * O status que o Lead assume quando um Deal nasce para ele.
 *
 * O `status` do Lead é coluna própria, sincronizada pelo domínio a cada ação de
 * Deal com a regra **"último evento vence"**: quem tem negócio aberto está "Em
 * contato", e as transições seguintes — negociação, ganho e perdido — chegam
 * com as fatias que movem e encerram o negócio.
 *
 * Derivar o status na leitura exigiria regra de precedência entre os vários
 * Deals do mesmo Lead e agregação em toda listagem; deixá-lo manual faria a
 * lista de Leads divergir visivelmente do board.
 */
export const LEAD_STATUS_AFTER_DEAL_CREATED: LeadStatus = 'CONTACT';

/**
 * O status que o Lead assume quando um Deal dele muda de estágio — ou
 * `undefined`, quando o movimento não diz nada novo sobre o relacionamento.
 *
 * A tabela do spec tem **uma** linha para movimentação: negócio movido para
 * Proposta enviada ou Negociação leva o contato para Em negociação. Os outros
 * dois estágios abertos não aparecem nela, e o `undefined` é a leitura fiel
 * disso: o movimento continua contando como interação — a data é atualizada —,
 * mas não é evento de status, e o selo fica onde estava.
 *
 * A diferença não é sutil. Um Lead pode ter vários Deals, e "recuar devolve o
 * contato para Em contato" rebaixaria um contato já marcado como Ganho só
 * porque **outro** negócio dele andou para trás — desfazendo, sem que ninguém
 * peça, o fechamento que a fatia 09 registra.
 *
 * Só os quatro estágios abertos entram: encerrar um negócio é outra ação, com
 * outro status (Ganho ou Perdido), e ela chega na fatia que fecha o negócio.
 * `OpenDealStage` no parâmetro é o que faz o compilador cobrar isso de quem
 * chamar — a rota só tem esse tipo em mãos depois da regra de transição.
 */
export const leadStatusAfterDealMoved = (stage: OpenDealStage): LeadStatus | undefined =>
  stage === 'PROPOSAL_SENT' || stage === 'NEGOTIATION' ? 'NEGOTIATION' : undefined;
