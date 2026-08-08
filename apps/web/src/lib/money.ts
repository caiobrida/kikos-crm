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

/*
 * O mesmo valor abreviado — "R$ 12,5 mil", "R$ 1,6 mi".
 *
 * Existe para o eixo de um gráfico, que é o lugar em que o valor por extenso não
 * cabe: seis marcas de "R$ 12.500.000,00" empilhadas viram uma parede de dígitos
 * que ninguém lê, e encolher a fonte até caber é trocar um problema por outro.
 *
 * `notation: 'compact'` é do próprio `Intl`, então "mil" e "mi" saem do
 * português e não de uma tabela escrita aqui. Uma casa decimal, e não duas:
 * a segunda não muda decisão nenhuma numa marca de eixo, e é onde a abreviação
 * começa a parecer precisão que ela não tem.
 *
 * **Ele nunca substitui o valor exato**: o número por extenso continua no balão
 * do hover e na tabela de negócios. Abreviar é para orientar a leitura da
 * escala, não para esconder o dado.
 */
const BRL_COMPACT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const compactBRL = (valueInCents: number): string =>
  BRL_COMPACT.format(valueInCents / 100);

/**
 * A gramática do valor em português: milhar separado por ponto, centavos por
 * vírgula.
 *
 * O ponto **não** é aceito como decimal, e isso é uma decisão, não um
 * esquecimento: "1.250" é mil duzentos e cinquenta reais para quem digita em
 * português, e ler o mesmo texto como um real e vinte e cinco seria decidir
 * pelo vendedor. Ou o texto segue a gramática daqui, ou o campo diz que não
 * entendeu.
 */
const BRL_INPUT = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * O que o vendedor digitou, em centavos — ou `null` quando não é valor nenhum.
 *
 * É o par de `formatBRL`, e o único outro ponto do app em que reais e centavos
 * se encontram. **A multiplicação por cem acontece aqui, e em nenhum outro
 * lugar**: da borda para dentro, o CRM só conhece inteiros.
 *
 * O `null` é o que o campo entrega ao formulário como `NaN`, para que a recusa
 * seja escrita pelo Schema compartilhado — a mesma frase que a API usaria — em
 * vez de por uma mensagem inventada aqui.
 */
export const parseBRL = (text: string): number | null => {
  // O `\s` do JavaScript inclui o espaço não separável que o `Intl` escreve
  // entre "R$" e o número, então o valor formatado por `formatBRL` volta inteiro.
  const cleaned = text.replace(/\s/g, '').replace(/^R\$/i, '');

  const match = BRL_INPUT.exec(cleaned);
  if (match === null) return null;

  const [, reais = '', cents = ''] = match;

  // "12500,5" são doze mil e quinhentos reais e cinquenta centavos: o campo
  // completa a casa que faltou, em vez de ler cinco centavos.
  return Number(reais.replaceAll('.', '')) * 100 + Number(cents.padEnd(2, '0'));
};
