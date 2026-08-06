import { defineConfig } from 'prisma/config';

/*
 * A configuração do CLI do Prisma. A partir do Prisma 7 ela é obrigatória para
 * os comandos de migration: o CLI não lê mais o `.env` sozinho, então é aqui
 * que o `.env` único da raiz do monorepo entra.
 */
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // Sem `.env` na raiz: o default abaixo mantém os comandos locais funcionando.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `npm run db:seed` também chama este script; ter os dois no mesmo lugar
    // evita que `prisma migrate reset` popule um banco diferente do comando.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env['DATABASE_URL'] ?? 'postgresql://kikos:kikos@localhost:5432/kikos_crm',
  },
});
