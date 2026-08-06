import { HealthResponse } from '@kikos/domain';
import { describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { Layer } from 'effect';
import { DealRepositoryInMemory } from './repositories/DealRepository';
import { LeadRepositoryInMemory } from './repositories/LeadRepository';
import { UserRepositoryInMemory } from './repositories/UserRepository';
import { makeRuntime } from './runtime';
import { buildServer } from './server';

/** `/health` não consulta nada, mas o servidor exige um runtime para montar. */
const buildHealthServer = () =>
  buildServer({
    runtime: makeRuntime(
      Layer.mergeAll(
        UserRepositoryInMemory([]),
        LeadRepositoryInMemory([], []),
        DealRepositoryInMemory([], [], []),
      ),
    ),
    logger: false,
  });

describe('GET /health', () => {
  it('responde 200 no contrato que o pacote de domínio define', async () => {
    const app = buildHealthServer();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);

    // Decodificar com o Schema compartilhado é a asserção que importa: se a
    // rota e o contrato divergirem, isto falha. Repetir os campos à mão só
    // testaria a resposta contra ela mesma.
    const health = Schema.decodeUnknownSync(HealthResponse)(response.json());

    expect(health.status).toBe('ok');
    expect(health.service).toBe('kikos-crm-api');
    expect(health.checkedAt).toBeInstanceOf(Date);

    await app.close();
  });

  it('responde 404 numa rota que não existe', async () => {
    const app = buildHealthServer();

    const response = await app.inject({ method: 'GET', url: '/nao-existe' });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
