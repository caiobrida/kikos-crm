import type { UserId } from '@kikos/domain';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config';

/*
 * Os tokens de sessão, assinados com HS256.
 *
 * `jose` em vez de `jsonwebtoken`: é ESM puro, sem dependência nativa, e usa a
 * WebCrypto que o Node já traz.
 *
 * O payload carrega o `tokenVersion` do User. Ele é o que dá cancelamento real
 * a um JWT — que é stateless por natureza — sem criar tabela de sessão: o
 * logout incrementa a coluna, e todo token assinado com a versão anterior
 * deixa de valer na próxima requisição (ADR-0004).
 */

const secret = new TextEncoder().encode(config.auth.jwtSecret);

/**
 * Os dois tokens são assinados com o mesmo segredo, então o tipo precisa
 * viajar dentro do payload: sem isso um token de refresh — que vale 7 dias —
 * seria aceito como access.
 */
export type TokenKind = 'access' | 'refresh';

export interface SessionClaims {
  readonly userId: UserId;
  readonly tokenVersion: number;
  readonly kind: TokenKind;
}

/** A validade de cada tipo, usada tanto no `exp` do token quanto no cookie. */
export const TOKEN_TTL_SECONDS: Record<TokenKind, number> = {
  access: config.auth.accessTokenTtlSeconds,
  refresh: config.auth.refreshTokenTtlSeconds,
};

export const signToken = async (claims: SessionClaims): Promise<string> => {
  const nowInSeconds = Math.floor(Date.now() / 1000);

  return new SignJWT({ tokenVersion: claims.tokenVersion, kind: claims.kind })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt(nowInSeconds)
    .setExpirationTime(nowInSeconds + TOKEN_TTL_SECONDS[claims.kind])
    .sign(secret);
};

/**
 * Verifica assinatura, validade e tipo do token.
 *
 * Devolve `null` para qualquer recusa — assinatura inválida, expirado,
 * malformado, ou do tipo errado. Distinguir os motivos para quem chama seria
 * dizer a um atacante em que ponto ele errou, e todos levam ao mesmo 401.
 */
export const verifyToken = async (
  token: string,
  expectedKind: TokenKind,
): Promise<SessionClaims | null> => {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });

    const { sub, tokenVersion, kind } = payload;
    if (typeof sub !== 'string') return null;
    if (typeof tokenVersion !== 'number') return null;
    if (kind !== expectedKind) return null;

    return { userId: sub as UserId, tokenVersion, kind: expectedKind };
  } catch {
    return null;
  }
};
