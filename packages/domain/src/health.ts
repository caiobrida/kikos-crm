import { Schema } from 'effect';

/**
 * O contrato de `GET /health`.
 *
 * `Schema.Struct` descreve um objeto. O interessante aqui é o `checkedAt`:
 * `Schema.DateFromString` é uma *transformação*, então o Schema tem dois lados.
 * O lado codificado (`Encoded`) é o que trafega no JSON — uma string ISO. O
 * lado decodificado (`Type`) é o que o código manipula — um `Date`. A API
 * codifica na saída, o navegador decodifica na entrada, e a conversão nunca
 * é escrita à mão nos dois lugares.
 *
 * Este é também o menor exemplo possível do porquê de existir um pacote
 * compartilhado: uma definição só, importada pelos dois apps.
 */
export const HealthResponse = Schema.Struct({
  status: Schema.Literal('ok'),
  service: Schema.String,
  checkedAt: Schema.DateFromString,
});

/** O lado decodificado: `checkedAt` é `Date`. É o que a aplicação usa. */
export type HealthResponse = typeof HealthResponse.Type;

/** O lado codificado: `checkedAt` é `string`. É o que viaja no JSON. */
export type HealthResponseEncoded = typeof HealthResponse.Encoded;
