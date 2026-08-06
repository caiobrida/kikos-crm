import { describe, expect, it } from '@effect/vitest';
import { formatLastInteraction } from './dates';

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
