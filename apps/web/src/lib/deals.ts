import {
  BOARD_COLUMN_PAGE_SIZE,
  CreateDealInput,
  DealBoard,
  DealDetail,
  DealListItem,
  DealPage,
  MoveDealStageInput,
  type DealStage,
} from '@kikos/domain';
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Schema } from 'effect';
import { apiJson } from './api';
import { boardWithDealMoved, pageWithoutDeal } from './board';
import { leadsQueryKey } from './leads';
import { toQueryString } from './queryString';

/**
 * O prefixo de toda consulta de Deal — é por ele que as escritas as invalidam.
 *
 * Exportado porque a linha do tempo vive debaixo dele (ver `comments.ts`): um
 * comentário é acontecimento do negócio, e mover um card **acrescenta** um
 * registro ao histórico. Pendurar as duas coisas no mesmo prefixo é o que faz
 * cada escrita alcançar tudo que ela de fato mexeu, sem lista de chaves para
 * alguém esquecer de atualizar.
 */
export const dealsQueryKey = ['deals'] as const;

/*
 * Os prefixos de dentro do funil. Os dois primeiros existem como constantes
 * porque a movimentação precisa alcançá-los antes da resposta do servidor: o
 * board, onde o card muda de coluna, e as páginas do "carregar mais", de onde
 * ele some. O terceiro é o detalhamento, que a movimentação só invalida.
 */
const boardQueryKey = [...dealsQueryKey, 'board'] as const;
const columnQueryKey = [...dealsQueryKey, 'column'] as const;
const detailQueryKey = [...dealsQueryKey, 'detail'] as const;

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
 * O recorte como uma chave de remontagem.
 *
 * Mora aqui, junto do `BoardView`, para que um filtro novo no board não exija
 * lembrar de acrescentá-lo à `key` da coluna lá na tela — é o tipo de
 * esquecimento que só aparece como uma coluna teimando em mostrar as páginas
 * de um recorte que não existe mais.
 */
export const boardViewKey = (view: BoardView): string => `${view.search}:${view.ownerId}`;

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
    queryKey: [...boardQueryKey, view] as const,
    queryFn: ({ signal }) =>
      apiJson(DealBoard, `/deals/board${toQueryString({ ...view })}`, { signal }),
    /*
     * Mantém o board anterior enquanto o novo carrega. Sem isso, cada tecla
     * digitada na busca pisca cinco colunas vazias antes de preenchê-las.
     */
    placeholderData: keepPreviousData,
  });

/**
 * Um negócio inteiro — **a consulta que o painel lateral e o modal
 * compartilham**.
 *
 * É uma decisão de projeto disfarçada de detalhe de cache. O painel desenha a
 * parte de cima do que volta e o modal desenha o resto; como a chave é a mesma,
 * clicar em "ver detalhes" abre o modal com os dados já em mãos — sem
 * carregamento, sem piscada — e há **um** cache a invalidar quando alguém
 * comenta, em vez de dois que podem discordar.
 *
 * `id` opcional porque a tela pergunta antes de haver negócio escolhido: sem
 * card selecionado e sem `:dealId` na URL, não há o que carregar. `enabled` é
 * o que impede a consulta de sair nesse estado.
 */
export const useDeal = (id: string | undefined) =>
  useQuery({
    queryKey: [...detailQueryKey, id] as const,
    queryFn: ({ signal }) => apiJson(DealDetail, `/deals/${id ?? ''}`, { signal }),
    enabled: id !== undefined,
  });

export interface ColumnPages {
  /** Os cards das páginas seguintes, na ordem em que foram carregadas. */
  readonly deals: readonly DealListItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  /** Refaz as páginas que falharam, e só elas. */
  readonly retry: () => void;
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
        queryKey: [...columnQueryKey, query] as const,
        queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
          apiJson(DealPage, `/deals${toQueryString(query)}`, { signal }),
      };
    }),
    combine: (results): ColumnPages => ({
      deals: results.flatMap((result) => result.data?.data ?? []),
      isLoading: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
      /*
       * Uma página que falhou é refeita, e não pulada: quem pede mais depois de
       * um erro está pedindo a mesma página de novo. Avançar o contador
       * deixaria um buraco de cinco cards no meio da coluna — exatamente o
       * "sem repetir nem pular card" que o servidor trabalha para garantir.
       */
      retry: () => {
        for (const result of results) {
          if (result.isError) void result.refetch();
        }
      },
    }),
  });

/**
 * Cadastra um negócio.
 *
 * `Schema.encodeSync` é o caminho de volta do mesmo Schema que validou o
 * formulário: o valor de domínio — texto aparado, centavos inteiros, data como
 * `Date`, identificadores marcados — volta à forma que trafega no JSON. Nenhuma
 * montagem de corpo à mão, e nenhuma chance de a requisição divergir do que a
 * API espera.
 *
 * As duas invalidações são as duas telas que a criação mexe: o board ganha um
 * card, e **a lista de Leads muda de status** — o contato vinculado passa a
 * estar "Em contato". Esquecer a segunda deixaria as duas telas contando
 * histórias diferentes até alguém recarregar a página.
 */
export const useCreateDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDealInput) =>
      apiJson(DealListItem, '/deals', {
        method: 'POST',
        body: Schema.encodeSync(CreateDealInput)(input),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dealsQueryKey }),
        queryClient.invalidateQueries({ queryKey: leadsQueryKey }),
      ]),
  });
};

/**
 * O gesto: qual card, e para que coluna.
 *
 * Não confundir com o `DealStageMove` do repositório da API, que é o que a
 * escrita grava (`{ stage, at }`). Este é o pedido visto da tela, e carrega o
 * **card inteiro** — não só o identificador —, porque é ele que a coluna de
 * destino desenha antes de o servidor responder.
 */
export interface DealMove {
  readonly deal: DealListItem;
  readonly to: DealStage;
}

/**
 * Move um negócio de coluna, **na velocidade do gesto**.
 *
 * É a única mutação otimista do CRM, e a exceção tem um motivo estreito: as
 * outras escritas acontecem dentro de um formulário, onde esperar o servidor é
 * o comportamento esperado; esta acontece na ponta do dedo de quem arrasta, e
 * um card que só chega à outra coluna depois da resposta parece um arrasto que
 * não pegou.
 *
 * O ciclo tem quatro tempos, e cada um resolve um problema concreto:
 *
 * - **`onMutate`** desenha o movimento antes de enviá-lo. Antes de mexer,
 *   cancela as consultas em voo do funil: uma resposta pedida há um instante
 *   chegaria com o board de antes e apagaria a previsão. Depois guarda o cache
 *   como estava — é este retrato que desfaz tudo se o servidor recusar.
 * - **`onError`** devolve o retrato. É o "o card volta sozinho para a origem" do
 *   spec, e a razão de o retrato cobrir o funil inteiro, e não só a consulta do
 *   board: as páginas do "carregar mais" também foram alteradas.
 * - **`onSettled`** invalida, tenha dado certo ou errado. A previsão é um
 *   palpite bem-informado, não a verdade: quem diz onde o card está, quantos
 *   negócios a coluna tem e qual é o status do contato é o servidor.
 * - **a lista de Leads** entra na invalidação porque mover muda o selo do
 *   contato vinculado — como na criação. Esquecê-la deixaria as duas telas
 *   contando histórias diferentes até alguém recarregar a página.
 */
export const useMoveDealStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deal, to }: DealMove) =>
      apiJson(DealListItem, `/deals/${deal.id}/stage`, {
        method: 'PATCH',
        // O mesmo Schema que a rota usa para ler o corpo, no caminho de volta.
        body: Schema.encodeSync(MoveDealStageInput)({ stage: to }),
      }),

    onMutate: async ({ deal, to }) => {
      await queryClient.cancelQueries({ queryKey: dealsQueryKey });

      const snapshot = queryClient.getQueriesData({ queryKey: dealsQueryKey });

      queryClient.setQueriesData<DealBoard>({ queryKey: boardQueryKey }, (board) =>
        boardWithDealMoved(board, deal, to),
      );
      queryClient.setQueriesData<DealPage>({ queryKey: columnQueryKey }, (page) =>
        pageWithoutDeal(page, deal.id),
      );

      return { snapshot };
    },

    onError: (_error, _move, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dealsQueryKey }),
        queryClient.invalidateQueries({ queryKey: leadsQueryKey }),
      ]),
  });
};
