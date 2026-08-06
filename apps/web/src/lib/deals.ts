import {
  BOARD_COLUMN_PAGE_SIZE,
  DealBoard,
  DealPage,
  type DealListItem,
  type DealStage,
} from '@kikos/domain';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { apiJson } from './api';
import { toQueryString } from './queryString';

/** O prefixo de toda consulta de Deal — é por ele que as escritas as invalidam. */
const dealsQueryKey = ['deals'] as const;

/**
 * O recorte que o board está mostrando.
 *
 * Só busca e vendedor: não há ordenação nem página no board, porque um kanban
 * não tem "página 2". O que ele tem é uma coluna que carrega mais, e isso é
 * estado de cada coluna, não da tela.
 */
export interface BoardView {
  readonly search: string;
  readonly ownerId: string;
}

export const INITIAL_BOARD_VIEW: BoardView = { search: '', ownerId: '' };

/**
 * O board inteiro, numa requisição.
 *
 * Nada é filtrado no navegador: o `view` vira query string e as cinco colunas
 * voltam prontas, cada uma com a sua primeira leva de cards e com o total real
 * — que é o número do cabeçalho. Por isso o `view` também é a chave de cache:
 * dois recortes são duas respostas do servidor, não dois jeitos de olhar a
 * mesma lista.
 */
export const useBoard = (view: BoardView) =>
  useQuery({
    queryKey: [...dealsQueryKey, 'board', view] as const,
    queryFn: ({ signal }) =>
      apiJson(DealBoard, `/deals/board${toQueryString({ ...view })}`, { signal }),
    /*
     * Mantém o board anterior enquanto o novo carrega. Sem isso, cada tecla
     * digitada na busca pisca cinco colunas vazias antes de preenchê-las.
     */
    placeholderData: keepPreviousData,
  });

export interface ColumnPages {
  /** Os cards das páginas seguintes, na ordem em que foram carregadas. */
  readonly deals: readonly DealListItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
}

/**
 * As páginas seguintes de uma coluna cheia — o "carregar mais".
 *
 * A primeira leva de cards já veio no board, então este hook começa na
 * **página 2**: pedi-la de novo por uma consulta paginada própria custaria uma
 * requisição para receber o que a tela já tem na mão.
 *
 * `useQueries` monta uma consulta por página carregada, o que dá três
 * propriedades de graça: cada página tem a sua entrada de cache, voltar para o
 * board não as recarrega, e trocar de recorte descarta todas de uma vez —
 * porque o recorte faz parte da chave. O `combine` junta os resultados numa
 * lista só, que é o que a coluna desenha.
 *
 * O `pageSize` é `BOARD_COLUMN_PAGE_SIZE`, o mesmo que o board usa por coluna.
 * Se as duas pontas discordassem, a página 2 pularia ou repetiria cards — e é
 * por isso que o número mora no pacote compartilhado, e não numa constante de
 * cada lado.
 */
export const useColumnPages = (
  stage: DealStage,
  view: BoardView,
  loadedPages: number,
): ColumnPages =>
  useQueries({
    queries: Array.from({ length: loadedPages }, (_, index) => {
      const query = {
        ...view,
        stage,
        page: index + 2,
        pageSize: BOARD_COLUMN_PAGE_SIZE,
      };

      return {
        queryKey: [...dealsQueryKey, 'column', query] as const,
        queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
          apiJson(DealPage, `/deals${toQueryString(query)}`, { signal }),
      };
    }),
    combine: (results): ColumnPages => ({
      deals: results.flatMap((result) => result.data?.data ?? []),
      isLoading: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
    }),
  });
