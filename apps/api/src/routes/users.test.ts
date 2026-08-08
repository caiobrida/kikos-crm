import { UserList, UserWorkloadList } from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import {
  leadsOwnedBy,
  makeTestHarness,
  openDealsOwnedBy,
  OPEN_DEAL_TITLE,
  type TestHarness,
} from '../testing/harness';

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

/*
 * O contrato de `GET /users/workload` — a mesma lista de `GET /users`, com as
 * duas contagens que a tela de Vendedores mostra em cada linha.
 *
 * O que estes testes cobram não é a aritmética: é que os números batam com o que
 * a lista de Leads e o board mostram para a mesma pessoa. Daí as asserções
 * saírem das fixtures, e não de constantes escritas à mão.
 */
describe('GET /users/workload', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await makeTestHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('recusa quem não está logado', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/users/workload',
    });

    expect(response.statusCode).toBe(401);
  });

  it('devolve só os vendedores com ?role=SELLER, com a carga de cada um', async () => {
    const response = await harness.get('/users/workload?role=SELLER');

    expect(response.statusCode).toBe(200);

    // Decodificar com o Schema compartilhado é a asserção que importa: se a
    // rota e o contrato divergirem, isto falha.
    const team = Schema.decodeUnknownSync(UserWorkloadList)(response.json());

    expect(team).toEqual([
      {
        user: {
          id: harness.seller.id,
          name: harness.seller.name,
          email: harness.seller.email,
          role: 'SELLER',
        },
        leadCount: leadsOwnedBy('seller'),
        openDealCount: openDealsOwnedBy('seller'),
      },
    ]);
  });

  it('não conta o contato nem o negócio removidos', async () => {
    // Os dois registros removidos da fixture são do gestor, então é a linha
    // dele que denuncia um filtro de remoção lógica esquecido.
    const response = await harness.get('/users/workload');

    const team = Schema.decodeUnknownSync(UserWorkloadList)(response.json());
    const manager = team.find((row) => row.user.id === harness.manager.id);

    expect(manager).toMatchObject({
      leadCount: leadsOwnedBy('manager'),
      openDealCount: openDealsOwnedBy('manager'),
    });
  });

  it('não conta como em aberto o negócio que acabou de ser encerrado', async () => {
    const deal = harness.deals.find((candidate) => candidate.title === OPEN_DEAL_TITLE);

    const closed = await harness.post(`/deals/${deal?.id}/close`, { result: 'WON' });
    expect(closed.statusCode).toBe(200);

    const response = await harness.get('/users/workload?role=SELLER');
    const [seller] = Schema.decodeUnknownSync(UserWorkloadList)(response.json());

    expect(seller?.openDealCount).toBe(openDealsOwnedBy('seller') - 1);
    // A carteira não muda: encerrar um negócio não remove o contato dele.
    expect(seller?.leadCount).toBe(leadsOwnedBy('seller'));
  });

  it('não devolve o hash da senha', async () => {
    const response = await harness.get('/users/workload');

    expect(JSON.stringify(response.json())).not.toContain('$2');
  });

  it('recusa um papel fora do vocabulário', async () => {
    const response = await harness.get('/users/workload?role=ESTAGIARIO');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'ValidationFailed' });
  });
});
