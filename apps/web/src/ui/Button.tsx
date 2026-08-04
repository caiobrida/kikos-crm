import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  secondary:
    'bg-surface-700 text-ink ring-1 ring-surface-500 ring-inset hover:bg-surface-600',
  ghost: 'text-ink-muted hover:bg-surface-800 hover:text-ink',
  danger: 'bg-lost-500 text-white hover:bg-lost-600',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Mostra o giro e desabilita o clique, para não enviar o formulário duas vezes. */
  readonly isLoading?: boolean;
  readonly leadingIcon?: ReactNode;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    // O default de `type` num <button> dentro de <form> é "submit". Deixar
    // explícito evita o envio acidental que vem junto.
    type={type}
    className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
    disabled={disabled === true || isLoading}
    aria-busy={isLoading}
    {...rest}
  >
    {isLoading ? (
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
    ) : (
      leadingIcon
    )}
    {children}
  </button>
);
