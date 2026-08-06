import {
  createContext,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

const CONTROL =
  'w-full rounded-lg bg-surface-800 px-3 text-sm text-ink placeholder:text-ink-faint ' +
  'ring-1 ring-surface-600 ring-inset transition-colors ' +
  'hover:ring-surface-500 focus:ring-2 focus:ring-brand-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const CONTROL_INVALID = 'ring-lost-500 hover:ring-lost-500 focus:ring-lost-500';

/*
 * O `Field` não pode mexer nos filhos que recebe, mas precisa ligar o controle
 * à dica e à mensagem de erro. O contexto resolve isso sem `cloneElement`:
 * o `Field` publica os ids e o estado de erro, e `Input`, `Select` e `Textarea`
 * se descrevem sozinhos.
 *
 * Consequência que vale o custo: todo formulário do CRM nasce acessível, em vez
 * de depender de cada tela lembrar de escrever `aria-describedby` na mão.
 */
interface FieldAria {
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
}

const FieldAriaContext = createContext<FieldAria>({
  describedBy: undefined,
  invalid: false,
});

/** O `invalid` explícito do controle vence o que o `Field` inferiu do `error`. */
const useFieldAria = (invalid: boolean | undefined): FieldAria => {
  const inherited = useContext(FieldAriaContext);
  return {
    describedBy: inherited.describedBy,
    invalid: invalid ?? inherited.invalid,
  };
};

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
 * O erro tem `role="alert"` e é apontado pelo `aria-describedby` do controle —
 * quem usa leitor de tela ouve o motivo, não só encontra o campo vermelho.
 */
export const Field = ({
  htmlFor,
  label,
  required = false,
  hint,
  error,
  children,
}: FieldProps) => {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;

  // O erro substitui a dica, então só um dos dois descreve o controle por vez.
  const describedBy =
    error !== undefined ? errorId : hint !== undefined ? hintId : undefined;

  return (
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

      <FieldAriaContext.Provider value={{ describedBy, invalid: error !== undefined }}>
        {children}
      </FieldAriaContext.Provider>

      {hint !== undefined && error === undefined ? (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}

      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-xs text-lost-400">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

export const Input = ({ invalid, className, ...rest }: InputProps) => {
  const aria = useFieldAria(invalid);

  return (
    <input
      className={cn(CONTROL, 'h-10', aria.invalid && CONTROL_INVALID, className)}
      aria-invalid={aria.invalid}
      aria-describedby={aria.describedBy}
      {...rest}
    />
  );
};

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly invalid?: boolean;
}

export const Textarea = ({ invalid, className, ...rest }: TextareaProps) => {
  const aria = useFieldAria(invalid);

  return (
    <textarea
      className={cn(CONTROL, 'min-h-24 py-2', aria.invalid && CONTROL_INVALID, className)}
      aria-invalid={aria.invalid}
      aria-describedby={aria.describedBy}
      {...rest}
    />
  );
};

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly invalid?: boolean;
}

export const Select = ({ invalid, className, children, ...rest }: SelectProps) => {
  const aria = useFieldAria(invalid);

  return (
    <select
      className={cn(CONTROL, 'h-10', aria.invalid && CONTROL_INVALID, className)}
      aria-invalid={aria.invalid}
      aria-describedby={aria.describedBy}
      {...rest}
    >
      {children}
    </select>
  );
};
