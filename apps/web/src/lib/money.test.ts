import { describe, expect, it } from '@effect/vitest';
import { formatBRL } from './money';

/*
 * O valor viaja em centavos e chega à tela em reais. A conversão é só aqui, na
 * borda que desenha — nenhum cálculo do CRM acontece em ponto flutuante.
 */

/**
 * O espaço **não separável** que o `Intl` põe entre "R$" e o número, escrito
 * pelo código do caractere para não virar um espaço comum invisível no
 * arquivo. Ele é desejado: o símbolo não pode cair sozinho no fim de uma linha
 * de card.
 */
const NBSP = '\u00A0';

describe('formatBRL', () => {
  it('formata centavos como reais, com separador de milhar', () => {
    expect(formatBRL(1_250_000)).toBe(`R$${NBSP}12.500,00`);
  });

  it('mostra os centavos que não são redondos', () => {
    expect(formatBRL(1_234_567)).toBe(`R$${NBSP}12.345,67`);
  });

  it('formata o negócio de valor zero sem inventar traço nem vazio', () => {
    expect(formatBRL(0)).toBe(`R$${NBSP}0,00`);
  });

  it('formata valores grandes sem notação científica nem arredondamento', () => {
    expect(formatBRL(92_000_000)).toBe(`R$${NBSP}920.000,00`);
  });
});
