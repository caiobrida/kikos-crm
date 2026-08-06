const DAY_MS = 24 * 60 * 60 * 1000;

/** A meia-noite local do dia de uma data, para comparar dias de calendário. */
const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * A última interação, como a coluna da tabela a mostra.
 *
 * Perto do presente a distância importa mais que a data — "há 3 dias" responde
 * "posso ligar de novo?" melhor que "17/05/2026". Longe dela a distância perde
 * a graça, e a data volta a ser o dado útil.
 *
 * O `agora` entra por parâmetro em vez de sair de um `new Date()` interno: é o
 * que deixa a função pura e testável sem congelar o relógio do processo.
 */
export const formatLastInteraction = (moment: Date, now: Date = new Date()): string => {
  const days = Math.round((startOfDay(now) - startOfDay(moment)) / DAY_MS);

  // Um relógio de servidor alguns minutos adiantado não deve virar "há -1 dias".
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;

  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'há 1 semana' : `há ${weeks} semanas`;
  }

  return moment.toLocaleDateString('pt-BR');
};
