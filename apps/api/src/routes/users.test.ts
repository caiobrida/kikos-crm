import { UserList } from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { makeTestHarness, type TestHarness } from '../testing/harness';

/*
 * O contrato de `GET /users` — o time comercial, que alimenta o filtro de
 * responsável da lista de Leads e os `<select>` dos formulários.
 */
describe('GET /users', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await makeTestHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('recusa quem não está logado', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/users' });

    expect(response.statusCode).toBe(401);
  });

  it('devolve só os vendedores com ?role=SELLER', async () => {
    const response = await harness.get('/users?role=SELLER');

    expect(response.statusCode).toBe(200);

    // Decodificar com o Schema compartilhado é a asserção que importa: se a
    // rota e o contrato divergirem, isto falha.
    const users = Schema.decodeUnknownSync(UserList)(response.json());
    expect(users.map((user) => user.name)).toEqual([harness.seller.name]);
  });

  it('devolve o time inteiro sem filtro', async () => {
    const response = await harness.get('/users');

    expect(Schema.decodeUnknownSync(UserList)(response.json())).toHaveLength(2);
  });

  it('não devolve o hash da senha', async () => {
    const response = await harness.get('/users');

    expect(JSON.stringify(response.json())).not.toContain('$2');
  });

  it('recusa um papel fora do vocabulário', async () => {
    const response = await harness.get('/users?role=ESTAGIARIO');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'ValidationFailed' });
  });
});
