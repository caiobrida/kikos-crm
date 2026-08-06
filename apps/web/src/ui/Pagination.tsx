import { Button } from './Button';

export interface PaginationProps {
  readonly page: number;
  readonly pageSize: number;
  /** O total do recorte inteiro, não o número de linhas desta página. */
  readonly total: number;
  readonly onPageChange: (page: number) => void;
}

/**
 * A navegação entre páginas de uma listagem.
 *
 * Anterior e próxima, sem a régua numerada: as páginas vêm do servidor e a
 * régua exigiria decidir quantos números mostrar de cada lado. O texto do meio
 * é o que responde "onde estou e quanto falta".
 */
export const Pagination = ({ page, pageSize, total, onPageChange }: PaginationProps) => {
  // Recorte vazio não tem o que navegar, e o estado vazio da tabela já disse
  // o que houve. Com uma página só a navegação fica, desabilitada: o "1–7 de 7"
  // continua sendo a resposta a "estou vendo tudo?".
  if (total === 0) return null;

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
    >
      <p className="text-sm text-ink-muted">
        Mostrando{' '}
        <span className="text-ink">
          {first}–{last}
        </span>{' '}
        de <span className="text-ink">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>

        <span className="px-1 text-sm text-ink-muted">
          Página {page} de {lastPage}
        </span>

        <Button
          variant="secondary"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </nav>
  );
};
