import type { UserId } from '@kikos/domain';

/** Uma linha de `groupBy({ by: ['ownerId'], _count: { _all: true } })`. */
interface OwnerCountRow {
  readonly ownerId: string;
  readonly _count: { readonly _all: number };
}

/**
 * O resultado de um `GROUP BY ownerId` na forma em que quem lê precisa dele.
 *
 * O `Map` não é conveniência: **chave ausente é zero**. Um agrupamento sobre a
 * tabela de Leads ou a de Deals não produz a linha de quem não tem nenhum, e a
 * tela de Vendedores precisa dessa linha — uma linha zerada é uma resposta, uma
 * linha ausente é um silêncio. Com um `Map`, quem junta as duas metades escreve
 * `?? 0` e acabou; com uma lista, escreveria um `find` e teria de lembrar do
 * caso do `undefined`.
 *
 * Mora fora dos repositórios, como `escapeLikeWildcards`, porque os dois que
 * contam por responsável — o de Lead e o de Deal — precisam devolver exatamente
 * a mesma forma para o caso de uso poder tratá-los igual. O `as UserId` é o
 * mesmo casteamento de borda das outras leituras de Prisma: a coluna é uma chave
 * estrangeira, e a conferência de forma já foi feita pelo banco.
 */
export const toOwnerCounts = (
  rows: readonly OwnerCountRow[],
): ReadonlyMap<UserId, number> =>
  new Map(rows.map((row) => [row.ownerId as UserId, row._count._all]));
