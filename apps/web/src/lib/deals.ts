import {
  BOARD_COLUMN_PAGE_SIZE,
  CloseDealInput,
  CreateDealInput,
  DealBoard,
  DealDetail,
  DealListItem,
  DealPage,
  MoveDealStageInput,
  UpdateDealInput,
  type DealSortBy,
  type DealStage,
  type SortOrder,
} from '@kikos/domain';
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Schema } from 'effect';
import { apiJson, apiSend } from './api';
import { boardWithDealMoved, pageWithoutDeal } from './board';
import { dealsQueryKey, leadsQueryKey } from './queryKeys';
import { toQueryString } from './queryString';

/*
 * Os prefixos de dentro do funil. Os dois primeiros existem como constantes
 * porque a movimentação precisa alcançá-los antes da resposta do servidor: o
 * board, onde o card muda de coluna, e as páginas do "carregar mais", de onde
 * ele some. O terceiro é o detalhamento, que a movimentação só invalida.
 */
const boardQueryKey = [...dealsQueryKey, 'board'] as const;
const columnQueryKey = [...dealsQueryKey, 'column'] as const;
const detailQueryKey = [...dealsQueryKey, 'detail'] as const;
/** A tabela paginada do dashboard, que lê a mesma rota que o "carregar mais". */
const listQueryKey = [...dealsQueryKey, 'list'] as const;

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
 * O `id` é obrigatório porque quem monta o painel e o modal só os monta com um
 * negócio em mãos: sem card escolhido e sem `:dealId` na URL, nenhum dos dois
 * chega a existir. Aceitar `undefined` aqui pediria um `enabled` para desligar
 * uma consulta que ninguém faria.
 */
export const useDeal = (id: string) =>
  useQuery({
    queryKey: [...detailQueryKey, id] as const,
    queryFn: ({ signal }) => apiJson(DealDetail, `/deals/${id}`, { signal }),
  });

/*
 * ---------------------------------------------------------------------------
 * A tabela de negócios
 * ---------------------------------------------------------------------------
 */

/**
 * O recorte que a tabela do dashboard está mostrando.
 *
 * Sem filtro de vendedor, ao contrário do board e da lista de Leads: a tabela
 * fica embaixo de dois gráficos que já mostram o funil inteiro e o time inteiro,
 * e um filtro que recortasse só a tabela faria a tela contar duas histórias ao
 * mesmo tempo. Quem quer o funil de uma pessoa tem o board.
 */
export interface DealsView {
  readonly search: string;
  readonly sortBy: DealSortBy;
  readonly order: SortOrder;
  readonly page: number;
}

/**
 * A tabela abre pelos negócios de maior valor.
 *
 * É o único lugar do CRM que não abre por "mais recente primeiro", e a diferença
 * é a pergunta: o board mostra o que se mexeu hoje, e a tabela do dashboard
 * existe para **descer do panorama ao caso concreto** — a barra do gráfico diz
 * que há R$ 12 milhões parados em negociação, e a primeira linha da tabela diz
 * quais negócios são esses.
 */
export const INITIAL_DEALS_VIEW: DealsView = {
  search: '',
  sortBy: 'valueInCents',
  order: 'desc',
  page: 1,
};

/**
 * Uma página de negócios — o que a tabela do dashboard desenha.
 *
 * **Reusa `GET /deals`**, a mesma listagem que carrega as páginas seguintes de
 * uma coluna cheia do board; a tabela não ganhou endpoint próprio. Como em toda
 * listagem do CRM, nada é recortado no navegador: o `view` vira query string, e
 * por isso ele também é a chave de cache.
 *
 * A chave é `['deals', 'list', …]` e não `['deals', 'column', …]` de propósito,
 * apesar de as duas consultarem a mesma rota: o "carregar mais" do board é
 * reescrito à mão pela mutação otimista do arrasto, e a tabela não tem por que
 * entrar nessa reescrita — ela não é alvo de arrasto nenhum.
 */
export const useDeals = (view: DealsView) =>
  useQuery({
    queryKey: [...listQueryKey, view] as const,
    queryFn: ({ signal }) =>
      apiJson(DealPage, `/deals${toQueryString({ ...view })}`, { signal }),
    /*
     * Mantém a página anterior na tela enquanto a nova carrega, como na lista
     * de Leads: sem isso, cada tecla digitada na busca pisca uma tabela vazia.
     */
    placeholderData: keepPreviousData,
  });

/**
 * Quantos negócios, escrito como a tela fala.
 *
 * Mora aqui, e não em cada tela, porque o board e o dashboard contam a mesma
 * coisa — e contam sempre o **total do servidor**, não o tamanho do que veio na
 * página.
 */
export const dealCountLabel = (total: number): string => {
  if (total === 0) return 'Nenhum negócio';
  return total === 1 ? '1 negócio' : `${total} negócios`;
};

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

/**
 * Encerra um negócio como ganho ou perdido.
 *
 * **Sem escrita otimista**, ao contrário do arrasto, e a diferença é a mesma que
 * separa comentar de mover: encerrar termina num clique em "Marcar como Ganho",
 * onde esperar o servidor é o comportamento que se espera — e um card que pulasse
 * para a coluna Fechado, pintasse de verde e voltasse seria pior do que meio
 * segundo de espera. É também a ação menos reversível do CRM: reabrir negócio não
 * existe, e prever na tela o que o servidor pode recusar seria mostrar um
 * desfecho que talvez não tenha sido registrado.
 *
 * As duas invalidações são as mesmas do arrasto, e pelos mesmos motivos — o card
 * muda de coluna e o selo do contato vinculado passa a Ganho ou Perdido. A do
 * prefixo de Deal alcança de uma vez o board, o detalhamento (que ganhou
 * resultado e data de fechamento) e a linha do tempo, onde nasceu o registro de
 * sistema do encerramento.
 *
 * A invalidação é aguardada, então a mutação só termina depois que o funil
 * voltou do servidor: quem fechou o diálogo já encontra o card na coluna certa.
 */
export const useCloseDeal = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CloseDealInput) =>
      apiJson(DealListItem, `/deals/${id}/close`, {
        method: 'POST',
        // O mesmo Schema que a rota usa para ler o corpo, no caminho de volta.
        body: Schema.encodeSync(CloseDealInput)(input),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dealsQueryKey }),
        queryClient.invalidateQueries({ queryKey: leadsQueryKey }),
      ]),
  });
};

/**
 * Corrige o cadastro de um negócio.
 *
 * `Schema.encodeSync` é o caminho de volta do mesmo Schema que validou o
 * formulário — o do cadastro menos o estágio (ver `UpdateDealInput`), porque
 * mover é outra ação.
 *
 * **Só o funil é invalidado, e a carteira não.** É a única escrita do CRM de que
 * isso vale: editar um negócio não avança a última interação nem mexe no selo do
 * contato — corrigir o valor de uma proposta não é acontecimento com o cliente.
 * Derrubar a lista de Leads aqui seria recarregar uma tela que não mudou.
 *
 * O prefixo de Deal alcança de uma vez o board, as páginas do "carregar mais" e o
 * detalhamento, que é o que a tela está mostrando quando alguém salva.
 */
export const useUpdateDeal = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDealInput) =>
      apiJson(DealListItem, `/deals/${id}`, {
        method: 'PUT',
        body: Schema.encodeSync(UpdateDealInput)(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dealsQueryKey }),
  });
};

/**
 * Remove um negócio.
 *
 * `apiSend` e não `apiJson`: a rota responde 204 sem corpo — não há recurso a
 * devolver, porque ele deixou de existir para quem lê.
 *
 * A carteira **entra** na invalidação aqui, ao contrário da edição, e por um
 * motivo estreito: a lista de Leads não muda, mas a contagem que trava a remoção
 * de um contato muda — o negócio que saiu do funil era um dos que a seguravam. É
 * barato manter as duas telas contando a mesma história.
 *
 * Sem escrita otimista, como as outras: remover acontece depois de uma
 * confirmação, e um card que sumisse antes da resposta teria de voltar sozinho no
 * caso em que o servidor recusa.
 */
export const useDeleteDeal = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiSend(`/deals/${id}`, { method: 'DELETE' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dealsQueryKey }),
        queryClient.invalidateQueries({ queryKey: leadsQueryKey }),
      ]),
  });
};
