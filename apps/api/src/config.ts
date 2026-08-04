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

export const config = {
  port: numberFromEnv(process.env['API_PORT'], 3333),
  host: process.env['API_HOST'] ?? '127.0.0.1',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  /** Identifica a API na resposta de `/health`. */
  serviceName: 'kikos-crm-api',
} as const;
