import type { ReactNode, ThHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/*
 * A casca de tabela, em peças que se compõem. Deliberadamente não é uma tabela
 * dirigida por dados (`<Table columns={...} rows={...} />`): as telas de Leads
 * e do Dashboard renderizam célula com selo, avatar e ação, e uma API de
 * colunas genérica acabaria recebendo um `render` por coluna de qualquer jeito.
 *
 * Ordenação e paginação não moram aqui — acontecem no servidor (ver spec) e
 * entram como props das telas que usam estas peças.
 */

export const Table = ({ children }: { readonly children: ReactNode }) => (
  <div className="overflow-x-auto rounded-card ring-1 ring-surface-700">
    <table className="w-full border-collapse text-left text-sm">{children}</table>
  </div>
);

export const TableHead = ({ children }: { readonly children: ReactNode }) => (
  <thead className="bg-surface-800 text-xs tracking-wide text-ink-muted uppercase">
    {children}
  </thead>
);

export const TableBody = ({ children }: { readonly children: ReactNode }) => (
  <tbody className="divide-y divide-surface-700 bg-surface-900">{children}</tbody>
);

export interface TableRowProps {
  readonly children: ReactNode;
  /** Linha clicável abre o modal do registro — o padrão de Leads e Deals. */
  readonly onClick?: () => void;
}

export const TableRow = ({ children, onClick }: TableRowProps) =>
  onClick === undefined ? (
    <tr>{children}</tr>
  ) : (
    <tr
      // A linha inteira é o alvo do clique, mas quem navega por teclado precisa
      // conseguir chegar nela e acioná-la.
      tabIndex={0}
      role="button"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer transition-colors hover:bg-surface-800 focus-visible:bg-surface-800"
    >
      {children}
    </tr>
  );

export interface TableHeadCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  readonly children: ReactNode;
}

export const TableHeadCell = ({ children, className, ...rest }: TableHeadCellProps) => (
  <th scope="col" className={cn('px-4 py-3 font-medium', className)} {...rest}>
    {children}
  </th>
);

export interface TableSortHeadCellProps {
  readonly children: ReactNode;
  /** Se esta é a coluna pela qual a lista está ordenada agora. */
  readonly active: boolean;
  /** A direção vigente — só significa alguma coisa quando `active`. */
  readonly order: 'asc' | 'desc';
  readonly onSort: () => void;
  readonly className?: string;
}

/**
 * O cabeçalho que ordena ao ser clicado, e inverte ao ser clicado de novo.
 *
 * A ordenação em si acontece no servidor: este componente não sabe o que é um
 * Lead, só avisa que a coluna foi pedida. `aria-sort` é o que faz um leitor de
 * tela anunciar "ordenado crescente" — a setinha sozinha não diz nada a quem
 * não enxerga a tela.
 */
export const TableSortHeadCell = ({
  children,
  active,
  order,
  onSort,
  className,
}: TableSortHeadCellProps) => (
  <TableHeadCell
    aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    className={cn('p-0', className)}
  >
    <button
      type="button"
      onClick={onSort}
      className={cn(
        'flex w-full items-center gap-1.5 px-4 py-3 text-left whitespace-nowrap uppercase transition-colors',
        active ? 'text-ink' : 'hover:text-ink',
      )}
    >
      {children}
      <span aria-hidden="true" className={cn('text-[0.6rem]', !active && 'opacity-0')}>
        {order === 'asc' ? '▲' : '▼'}
      </span>
    </button>
  </TableHeadCell>
);

export interface TableCellProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export const TableCell = ({ children, className }: TableCellProps) => (
  <td className={cn('px-4 py-3 text-ink', className)}>{children}</td>
);

export interface TableEmptyProps {
  readonly colSpan: number;
  readonly children: ReactNode;
}

/** O estado vazio mora dentro da tabela para não desalinhar o cabeçalho. */
export const TableEmpty = ({ colSpan, children }: TableEmptyProps) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-ink-muted">
      {children}
    </td>
  </tr>
);
