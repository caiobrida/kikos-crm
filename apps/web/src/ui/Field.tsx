import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

const CONTROL =
  'w-full rounded-lg bg-surface-800 px-3 text-sm text-ink placeholder:text-ink-faint ' +
  'ring-1 ring-surface-600 ring-inset transition-colors ' +
  'hover:ring-surface-500 focus:ring-2 focus:ring-brand-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const CONTROL_INVALID = 'ring-lost-500 hover:ring-lost-500 focus:ring-lost-500';

export interface FieldProps {
  /** Precisa bater com o `id` do controle, para que clicar no rótulo foque o campo. */
  readonly htmlFor: string;
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  /** Quando presente, o campo aparece em estado de erro com a mensagem embaixo. */
  readonly error?: string;
  readonly children: ReactNode;
}

/**
 * A moldura de um campo de formulário: rótulo, marca de obrigatório, dica e
 * mensagem de erro junto do controle que a causou.
 *
 * O erro tem `role="alert"` e é referenciado por `aria-describedby` no
 * controle — quem usa leitor de tela ouve o motivo, não só o campo vermelho.
 */
export const Field = ({
  htmlFor,
  label,
  required = false,
  hint,
  error,
  children,
}: FieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
      {label}
      {required ? (
        <span className="ml-1 text-brand-400" aria-hidden="true">
          *
        </span>
      ) : null}
      {required ? <span className="sr-only"> (obrigatório)</span> : null}
    </label>

    {children}

    {hint !== undefined && error === undefined ? (
      <p id={`${htmlFor}-hint`} className="text-xs text-ink-faint">
        {hint}
      </p>
    ) : null}

    {error !== undefined ? (
      <p id={`${htmlFor}-error`} role="alert" className="text-xs text-lost-400">
        {error}
      </p>
    ) : null}
  </div>
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

export const Input = ({ invalid = false, className, ...rest }: InputProps) => (
  <input
    className={cn(CONTROL, 'h-10', invalid && CONTROL_INVALID, className)}
    aria-invalid={invalid}
    {...rest}
  />
);

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly invalid?: boolean;
}

export const Textarea = ({ invalid = false, className, ...rest }: TextareaProps) => (
  <textarea
    className={cn(CONTROL, 'min-h-24 py-2', invalid && CONTROL_INVALID, className)}
    aria-invalid={invalid}
    {...rest}
  />
);

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly invalid?: boolean;
}

export const Select = ({
  invalid = false,
  className,
  children,
  ...rest
}: SelectProps) => (
  <select
    className={cn(CONTROL, 'h-10', invalid && CONTROL_INVALID, className)}
    aria-invalid={invalid}
    {...rest}
  >
    {children}
  </select>
);
