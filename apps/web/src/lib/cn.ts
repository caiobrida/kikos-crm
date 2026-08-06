type ClassValue = string | false | null | undefined;

/**
 * Junta classes ignorando o que for falso, para escrever
 * `cn(BASE, isActive && ACTIVE, className)` sem `undefined` no HTML.
 *
 * Não resolve conflito entre utilidades do Tailwind — as primitivas montam as
 * classes a partir de mapas por variante, então dois valores da mesma
 * propriedade nunca se encontram aqui.
 */
export const cn = (...values: readonly ClassValue[]): string =>
  values.filter((value): value is string => Boolean(value)).join(' ');
