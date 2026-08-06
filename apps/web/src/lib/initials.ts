/*
 * Partículas que não viram inicial: "Maria da Silva" é MS, não MD.
 */
const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

/**
 * As iniciais mostradas no avatar de um User.
 *
 * Primeiro e último nome relevantes; um nome só vira as duas primeiras letras;
 * entrada vazia vira `?`, para que a lista nunca mostre um círculo mudo.
 */
export const initialsFromName = (name: string): string => {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !PARTICLES.has(word.toLowerCase()));

  const first = words.at(0);
  if (first === undefined) return '?';

  const last = words.length > 1 ? words.at(-1) : undefined;
  const initials = last === undefined ? first.slice(0, 2) : `${first[0]}${last[0]}`;

  return initials.toUpperCase();
};
