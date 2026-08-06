/*
 * Configuração da API, lida do `.env` único da raiz do monorepo.
 *
 * `process.loadEnvFile` é do próprio Node — não há dependência de dotenv aqui.
 * Ele estoura se o arquivo não existir, e isso é aceitável: os defaults abaixo
 * mantêm `npm run dev` funcionando numa máquina recém-clonada, antes de alguém
 * copiar o `.env.example`.
 */
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Sem `.env` na raiz: seguimos com os defaults de desenvolvimento.
}

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const nodeEnv = process.env['NODE_ENV'] ?? 'development';
const isProduction = nodeEnv === 'production';

/*
 * O segredo que assina os tokens. Em desenvolvimento e nos testes um default
 * mantém tudo rodando sem configuração; em produção seguir com um segredo
 * público seria uma falha silenciosa, então o boot é interrompido.
 */
const jwtSecret = process.env['JWT_SECRET'] ?? 'kikos-crm-desenvolvimento-apenas';
if (isProduction && process.env['JWT_SECRET'] === undefined) {
  throw new Error('JWT_SECRET é obrigatório quando NODE_ENV=production.');
}

export const config = {
  port: numberFromEnv(process.env['API_PORT'], 3333),
  host: process.env['API_HOST'] ?? '127.0.0.1',
  nodeEnv,
  isProduction,
  /** Identifica a API na resposta de `/health`. */
  serviceName: 'kikos-crm-api',

  databaseUrl:
    process.env['DATABASE_URL'] ?? 'postgresql://kikos:kikos@localhost:5432/kikos_crm',

  auth: {
    jwtSecret,
    /** Curto de propósito: o refresh renova em silêncio (ADR-0004). */
    accessTokenTtlSeconds: numberFromEnv(
      process.env['ACCESS_TOKEN_TTL_SECONDS'],
      15 * 60,
    ),
    refreshTokenTtlSeconds: numberFromEnv(
      process.env['REFRESH_TOKEN_TTL_SECONDS'],
      7 * 24 * 60 * 60,
    ),
    /**
     * O caminho do cookie de refresh, restrito à rota que o consome.
     *
     * O default é `/api/auth/refresh`, e não `/auth/refresh`, porque o `path`
     * de um cookie é comparado contra a URL que o *navegador* pede — e em
     * desenvolvimento o navegador pede ao Vite, que proxia `/api` para cá.
     * Quem servir o app web de outro jeito ajusta esta variável.
     */
    refreshCookiePath: process.env['REFRESH_COOKIE_PATH'] ?? '/api/auth/refresh',
    /** Custo do bcrypt. Baixo nos testes, para não somar segundos por login. */
    bcryptRounds: numberFromEnv(
      process.env['BCRYPT_ROUNDS'],
      nodeEnv === 'test' ? 4 : 10,
    ),
  },
} as const;
