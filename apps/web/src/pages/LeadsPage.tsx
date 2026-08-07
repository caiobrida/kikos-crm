import { LEAD_STATUSES, type LeadSortBy, type LeadStatus } from '@kikos/domain';
import { useState } from 'react';
import { formatLastInteraction } from '../lib/dates';
import { INITIAL_LEADS_VIEW, useLeads, type LeadsView } from '../lib/leads';
import { LEAD_STATUS_LABELS } from '../lib/labels';
import { useSellers } from '../lib/sellers';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { Alert } from '../ui/Alert';
import { Avatar } from '../ui/Avatar';
import { LeadStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { OwnerFilter } from '../ui/OwnerFilter';
import { Pagination } from '../ui/Pagination';
import { CreateLeadModal } from './CreateLeadModal';
import { LeadDetailModal } from './LeadDetailModal';
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
 * A lista de Leads.
 *
 * A regra que organiza esta tela inteira: **ela não recorta nada.** Não há
 * `filter`, `sort` nem `slice` sobre os dados em lugar nenhum deste arquivo.
 * O que existe é um `view` — busca, filtros, coluna, direção e página — que
 * vira query string, e uma resposta que já chega pronta para desenhar. Quando
 * a base tiver dez mil contatos, esta tela continuará carregando dez linhas.
 */

/**
 * As colunas da tabela, na ordem em que aparecem.
 *
 * A chave é o valor que vai para `?sortBy=`, e o tipo cobra que ela pertença à
 * união que a API aceita: renomear uma coluna no domínio quebra o typecheck
 * aqui, em vez de virar um 400 quando alguém clicar no cabeçalho.
 */
const COLUMNS: readonly { readonly key: LeadSortBy; readonly label: string }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'company', label: 'Empresa' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefone' },
  { key: 'owner', label: 'Responsável' },
  { key: 'status', label: 'Status' },
  { key: 'lastInteractionAt', label: 'Última interação' },
];

const countLabel = (total: number): string => {
  if (total === 0) return 'Nenhum contato';
  return total === 1 ? '1 contato' : `${total} contatos`;
};

export const LeadsPage = () => {
  const [view, setView] = useState<LeadsView>(INITIAL_LEADS_VIEW);
  /*
   * O modal é montado só quando está aberto, e não escondido com `open={false}`:
   * assim cada cadastro começa com o formulário em branco, sem depender de
   * alguém lembrar de limpá-lo ao fechar.
   */
  const [isCreating, setIsCreating] = useState(false);
  /*
   * O contato aberto no modal, se houver algum. Estado, e não rota: abrir um
   * contato é consulta e correção pontual, e uma rota por linha encheria o
   * histórico do navegador de estados intermediários — o botão voltar passaria a
   * desfazer cliques em tabela. Quem tem endereço próprio é o detalhamento de um
   * negócio, que é onde se trabalha a oportunidade.
   */
  const [openLeadId, setOpenLeadId] = useState<string>();
  const sellers = useSellers();

  /*
   * A busca digitada e a busca consultada são duas coisas diferentes: o campo
   * responde a cada tecla, a consulta espera 300ms de silêncio. Trocar de
   * página ou de filtro não passa por essa espera — só o texto passa.
   */
  const search = useDebouncedValue(view.search, 300);
  const leads = useLeads({ ...view, search });

  /** Mexer no recorte volta para a primeira página: a antiga pode nem existir. */
  const refine = (change: Partial<LeadsView>) =>
    setView((current) => ({ ...current, ...change, page: 1 }));

  /** Clicar num cabeçalho ordena por ele; clicar de novo inverte a direção. */
  const sortBy = (column: LeadSortBy) =>
    refine(
      view.sortBy === column
        ? { order: view.order === 'asc' ? 'desc' : 'asc' }
        : { sortBy: column, order: 'asc' },
    );

  const page = leads.data;

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Leads</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {page === undefined ? 'Carregando a carteira…' : countLabel(page.total)}
            {page !== undefined && page.total > 0 ? ' no recorte atual.' : ''}
          </p>
        </div>

        <Button onClick={() => setIsCreating(true)}>Criar Novo Lead</Button>
      </header>

      {isCreating ? <CreateLeadModal onClose={() => setIsCreating(false)} /> : null}

      {/*
        Montado só quando há contato escolhido, como o de cadastro: assim cada
        abertura começa do zero — em modo de leitura, sem a edição de antes meio
        preenchida por baixo.
      */}
      {openLeadId === undefined ? null : (
        <LeadDetailModal leadId={openLeadId} onClose={() => setOpenLeadId(undefined)} />
      )}

      {/*
        Os controles são dimensionados pelo contêiner, e não por uma classe de
        largura no próprio campo: as primitivas já são `w-full`, e `cn` não
        resolve conflito entre utilidades do Tailwind (ver `lib/cn.ts`).
      */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="leads-search" className="sr-only">
            Buscar contatos
          </label>
          <Input
            id="leads-search"
            type="search"
            value={view.search}
            onChange={(event) => refine({ search: event.target.value })}
            placeholder="Buscar por nome, empresa ou e-mail"
          />
        </div>

        <div className="w-48">
          <label htmlFor="leads-status" className="sr-only">
            Filtrar por status
          </label>
          <Select
            id="leads-status"
            value={view.status}
            onChange={(event) =>
              refine({ status: event.target.value as LeadStatus | '' })
            }
          >
            <option value="">Todos os status</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-56">
          <OwnerFilter
            id="leads-owner"
            sellers={sellers.data ?? []}
            value={view.ownerId}
            onChange={(ownerId) => refine({ ownerId })}
          />
        </div>
      </div>

      {leads.isError ? (
        <Alert>Não foi possível carregar os contatos. Tente de novo.</Alert>
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
              Nenhum contato neste recorte. Tente afrouxar a busca ou os filtros.
            </TableEmpty>
          ) : (
            page.data.map((lead) => (
              // A linha inteira abre o contato: é o padrão do produto, o mesmo
              // que o card do board segue no funil.
              <TableRow key={lead.id} onClick={() => setOpenLeadId(lead.id)}>
                <TableCell className="font-medium whitespace-nowrap">
                  {lead.name}
                </TableCell>
                <TableCell className="whitespace-nowrap">{lead.company}</TableCell>
                <TableCell className="text-ink-muted">{lead.email}</TableCell>
                <TableCell className="whitespace-nowrap text-ink-muted">
                  {lead.phone}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar name={lead.owner.name} size="sm" />
                    {lead.owner.name}
                  </span>
                </TableCell>
                <TableCell>
                  <LeadStatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-ink-muted">
                  {formatLastInteraction(lead.lastInteractionAt)}
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
    </div>
  );
};
