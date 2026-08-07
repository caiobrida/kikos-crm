import { ValidationFailed, toValidationIssues } from '@kikos/domain';
import { Effect, Schema } from 'effect';

/**
 * Decodifica uma entrada da requisição com um Schema do pacote compartilhado, e
 * traduz a recusa em `ValidationFailed`.
 *
 * `errors: 'all'` junta todas as queixas numa recusa só — a tela pinta os
 * campos errados de uma vez, em vez de revelar o próximo erro a cada tentativa.
 * Quem as achata numa lista de `{ path, message }` é `toValidationIssues`, do
 * pacote compartilhado, para que o formato da recusa seja um só nos dois lados.
 */
const decodeInput = <A, I>(
  schema: Schema.Schema<A, I>,
  input: unknown,
  message: string,
): Effect.Effect<A, ValidationFailed> =>
  Schema.decodeUnknown(schema)(input, { errors: 'all' }).pipe(
    Effect.mapError(
      (parseError) =>
        new ValidationFailed({ message, issues: toValidationIssues(parseError) }),
    ),
  );

/** O corpo de um `POST` ou `PUT`, que espelha um formulário da tela. */
export const decodeBody = <A, I>(
  schema: Schema.Schema<A, I>,
  body: unknown,
): Effect.Effect<A, ValidationFailed> =>
  decodeInput(schema, body, 'Confira os campos destacados.');

/**
 * A query string de uma listagem.
 *
 * Tudo chega como texto — `?page=2` é a string `"2"` —, e é o Schema que
 * converte, confere a faixa e preenche os defaults. O ganho não é só de
 * conveniência: `sortBy` e `status` são uniões fechadas, então nada do que
 * alguém digitar na URL chega perto de virar coluna num `ORDER BY`.
 */
export const decodeQuery = <A, I>(
  schema: Schema.Schema<A, I>,
  query: unknown,
): Effect.Effect<A, ValidationFailed> =>
  decodeInput(schema, query, 'Confira os parâmetros da consulta.');

/**
 * Os parâmetros do caminho — o `:id` de `/deals/:id/stage`.
 *
 * Passam pelo mesmo caminho da query string, e não por um `as` calado, porque o
 * `id` que chega na URL é texto vindo de fora: é o Schema que confere o formato
 * de UUID e devolve o identificador **com marca**, que é o único jeito de
 * produzir um `DealId` (ver `ids.ts`). Um identificador malformado vira 400 com
 * o campo apontado, em vez de virar consulta ao banco.
 */
export const decodeParams = <A, I>(
  schema: Schema.Schema<A, I>,
  params: unknown,
): Effect.Effect<A, ValidationFailed> =>
  decodeInput(schema, params, 'Confira o endereço da requisição.');
