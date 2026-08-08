import { Schema } from 'effect';

/*
 * O dinheiro do CRM, em centavos.
 *
 * **Valores monetários são inteiros em centavos, nunca ponto flutuante.** Duas
 * razões concretas, as duas já vividas por quem escreveu isto:
 *
 * 1. `0.1 + 0.2` não é `0.3` em ponto flutuante — somar o funil inteiro para o
 *    dashboard acumularia centavos de erro;
 * 2. o `Decimal` do Prisma resolveria a primeira, mas atravessa o JSON como
 *    string e obrigaria o Schema a transformar de novo dos dois lados.
 *
 * Um inteiro em centavos não tem nenhum dos dois problemas: soma exata no banco,
 * número comum no JSON. A formatação em reais é assunto da tela, e mora no app
 * web junto dos outros rótulos em português.
 */

/**
 * O teto de um valor: dez milhões de reais.
 *
 * Não é um número inventado para parecer generoso — é o que mantém a coluna
 * dentro de um inteiro de 32 bits no Postgres (que vai até R$ 21.474.836,47),
 * com folga suficiente para que o limite nunca seja o do banco, e sim este, que
 * sabe explicar a recusa em português.
 */
const MAX_VALUE_IN_CENTS = 1_000_000_000;

/**
 * Um valor monetário como o domínio o guarda: centavos, inteiros, não negativos.
 *
 * As três recusas falam português porque este Schema é também o campo "Valor
 * estimado" do cadastro de negócio, e a frase aparece embaixo dele. A primeira
 * é a que mais aparece na tela: o campo de dinheiro entrega centavos inteiros
 * ou `NaN`, e `NaN` é como ele diz "está em branco, ou tem texto que não é
 * valor nenhum". O exemplo é escrito em reais porque é o que o vendedor digita.
 */
export const ValueInCents = Schema.Number.pipe(
  Schema.int({ message: () => 'Informe um valor válido, como 12.500,00.' }),
  Schema.greaterThanOrEqualTo(0, {
    message: () => 'O valor não pode ser negativo.',
    identifier: 'ValueInCents',
  }),
  Schema.lessThanOrEqualTo(MAX_VALUE_IN_CENTS, {
    message: () => 'O valor máximo é R$ 10.000.000,00.',
  }),
);

export type ValueInCents = typeof ValueInCents.Type;

/**
 * A **soma** de vários valores, em centavos.
 *
 * Distinto de `ValueInCents` por causa do teto, e só por causa dele: o limite de
 * R$ 10.000.000,00 é o de um negócio que alguém cadastra, não o de uma coluna do
 * funil inteira. Somar dez negócios no teto passaria dele sem que nada de errado
 * tivesse acontecido, e um Schema que recusasse a soma faria o dashboard falhar
 * exatamente na empresa em que ele mais teria o que dizer.
 *
 * O que continua valendo é o resto: inteiro, em centavos, não negativo. Ele não
 * valida entrada nenhuma — nunca chega num corpo de requisição —, mas é o mesmo
 * Schema nas duas pontas de `GET /dashboard/summary`, como todo o resto do
 * contrato.
 */
export const TotalInCents = Schema.Int.pipe(Schema.greaterThanOrEqualTo(0));

export type TotalInCents = typeof TotalInCents.Type;
