import { describe, expect, it } from '@effect/vitest';
import { formatDay, formatLastInteraction, formatMoment } from './dates';

/*
 * O "agora" entra por parâmetro, e não sai de `new Date()` lá dentro. É o que
 * torna a função pura — e testável sem congelar o relógio do processo.
 */
const NOW = new Date('2026-05-20T15:00:00');

describe('formatLastInteraction', () => {
  it('diz "hoje" para qualquer hora do mesmo dia', () => {
    // A conta é em dias de calendário, não em intervalos de 24 horas: às 8h da
    // manhã, algo de ontem às 23h não é "há 9 horas", é "ontem".
    expect(formatLastInteraction(new Date('2026-05-20T00:30:00'), NOW)).toBe('hoje');
  });

  it('diz "ontem" para o dia anterior', () => {
    expect(formatLastInteraction(new Date('2026-05-19T23:50:00'), NOW)).toBe('ontem');
  });

  it('conta em dias dentro da semana', () => {
    expect(formatLastInteraction(new Date('2026-05-17T10:00:00'), NOW)).toBe('há 3 dias');
  });

  it('passa a contar em semanas depois de sete dias', () => {
    expect(formatLastInteraction(new Date('2026-05-12T10:00:00'), NOW)).toBe(
      'há 1 semana',
    );
    expect(formatLastInteraction(new Date('2026-04-29T10:00:00'), NOW)).toBe(
      'há 3 semanas',
    );
  });

  it('mostra a data cheia quando o contato esfriou de vez', () => {
    expect(formatLastInteraction(new Date('2026-02-10T10:00:00'), NOW)).toBe(
      '10/02/2026',
    );
  });

  it('não diz "há -1 dias" se o relógio do servidor estiver adiantado', () => {
    expect(formatLastInteraction(new Date('2026-05-21T10:00:00'), NOW)).toBe('hoje');
  });
});

/*
 * A linha do tempo precisa da hora, e a coluna da tabela não. É a diferença
 * entre "o que aconteceu, e nessa ordem?" e "posso ligar de novo?".
 */
describe('formatMoment', () => {
  it('mantém a hora no dia de hoje, para distinguir dois registros seguidos', () => {
    expect(formatMoment(new Date('2026-05-20T09:05:00'), NOW)).toBe('hoje às 09:05');
    expect(formatMoment(new Date('2026-05-20T14:32:00'), NOW)).toBe('hoje às 14:32');
  });

  it('diz "ontem" com a hora', () => {
    expect(formatMoment(new Date('2026-05-19T23:50:00'), NOW)).toBe('ontem às 23:50');
  });

  it('volta à data cheia a partir de anteontem', () => {
    // Sem "há 3 dias" aqui: contar dias e mostrar hora ao mesmo tempo daria
    // "há 3 dias às 10:00", precisão que ninguém pediu.
    expect(formatMoment(new Date('2026-05-17T10:00:00'), NOW)).toBe(
      '17/05/2026 às 10:00',
    );
  });

  it('não diz "amanhã" se o relógio do servidor estiver adiantado', () => {
    expect(formatMoment(new Date('2026-05-21T10:00:00'), NOW)).toBe('hoje às 10:00');
  });
});

describe('formatDay', () => {
  it('mostra o dia do calendário sem deslocar pelo fuso', () => {
    /*
     * A data prevista de fechamento é gravada à meia-noite UTC (ver
     * `OptionalDate` no pacote de domínio). Lida no fuso local, ela viraria o
     * dia anterior a oeste de Greenwich — que é exatamente o bug que este teste
     * existe para travar.
     */
    expect(formatDay(new Date('2026-09-20T00:00:00.000Z'))).toBe('20/09/2026');
  });
});
