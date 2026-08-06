import { config } from './config';
import { AppLayerLive, makeRuntime } from './runtime';
import { buildServer } from './server';

/*
 * O ponto de entrada. O `ManagedRuntime` é construído **uma vez** aqui, no
 * boot: é ele que abre a conexão com o Postgres e a mantém pelo processo
 * inteiro (ADR-0002).
 */
const runtime = makeRuntime(AppLayerLive);
const app = buildServer({ runtime });

/**
 * Encerramento limpo. `runtime.dispose()` executa os finalizadores das Layers
 * — no caso, o `$disconnect` do Prisma — na ordem inversa da construção. É a
 * contrapartida do `acquireRelease` lá no repositório.
 */
const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'encerrando a API');
  await app.close();
  await runtime.dispose();
  process.exit(0);
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error, 'a API não conseguiu subir');
  await runtime.dispose();
  process.exit(1);
}
