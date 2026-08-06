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

/** O prefixo de toda consulta de Lead — é por ele que o cadastro as invalida. */
const leadsQueryKey = ['leads'] as const;

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
