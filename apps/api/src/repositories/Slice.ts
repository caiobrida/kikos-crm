/**
 * Uma fatia de resultados: a página pedida e o tamanho do recorte inteiro.
 *
 * O `total` é o do recorte depois dos filtros e **antes** do corte da página —
 * é ele que alimenta o contador da tela, e ele nunca é o tamanho de `data`.
 *
 * Mora fora dos repositórios porque os três consumidores de listagem do CRM (a
 * tabela de Leads, a listagem de Deals e o board) respondem no mesmo formato; se
 * vivesse dentro de um deles, o segundo o importaria do primeiro sem ter nada a
 * ver com ele.
 */
export interface Slice<A> {
  readonly data: readonly A[];
  readonly total: number;
}
