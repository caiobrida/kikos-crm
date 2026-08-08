import type { DealListItem, DealSortBy } from '@kikos/domain';
import { useState } from 'react';
import { INITIAL_DEALS_VIEW, useDeals, type DealsView } from '../lib/deals';
import { formatBRL } from '../lib/money';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { Alert } from '../ui/Alert';
import { Avatar } from '../ui/Avatar';
import { DealResultBadge, DealStageBadge } from '../ui/Badge';
import { Input } from '../ui/Field';
import { Pagination } from '../ui/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableRow,
  TableSortHeadCell,
} from '../ui/Table';

/*
 * A tabela de negócios do dashboard — onde se desce do panorama ao caso
 * concreto.
 *
 * Vale aqui a regra das outras listagens do CRM: **a tela não recorta nada.**
 * Não há `filter`, `sort` nem `slice` sobre os dados neste arquivo. O `view` —
 * busca, coluna, direção e página — vira query string, e a resposta chega
 * pronta para desenhar.
 *
 * Ela **reusa `GET /deals`**, o mesmo endpoint que carrega as páginas seguintes
 * de uma coluna cheia do board. Um endpoint paralelo só para o dashboard seria
 * um segundo lugar onde a regra de remoção lógica e a de ordenação estável
 * teriam de ser lembradas.
 *
 * **A busca fica aqui, e não acima dos gráficos.** Ela recorta só a tabela: os
 * dois gráficos são o panorama do funil inteiro, e um campo de busca no topo da
 * página pareceria recortar os três — a tela passaria a contar duas histórias ao
 * mesmo tempo, uma nas barras e outra nas linhas.
 */

/**
 * As colunas da tabela, na ordem em que aparecem.
 *
 * A chave é o valor que vai para `?sortBy=`, e o tipo cobra que ela pertença à
 * união que a API aceita — renomear uma coluna no domínio quebra o typecheck
 * aqui, em vez de virar um 400 quando alguém clicar no cabeçalho.
 *
 * `lastInteractionAt` existe na API e **não** está aqui: ordenar por uma coluna
 * que a tabela não mostra é uma seta apontando para o nada. Quem quer o funil
 * por atividade recente tem o board, que já ordena assim dentro de cada coluna.
 */
const COLUMNS: readonly { readonly key: DealSortBy; readonly label: string }[] = [
  { key: 'title', label: 'Negócio' },
  { key: 'lead', label: 'Contato' },
  { key: 'owner', label: 'Responsável' },
  { key: 'stage', label: 'Estágio' },
  { key: 'valueInCents', label: 'Valor' },
];

export interface DashboardDealsTableProps {
  /** Abrir uma linha leva ao endereço do negócio — o mesmo modal do board. */
  readonly onOpen: (deal: DealListItem) => void;
}

export const DashboardDealsTable = ({ onOpen }: DashboardDealsTableProps) => {
  const [view, setView] = useState<DealsView>(INITIAL_DEALS_VIEW);

  /*
   * A busca digitada e a busca consultada são duas coisas diferentes: o campo
   * responde a cada tecla, a consulta espera 300ms de silêncio. Trocar de página
   * ou de coluna não passa por essa espera — só o texto passa.
   */
  const search = useDebouncedValue(view.search, 300);
  const deals = useDeals({ ...view, search });

  /** Mexer no recorte volta para a primeira página: a antiga pode nem existir. */
  const refine = (change: Partial<DealsView>) =>
    setView((current) => ({ ...current, ...change, page: 1 }));

  /** Clicar num cabeçalho ordena por ele; clicar de novo inverte a direção. */
  const sortBy = (column: DealSortBy) =>
    refine(
      view.sortBy === column
        ? { order: view.order === 'asc' ? 'desc' : 'asc' }
        : { sortBy: column, order: 'asc' },
    );

  const page = deals.data;

  return (
    <section className="rounded-card bg-surface-900 p-5 ring-1 ring-surface-700">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Negócios</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Busca, ordenação e paginação valem só para esta tabela — os gráficos acima
            mostram o funil inteiro.
          </p>
        </div>

        <div className="min-w-64">
          <label htmlFor="dashboard-search" className="sr-only">
            Buscar negócios
          </label>
          <Input
            id="dashboard-search"
            type="search"
            value={view.search}
            onChange={(event) => refine({ search: event.target.value })}
            placeholder="Buscar por negócio, contato ou empresa"
          />
        </div>
      </header>

      {deals.isError ? (
        <Alert>Não foi possível carregar os negócios. Tente de novo.</Alert>
      ) : null}

      <Table>
        <TableHead>
          <tr>
            {COLUMNS.map(({ key, label }) => (
              <TableSortHeadCell
                key={key}
                active={view.sortBy === key}
                order={view.order}
                onSort={() => sortBy(key)}
              >
                {label}
              </TableSortHeadCell>
            ))}
          </tr>
        </TableHead>

        <TableBody>
          {page === undefined ? (
            <TableEmpty colSpan={COLUMNS.length}>Carregando…</TableEmpty>
          ) : page.data.length === 0 ? (
            <TableEmpty colSpan={COLUMNS.length}>
              Nenhum negócio neste recorte. Tente afrouxar a busca.
            </TableEmpty>
          ) : (
            page.data.map((deal) => (
              // A linha inteira abre o negócio: é o padrão do produto, o mesmo
              // que a lista de Leads e o card do board seguem.
              <TableRow key={deal.id} onClick={() => onOpen(deal)}>
                <TableCell className="font-medium whitespace-nowrap">
                  {deal.title}
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  {deal.lead.name}
                  <span className="block text-xs text-ink-muted">
                    {deal.lead.company}
                  </span>
                </TableCell>

                <TableCell>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar name={deal.owner.name} size="sm" />
                    {deal.owner.name}
                  </span>
                </TableCell>

                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <DealStageBadge stage={deal.stage} />
                    {/*
                      O desfecho só aparece quando existe, como no detalhamento:
                      um selo "Em aberto" em toda linha do funil seria ruído. Na
                      coluna Fechado ele é o que distingue ganho de perdido sem
                      abrir o negócio.
                    */}
                    {deal.result === 'OPEN' ? null : (
                      <DealResultBadge result={deal.result} />
                    )}
                  </span>
                </TableCell>

                <TableCell className="font-medium whitespace-nowrap tabular-nums">
                  {formatBRL(deal.valueInCents)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {page === undefined ? null : (
        <Pagination
          page={page.page}
          pageSize={page.pageSize}
          total={page.total}
          onPageChange={(next) => setView((current) => ({ ...current, page: next }))}
        />
      )}
    </section>
  );
};
