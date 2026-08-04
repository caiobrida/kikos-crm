import { describe, expect, it } from '@effect/vitest';
import { Either, Schema } from 'effect';
import { DEAL_STAGES, DealStage, LeadStatus, OPEN_DEAL_STAGES } from './enums';

/*
 * Enums não têm efeito nenhum, então são testados com o `it` comum — sem
 * Layer, sem `it.effect`. `Schema.decodeUnknownEither` devolve um `Either`
 * em vez de um Effect: é a forma síncrona, e o `Either` é o `Result` do Rust
 * ou um `{ ok, value } | { ok, error }` escrito à mão.
 */
describe('DealStage', () => {
  it('aceita os cinco Stages do Pipeline', () => {
    for (const stage of DEAL_STAGES) {
      expect(Either.isRight(Schema.decodeUnknownEither(DealStage)(stage))).toBe(true);
    }
  });

  it('recusa um Stage que não existe', () => {
    expect(Either.isLeft(Schema.decodeUnknownEither(DealStage)('PAUSED'))).toBe(true);
  });

  it('deixa CLOSED fora dos Stages abertos, porque não é destino de movimentação', () => {
    expect(OPEN_DEAL_STAGES).not.toContain('CLOSED');
    expect(DEAL_STAGES.at(-1)).toBe('CLOSED');
  });
});

describe('LeadStatus', () => {
  it('é vocabulário distinto do Stage do Deal', () => {
    // CONTACT_MADE é Stage; CONTACT é Status de Lead. Trocar um pelo outro é
    // o erro que este teste existe para pegar.
    expect(Either.isLeft(Schema.decodeUnknownEither(LeadStatus)('CONTACT_MADE'))).toBe(
      true,
    );
    expect(Either.isRight(Schema.decodeUnknownEither(LeadStatus)('CONTACT'))).toBe(true);
  });
});
