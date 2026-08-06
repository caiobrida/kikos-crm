import { cn } from '../lib/cn';
import { initialsFromName } from '../lib/initials';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AvatarSize, string> = {
  sm: 'size-6 text-[0.625rem]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
};

/*
 * Uma paleta fixa em vez de cor aleatória: o mesmo nome cai sempre no mesmo
 * tom, então o vendedor vira reconhecível de relance nos cards e nas tabelas.
 */
const TINTS = [
  'bg-sky-500/20 text-sky-200',
  'bg-violet-500/20 text-violet-200',
  'bg-emerald-500/20 text-emerald-200',
  'bg-amber-500/20 text-amber-200',
  'bg-rose-500/20 text-rose-200',
  'bg-teal-500/20 text-teal-200',
] as const;

const tintForName = (name: string): string => {
  let hash = 0;
  for (const char of name) {
    hash = (hash + char.codePointAt(0)!) % TINTS.length;
  }
  return TINTS[hash] ?? TINTS[0];
};

export interface AvatarProps {
  readonly name: string;
  readonly size?: AvatarSize;
  readonly className?: string;
}

/**
 * O avatar circular com as iniciais do User. Não há upload de foto no produto,
 * então as iniciais são a identidade visual de uma pessoa.
 */
export const Avatar = ({ name, size = 'md', className }: AvatarProps) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
      SIZES[size],
      tintForName(name),
      className,
    )}
    // O nome inteiro fica no `title` e no rótulo acessível; as iniciais
    // sozinhas não dizem quem é a pessoa.
    title={name}
    aria-label={name}
    role="img"
  >
    {initialsFromName(name)}
  </span>
);
