/*
 * O formatador é criado uma vez, e não a cada chamada: montar um
 * `Intl.NumberFormat` custa (ele resolve locale e regras de moeda), e o board
 * chama isto uma vez por card, a cada vez que uma coluna carrega mais.
 */
const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * O valor de um negócio, como a tela o mostra.
 *
 * **A divisão por cem acontece aqui, e em nenhum outro lugar.** O CRM guarda,
 * transporta e soma valores em centavos inteiros justamente para não acumular
 * erro de ponto flutuante; o único ponto em que o valor vira um número com
 * vírgula é este, na borda que desenha, onde o resultado é uma string.
 */
export const formatBRL = (valueInCents: number): string => BRL.format(valueInCents / 100);
