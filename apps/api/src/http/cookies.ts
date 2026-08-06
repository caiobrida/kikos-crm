import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';
import { TOKEN_TTL_SECONDS, signToken } from '../auth/tokens';
import { config } from '../config';
import type { UserRecord } from '../repositories/UserRepository';

/*
 * Os cookies de sessão.
 *
 * `httpOnly` é o ponto todo: o JavaScript da página não os enxerga, ao
 * contrário do que aconteceria com o token guardado em `localStorage`. E como o
 * Vite proxia `/api` para a API, navegador e servidor ficam na mesma origem —
 * não há CORS com credenciais nem `SameSite=None` (ADR-0004).
 */

export const ACCESS_COOKIE = 'kikos_access';
export const REFRESH_COOKIE = 'kikos_refresh';

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax',
  /** Só exigimos HTTPS em produção; em desenvolvimento o app roda em http. */
  secure: config.isProduction,
} as const satisfies CookieSerializeOptions;

const accessOptions: CookieSerializeOptions = {
  ...baseOptions,
  path: '/',
  maxAge: TOKEN_TTL_SECONDS.access,
};

/**
 * O refresh só é enviado para a rota que o consome. Um cookie a menos viajando
 * em toda requisição é uma superfície a menos.
 */
const refreshOptions: CookieSerializeOptions = {
  ...baseOptions,
  path: config.auth.refreshCookiePath,
  maxAge: TOKEN_TTL_SECONDS.refresh,
};

/** O token curto, reemitido a cada renovação silenciosa. */
export const issueAccessCookie = async (
  reply: FastifyReply,
  user: UserRecord,
): Promise<void> => {
  const accessToken = await signToken({
    userId: user.id,
    tokenVersion: user.tokenVersion,
    kind: 'access',
  });

  reply.setCookie(ACCESS_COOKIE, accessToken, accessOptions);
};

/**
 * Abre a sessão: os dois tokens, assinados com a `tokenVersion` atual.
 *
 * Só o login passa por aqui. A renovação reemite apenas o access, de modo que
 * os 7 dias do refresh contam a partir da senha digitada — e não deslizam para
 * sempre a cada renovação, o que faria a validade do ADR-0004 nunca vencer.
 */
export const issueSessionCookies = async (
  reply: FastifyReply,
  user: UserRecord,
): Promise<void> => {
  const refreshToken = await signToken({
    userId: user.id,
    tokenVersion: user.tokenVersion,
    kind: 'refresh',
  });

  await issueAccessCookie(reply, user);
  reply.setCookie(REFRESH_COOKIE, refreshToken, refreshOptions);
};

/**
 * Apaga os dois cookies. O `path` precisa ser o mesmo com que foram gravados,
 * senão o navegador entende que são outros cookies e mantém os originais.
 */
export const clearSessionCookies = (reply: FastifyReply): void => {
  reply.clearCookie(ACCESS_COOKIE, { path: accessOptions.path ?? '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: refreshOptions.path ?? '/' });
};
