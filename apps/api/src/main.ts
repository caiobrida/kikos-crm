import { config } from './config';
import { buildServer } from './server';

const app = buildServer();

/*
 * Encerramento limpo: quando as Layers de repositório e de runtime entrarem
 * (ver ADR-0002), é daqui que o `ManagedRuntime` será descartado.
 */
const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'encerrando a API');
  await app.close();
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
  process.exit(1);
}
