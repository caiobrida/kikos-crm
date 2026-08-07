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

/** A hora do dia, com dois dígitos em cada metade. */
const clockOf = (moment: Date): string =>
  moment.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * O momento de um item da linha do tempo.
 *
 * A diferença para `formatLastInteraction` é a hora, e ela não é enfeite: uma
 * coluna de tabela responde "posso ligar de novo?", que se resolve em dias; o
 * histórico de uma negociação responde "o que aconteceu, e nessa ordem?", e dois
 * registros do mesmo dia precisam se distinguir. "hoje" em três itens seguidos
 * não conta história nenhuma.
 *
 * Perto do presente o dia vira palavra e a hora fica; longe dele a data volta
 * inteira, pela mesma razão de sempre — "há 3 semanas às 14:32" é precisão que
 * ninguém pediu.
 */
export const formatMoment = (moment: Date, now: Date = new Date()): string => {
  const days = Math.round((startOfDay(now) - startOfDay(moment)) / DAY_MS);

  if (days <= 0) return `hoje às ${clockOf(moment)}`;
  if (days === 1) return `ontem às ${clockOf(moment)}`;

  return `${moment.toLocaleDateString('pt-BR')} às ${clockOf(moment)}`;
};

/**
 * Uma data de calendário — a prevista de fechamento, a de encerramento.
 *
 * Sem hora, e é de propósito: o campo é um dia informado por quem cadastra, não
 * um instante (ver `OptionalDate` no pacote de domínio). O fuso é fixado em UTC
 * pela mesma razão que o Schema o fixa lá — senão "20/09" apareceria como "19/09"
 * para quem abrisse a tela a oeste de Greenwich.
 */
export const formatDay = (day: Date): string =>
  day.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
