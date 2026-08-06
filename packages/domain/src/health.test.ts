import { describe, expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { HealthResponse } from './health';

/*
 * Estes são os primeiros testes do projeto e estabelecem a forma dos próximos:
 * `@effect/vitest`, `it.effect` para o que devolve Effect, e `expect` normal
 * para a asserção. `it.effect` recebe um Effect e o executa por você — é o
 * equivalente ao `async/await` que o `it` comum já faz com Promise.
 */
describe('HealthResponse', () => {
  it.effect('decodifica a data que veio como string ISO num Date', () =>
    Effect.gen(function* () {
      // `Effect.gen` + `yield*` é o `async`/`await` do Effect: cada `yield*`
      // desembrulha um Effect que pode falhar, e a falha interrompe o bloco.
      const health = yield* Schema.decodeUnknown(HealthResponse)({
        status: 'ok',
        service: 'kikos-crm-api',
        checkedAt: '2026-08-04T12:00:00.000Z',
      });

      expect(health.checkedAt).toBeInstanceOf(Date);
      expect(health.checkedAt.toISOString()).toBe('2026-08-04T12:00:00.000Z');
    }),
  );

  it.effect('codifica o Date de volta para a string ISO que trafega no JSON', () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encode(HealthResponse)({
        status: 'ok',
        service: 'kikos-crm-api',
        checkedAt: new Date('2026-08-04T12:00:00.000Z'),
      });

      expect(encoded.checkedAt).toBe('2026-08-04T12:00:00.000Z');
    }),
  );

  it.effect('recusa um status fora do contrato', () =>
    Effect.gen(function* () {
      // `Effect.flip` troca sucesso e falha de lado, que é como se afirma
      // sobre o erro sem `try/catch`.
      const error = yield* Effect.flip(
        Schema.decodeUnknown(HealthResponse)({
          status: 'degraded',
          service: 'kikos-crm-api',
          checkedAt: '2026-08-04T12:00:00.000Z',
        }),
      );

      expect(error._tag).toBe('ParseError');
    }),
  );
});
