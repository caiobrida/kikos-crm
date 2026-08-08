import { useSellerWorkload } from '../lib/sellers';
import { Alert } from '../ui/Alert';
import { Avatar } from '../ui/Avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../ui/Table';

/*
 * A tela de Vendedores — quem pode receber Lead e Deal, e quanto cada um está
 * carregando.
 *
 * **É somente leitura, e isso é decisão de produto, não fatia por fazer.** Não há
 * CRUD de User no CRM: a identidade é única (ADR-0001) e o time vem do seed. A
 * tela responde a duas perguntas do gestor — quem está no time e como o trabalho
 * está dividido — e não oferece nenhuma ação, porque não há ação a oferecer.
 *
 * **A lista é de Users com `role` igual a `SELLER`** (ver o verbete "Seller" em
 * CONTEXT.md), e é por isso que a consulta é `?role=SELLER`. O papel é rótulo, e
 * não regra de acesso: um gestor **pode** receber contato e negócio, e se
 * receber, o número dele aparece no dashboard, que mostra o time inteiro. São
 * duas telas com recortes diferentes de propósito — esta pergunta "como está a
 * carga dos vendedores?", e o dashboard pergunta "quem fechou o quê?".
 *
 * Sem busca, filtro nem paginação, ao contrário de Leads e do board: o time
 * comercial cabe numa tela. Acrescentar controles aqui seria oferecer recorte
 * sobre quatro linhas.
 *
 * As contagens **não são calculadas aqui**. Elas vêm de dois `GROUP BY` no banco
 * (`GET /users/workload`), como toda consulta do CRM — e é o que faz elas baterem
 * com o que a lista de Leads e o board mostram quando alguém filtra por essa
 * mesma pessoa.
 */

const COLUMNS = [
  { label: 'Vendedor', numeric: false },
  { label: 'E-mail', numeric: false },
  { label: 'Contatos', numeric: true },
  { label: 'Negócios em aberto', numeric: true },
] as const;

const teamLabel = (total: number): string => {
  if (total === 0) return 'Nenhum vendedor cadastrado';
  return total === 1 ? '1 vendedor no time' : `${total} vendedores no time`;
};

export const SellersPage = () => {
  const team = useSellerWorkload();
  const sellers = team.data;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Vendedores</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {sellers === undefined
            ? 'Carregando o time…'
            : `${teamLabel(sellers.length)}, com os contatos e os negócios em aberto de cada um.`}
        </p>
      </header>

      {team.isError ? (
        <Alert>Não foi possível carregar o time. Tente de novo.</Alert>
      ) : null}

      <Table>
        <TableHead>
          <tr>
            {COLUMNS.map(({ label, numeric }) => (
              <TableHeadCell
                key={label}
                className={numeric ? 'text-right whitespace-nowrap' : undefined}
              >
                {label}
              </TableHeadCell>
            ))}
          </tr>
        </TableHead>

        <TableBody>
          {sellers === undefined ? (
            <TableEmpty colSpan={COLUMNS.length}>Carregando…</TableEmpty>
          ) : sellers.length === 0 ? (
            <TableEmpty colSpan={COLUMNS.length}>
              Nenhum vendedor no time. Rode o seed para popular o CRM.
            </TableEmpty>
          ) : (
            sellers.map(({ user, leadCount, openDealCount }) => (
              /*
               * A linha não é clicável, ao contrário das de Leads e do board:
               * não há detalhamento de vendedor para abrir. Deixá-la com o
               * cursor de mão prometeria uma tela que não existe.
               */
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <Avatar name={user.name} />
                    {user.name}
                  </span>
                </TableCell>
                <TableCell className="text-ink-muted">{user.email}</TableCell>
                {/* Alinhados à direita e tabulares: assim as unidades ficam uma
                    embaixo da outra e as colunas dá para comparar de relance. */}
                <TableCell className="text-right tabular-nums">{leadCount}</TableCell>
                <TableCell className="text-right tabular-nums">{openDealCount}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
