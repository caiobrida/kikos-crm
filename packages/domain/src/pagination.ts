import { Schema } from 'effect';

/*
 * O formato comum de toda listagem do CRM.
 *
 * Busca, filtro, ordenação e paginação acontecem no banco, sem exceção — o
 * navegador nunca recebe a base inteira para recortar. A consequência é que
 * três coisas viajam junto com os dados: em que página o recorte está, de que
 * tamanho ela é, e **quantos registros o recorte tem no total**. É o `total`
 * que alimenta o contador da tela, e ele não é o tamanho de `data`.
 *
 * Definido aqui, e não na listagem de Leads, porque a listagem de Negócios e a
 * tabela do dashboard respondem no mesmo formato.
 */

/** A direção da ordenação, como chega na query string. */
export const SortOrder = Schema.Literal('asc', 'desc');
export type SortOrder = typeof SortOrder.Type;

/** Quantos itens uma página traz quando a tela não pede outro tamanho. */
export const DEFAULT_PAGE_SIZE = 10;

/** Teto do `pageSize`: uma requisição não vira "me dê a base inteira". */
const MAX_PAGE_SIZE = 100;

/*
 * `?page=2` chega como a string `"2"`, não como o número 2.
 *
 * `Schema.NumberFromString` é uma transformação: o lado codificado é a string
 * da query, o lado decodificado é o número que o repositório usa. Em TypeScript
 * comum seria um `Number(raw)` seguido de `isNaN` e de uma checagem de faixa —
 * aqui as três coisas são o próprio tipo, e a recusa já sai no formato de
 * `ValidationFailed` com o campo culpado apontado.
 */
export const PageNumber = Schema.NumberFromString.pipe(
  Schema.int({ message: () => 'A página precisa ser um número inteiro.' }),
  Schema.greaterThanOrEqualTo(1, { message: () => 'A primeira página é a 1.' }),
);

export const PageSize = Schema.NumberFromString.pipe(
  Schema.int({ message: () => 'O tamanho da página precisa ser um número inteiro.' }),
  Schema.between(1, MAX_PAGE_SIZE, {
    message: () => `A página traz de 1 a ${MAX_PAGE_SIZE} registros.`,
  }),
);

/**
 * Um termo de busca que vira `undefined` quando está vazio.
 *
 * A tela manda `?search=` no instante em que alguém limpa a caixa, e "buscar
 * por nada" precisa significar "não filtrar". Resolver isso aqui, no Schema,
 * é o que evita a mesma checagem repetida em cada repositório — e evita o bug
 * de um deles esquecer, devolvendo lista vazia para busca vazia.
 */
export const SearchTerm = Schema.transform(
  Schema.Trim,
  Schema.UndefinedOr(Schema.String),
  {
    strict: true,
    decode: (trimmed) => (trimmed === '' ? undefined : trimmed),
    encode: (term) => term ?? '',
  },
);

/** O envelope de uma página de resultados. */
export const Paginated = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    data: Schema.Array(item),
    page: Schema.Int,
    pageSize: Schema.Int,
    /** O tamanho do recorte inteiro, não o desta página. */
    total: Schema.Int,
  });

/**
 * O tipo correspondente. `Paginated` é ao mesmo tempo uma função (que constrói
 * o Schema) e um tipo genérico — os dois nomes convivem porque valor e tipo
 * moram em espaços de nomes separados no TypeScript.
 */
export interface Paginated<A> {
  readonly data: readonly A[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
