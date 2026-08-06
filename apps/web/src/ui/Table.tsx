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
