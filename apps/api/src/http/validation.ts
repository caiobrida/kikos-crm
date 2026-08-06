import { ValidationFailed } from '@kikos/domain';
import { Effect, ParseResult, Schema } from 'effect';

/**
 * Decodifica o corpo da requisição com um Schema do pacote compartilhado, e
 * traduz a recusa em `ValidationFailed`.
 *
 * `ParseResult.ArrayFormatter` achata o erro de parse — que é uma árvore — numa
 * lista de `{ path, message }`. É esse formato que deixa o app web pintar o
 * campo culpado em vez de mostrar um "dados inválidos" genérico.
 */
export const decodeBody = <A, I>(
  schema: Schema.Schema<A, I>,
  body: unknown,
): Effect.Effect<A, ValidationFailed> =>
  Schema.decodeUnknown(schema)(body, { errors: 'all' }).pipe(
    Effect.mapError(
      (parseError) =>
        new ValidationFailed({
          message: 'Confira os campos destacados.',
          issues: ParseResult.ArrayFormatter.formatErrorSync(parseError).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
    ),
  );
