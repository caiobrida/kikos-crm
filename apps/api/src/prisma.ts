import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config';
import { PrismaClient } from './generated/prisma/client';

/**
 * Abre uma conexão com o Postgres.
 *
 * A partir do Prisma 7 o client fala com o banco por um *driver adapter* — aqui
 * o `pg` — em vez de um binário de engine à parte. A URL vem do `.env` único da
 * raiz, o mesmo que o `docker-compose` e o Vite leem.
 */
export const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.databaseUrl }),
  });

export type { PrismaClient };
