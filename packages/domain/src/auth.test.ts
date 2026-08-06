import { describe, expect, it } from '@effect/vitest';
import { Either, Schema } from 'effect';
import { LoginRequest } from './auth';

/*
 * O Schema é puro, então vale o `it` comum — sem Layer, sem `it.effect`.
 * `Schema.decodeUnknownEither` é a forma síncrona: devolve um `Either`, que é
 * o `Result` do Rust ou um `{ ok, value } | { ok, error }` escrito à mão.
 */
describe('LoginRequest', () => {
  it('normaliza o e-mail digitado com espaço e caixa alta', () => {
    const decoded = Schema.decodeUnknownSync(LoginRequest)({
      email: '  Rodrigo.Ramos@Kikos.com.br ',
      password: 'kikos123',
    });

    expect(decoded.email).toBe('rodrigo.ramos@kikos.com.br');
  });

  it('recusa um e-mail sem arroba', () => {
    const result = Schema.decodeUnknownEither(LoginRequest)({
      email: 'rodrigo',
      password: 'kikos123',
    });

    expect(Either.isLeft(result)).toBe(true);
  });

  it('recusa senha vazia', () => {
    const result = Schema.decodeUnknownEither(LoginRequest)({
      email: 'rodrigo.ramos@kikos.com.br',
      password: '',
    });

    expect(Either.isLeft(result)).toBe(true);
  });
});
