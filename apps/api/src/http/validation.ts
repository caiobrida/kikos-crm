import { ValidationFailed } from '@kikos/domain';
import { Effect, ParseResult, Schema } from 'effect';

/**
 * Decodifica uma entrada da requisição com um Schema do pacote compartilhado, e
 * traduz a recusa em `ValidationFailed`.
 *
 * `ParseResult.ArrayFormatter` achata o erro de parse — que é uma árvore — numa
 * lista de `{ path, message }`. É esse formato que deixa o app web pintar o
 * campo culpado em vez de mostrar um "dados inválidos" genérico.
 */
const decodeInput = <A, I>(
  schema: Schema.Schema<A, I>,
  input: unknown,
  message: string,
): Effect.Effect<A, ValidationFailed> =>
  Schema.decodeUnknown(schema)(input, { errors: 'all' }).pipe(
    Effect.mapError(
      (parseError) =>
        new ValidationFailed({
          message,
          issues: ParseResult.ArrayFormatter.formatErrorSync(parseError).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
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
