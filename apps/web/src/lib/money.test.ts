import { describe, expect, it } from '@effect/vitest';
import { compactBRL, formatBRL, parseBRL } from './money';

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

/*
 * A forma abreviada, que existe para o eixo de um gráfico. Ela orienta a escala;
 * quem responde "quanto exatamente" continua sendo `formatBRL`, no balão do
 * hover e na tabela.
 */
describe('compactBRL', () => {
  it('abrevia o milhar e o milhão com as palavras do português', () => {
    // O espaço antes de "mil" também é o não separável: a unidade não se
    // desgruda do número ao quebrar linha.
    expect(compactBRL(1_250_000)).toBe(`R$${NBSP}12,5${NBSP}mil`);
    expect(compactBRL(156_000_000)).toBe(`R$${NBSP}1,6${NBSP}mi`);
  });

  it('não abrevia o que já é curto', () => {
    expect(compactBRL(32_000)).toBe(`R$${NBSP}320`);
    // A marca do zero é a origem do eixo, e precisa sair sem "0,0".
    expect(compactBRL(0)).toBe(`R$${NBSP}0`);
  });

  it('para numa casa decimal', () => {
    // A segunda casa não muda decisão nenhuma numa marca de eixo, e é onde a
    // abreviação começa a parecer precisão que ela não tem.
    expect(compactBRL(1_234_567)).toBe(`R$${NBSP}12,3${NBSP}mil`);
  });
});

/*
 * O caminho de volta: o que o vendedor digita no campo "Valor estimado" vira o
 * inteiro em centavos que trafega e que o Schema valida. As duas funções são
 * uma dupla — o que `formatBRL` escreve, `parseBRL` precisa saber ler, porque é
 * assim que o campo se comporta quando alguém edita um valor já formatado.
 */
describe('parseBRL', () => {
  it('lê o que o vendedor digita com vírgula e separador de milhar', () => {
    expect(parseBRL('12.500,00')).toBe(1_250_000);
    expect(parseBRL('12500,00')).toBe(1_250_000);
    expect(parseBRL('1.234.567,89')).toBe(123_456_789);
  });

  it('lê um valor redondo, sem centavos escritos', () => {
    // "12500" é doze mil e quinhentos reais, não cento e vinte e cinco reais:
    // quem digita pensa em reais, e o campo mostra reais.
    expect(parseBRL('12500')).toBe(1_250_000);
    expect(parseBRL('0')).toBe(0);
  });

  it('completa os centavos escritos pela metade', () => {
    expect(parseBRL('12500,5')).toBe(1_250_050);
  });

  it('lê de volta o que a tela formatou', () => {
    // O campo mostra o valor formatado; editar e reenviar não pode mudá-lo.
    expect(parseBRL(formatBRL(1_234_567))).toBe(1_234_567);
  });

  it('ignora o símbolo da moeda e os espaços em volta', () => {
    expect(parseBRL(' R$ 12.500,00 ')).toBe(1_250_000);
  });

  it('recusa o que não é valor nenhum', () => {
    // `null` é como o campo diz "não dá para converter"; quem recusa com a
    // frase da tela é o Schema, com o `NaN` que este `null` vira.
    expect(parseBRL('')).toBeNull();
    expect(parseBRL('doze mil')).toBeNull();
    expect(parseBRL('-1')).toBeNull();
    expect(parseBRL('12,345')).toBeNull();
  });

  it('recusa o ponto usado como decimal, que é ambíguo em português', () => {
    // "1.250" é mil duzentos e cinquenta reais, não um real e vinte e cinco:
    // aceitar as duas leituras seria decidir por quem digitou.
    expect(parseBRL('1.250')).toBe(125_000);
    expect(parseBRL('1.25')).toBeNull();
  });
});
