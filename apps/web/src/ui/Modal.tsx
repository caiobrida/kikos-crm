import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * `md` serve para confirmação e formulário curto; `full` é o modal quase de
 * tela cheia do detalhamento de um Deal. Não há modal sobre modal no produto —
 * editar troca o conteúdo deste mesmo modal.
 */
type ModalSize = 'md' | 'full';

const SIZES: Record<ModalSize, string> = {
  md: 'w-full max-w-lg',
  full: 'h-[92vh] w-[95vw] max-w-6xl',
};

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly size?: ModalSize;
  readonly children: ReactNode;
  /** Rodapé fixo, onde ficam as ações e a confirmação em linha de remover. */
  readonly footer?: ReactNode;
}

/**
 * A casca de modal, sobre o `<dialog>` nativo.
 *
 * Usar o elemento nativo em vez de uma `div` com `position: fixed` entrega de
 * graça o que costuma ser reimplementado errado: fechar no Esc, prender o foco
 * dentro do diálogo, tornar o resto da página inerte, e empilhar na top layer
 * sem disputa de `z-index`.
 */
export const Modal = ({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
}: ModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Um id por instância: mais de um modal pode estar montado ao mesmo tempo,
  // e dois `id` iguais no documento quebram o `aria-labelledby` dos dois.
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Clique no backdrop: só o próprio <dialog> é alvo quando o clique cai fora
  // do conteúdo, porque o painel interno ocupa a caixa inteira.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      // O `close` nativo dispara tanto no Esc quanto no `dialog.close()`, então
      // o estado de quem chama acompanha o diálogo sem tratar tecla na mão.
      onClose={onClose}
      onClick={handleClick}
      aria-labelledby={titleId}
      className={cn(
        'm-auto rounded-card bg-surface-900 p-0 text-ink shadow-2xl ring-1 ring-surface-600',
        'backdrop:bg-surface-950/80 backdrop:backdrop-blur-sm',
        SIZES[size],
      )}
    >
      <div className="flex h-full max-h-[92vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-surface-700 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description !== undefined ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 rounded-lg px-2 py-1 text-xl leading-none text-ink-muted transition-colors hover:bg-surface-800 hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer !== undefined ? (
          <footer className="flex items-center justify-end gap-2 border-t border-surface-700 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
};
