import {
  CreateLeadInput,
  LeadListItem,
  LeadPage,
  type LeadSortBy,
  type LeadStatus,
  type SortOrder,
} from '@kikos/domain';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Schema } from 'effect';
import { apiJson } from './api';
import { toQueryString } from './queryString';

/**
 * O prefixo de toda consulta de Lead — é por ele que o cadastro as invalida.
 *
 * Exportado porque a criação de um negócio também mexe na carteira: ela muda o
 * status do contato vinculado, e quem invalida por lá precisa apontar para o
 * mesmo prefixo daqui.
 */
export const leadsQueryKey = ['leads'] as const;

/**
 * O recorte que a tela de Leads está mostrando.
 *
 * Os filtros vazios são a string vazia, e não `undefined`, porque é isso que um
 * `<select>` sem seleção devolve — quem os transforma em "sem filtro" é o
 * `toQueryString`, num lugar só.
 */
export interface LeadsView {
  readonly search: string;
  readonly status: LeadStatus | '';
  readonly ownerId: string;
  readonly sortBy: LeadSortBy;
  readonly order: SortOrder;
  readonly page: number;
}

export const INITIAL_LEADS_VIEW: LeadsView = {
  search: '',
  status: '',
  ownerId: '',
  // Quem abre a tela quer ver o que se mexeu hoje. É também o default da API.
  sortBy: 'lastInteractionAt',
  order: 'desc',
  page: 1,
};

/**
 * A lista de Leads do recorte pedido.
 *
 * Nada é filtrado, ordenado ou paginado aqui: o `view` inteiro vira query
 * string, e o que volta já é a página pronta. Por isso o `view` também é a
 * chave de cache — dois recortes diferentes são duas respostas diferentes do
 * servidor, e não dois jeitos de olhar a mesma lista.
 */
export const useLeads = (view: LeadsView) =>
  useQuery({
    queryKey: [...leadsQueryKey, view] as const,
    queryFn: ({ signal }) =>
      apiJson(LeadPage, `/leads${toQueryString({ ...view })}`, { signal }),
    /*
     * Mantém a página anterior na tela enquanto a nova carrega. Sem isso, cada
     * clique em "próxima" pisca uma tabela vazia antes de preenchê-la de novo.
     */
    placeholderData: keepPreviousData,
  });

/** Quantos contatos o campo de busca do cadastro de negócio oferece por vez. */
const LEAD_SEARCH_SIZE = 8;

/**
 * Os contatos que casam com o termo — o que o campo de Lead do cadastro de
 * negócio mostra enquanto se digita.
 *
 * É a mesma consulta da lista de Leads, com outro recorte: ordenada por nome,
 * porque é pelo nome que se procura, e curta, porque é uma lista que cabe
 * embaixo de um campo. **A busca continua acontecendo no servidor** — o campo
 * não baixa a carteira para filtrar no navegador, e por isso ele funciona igual
 * com trinta ou trinta mil contatos.
 *
 * `enabled` evita a consulta enquanto o campo não está em uso: o formulário
 * abre com o Lead ainda por escolher, e um `<select>` de vendedores já basta de
 * requisição na abertura.
 */
export const useLeadSearch = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: [...leadsQueryKey, 'search', search] as const,
    queryFn: ({ signal }) =>
      apiJson(
        LeadPage,
        `/leads${toQueryString({
          search,
          sortBy: 'name',
          order: 'asc',
          pageSize: LEAD_SEARCH_SIZE,
        })}`,
        { signal },
      ),
    enabled,
    // Mantém a lista anterior enquanto a nova carrega, para o campo não piscar
    // vazio a cada pausa na digitação.
    placeholderData: keepPreviousData,
  });

/**
 * Cadastra um Lead.
 *
 * `Schema.encodeSync` é o caminho de volta do mesmo Schema que validou o
 * formulário: o valor de domínio — aparado, com marca de `UserId`, com
 * `undefined` no campo opcional em branco — volta à forma que trafega no JSON.
 * Nenhuma montagem de corpo à mão, e nenhuma chance de a requisição divergir do
 * que a API espera.
 *
 * Invalidar o prefixo `['leads']` derruba **todos** os recortes em cache, não só
 * o que está na tela: o contato novo pode pertencer a uma busca, a um filtro ou
 * a uma página que o vendedor visita em seguida. Como a invalidação é aguardada,
 * a mutação só termina depois que a lista visível voltou do servidor — que é o
 * que faz o contato "aparecer imediatamente" e não um instante depois.
 */
export const useCreateLead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLeadInput) =>
      apiJson(LeadListItem, '/leads', {
        method: 'POST',
        body: Schema.encodeSync(CreateLeadInput)(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadsQueryKey }),
  });
};
