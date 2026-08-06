import {
  LeadPage,
  type LeadSortBy,
  type LeadStatus,
  type SortOrder,
} from '@kikos/domain';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiJson } from './api';
import { toQueryString } from './queryString';

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
    queryKey: ['leads', view] as const,
    queryFn: ({ signal }) =>
      apiJson(LeadPage, `/leads${toQueryString({ ...view })}`, { signal }),
    /*
     * Mantém a página anterior na tela enquanto a nova carrega. Sem isso, cada
     * clique em "próxima" pisca uma tabela vazia antes de preenchê-la de novo.
     */
    placeholderData: keepPreviousData,
  });
