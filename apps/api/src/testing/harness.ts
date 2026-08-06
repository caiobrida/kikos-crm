import { LeadId, UserId, type LeadStatus } from '@kikos/domain';
import { Layer, Schema } from 'effect';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { ACCESS_COOKIE } from '../http/cookies';
import { LeadRepositoryInMemory, type LeadRecord } from '../repositories/LeadRepository';
import { UserRepositoryInMemory, type UserRecord } from '../repositories/UserRepository';
import { makeRuntime } from '../runtime';
import { buildServer } from '../server';

/*
 * A montagem de um servidor de teste.
 *
 * O único duble são as Layers em memória dos repositórios — abaixo delas roda
 * tudo: as rotas do Fastify, a validação de Schema, o bcrypt de verdade, o JWT
 * de verdade, o middleware de autenticação e o mapa de erro para HTTP. É por
 * isso que estes testes não precisam de Postgres.
 */

export const TEST_PASSWORD = 'kikos123';

/**
 * `Schema.decodeSync(UserId)` é a única forma de produzir um `UserId`: a marca
 * do Schema não deixa passar uma string qualquer. De quebra, um UUID inválido
 * estoura aqui, e não numa asserção obscura lá na frente.
 */
const newUserId = (): UserId => Schema.decodeSync(UserId)(randomUUID());
const newLeadId = (): LeadId => Schema.decodeSync(LeadId)(randomUUID());

/*
 * A carteira de contatos dos testes.
 *
 * Não é uma amostra qualquer: cada linha existe para tornar uma consulta
 * verificável. Duas empresas repetem o nome (busca por empresa devolve duas),
 * dois e-mails compartilham o domínio (busca por e-mail devolve duas), os cinco
 * status aparecem, os dois responsáveis dividem a lista, as datas de última
 * interação são distintas e decrescentes, e a última linha nasce removida — a
 * que nenhuma consulta pode devolver.
 *
 * São sete visíveis: o suficiente para três páginas de tamanho três, com a
 * terceira incompleta.
 */
interface LeadFixture {
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly status: LeadStatus;
  readonly owner: 'manager' | 'seller';
  readonly lastInteractionAt: string;
  readonly deleted?: true;
}

const LEAD_FIXTURES: readonly LeadFixture[] = [
  {
    name: 'Ana Beatriz Souza',
    company: 'Studio Corpo Livre',
    email: 'ana.souza@corpolivre.com.br',
    status: 'NEW',
    owner: 'seller',
    lastInteractionAt: '2026-05-08T12:00:00.000Z',
  },
  {
    name: 'Bruno Carvalho',
    company: 'Academia Ritmo',
    email: 'bruno.carvalho@ritmo.com.br',
    status: 'CONTACT',
    owner: 'manager',
    lastInteractionAt: '2026-05-07T12:00:00.000Z',
  },
  {
    name: 'Carla Dias',
    company: 'Rede Vital Fitness',
    email: 'carla.dias@vitalfitness.com.br',
    status: 'NEGOTIATION',
    owner: 'seller',
    lastInteractionAt: '2026-05-06T12:00:00.000Z',
  },
  {
    name: 'Daniel Esteves',
    company: 'CrossBox Zona Sul',
    email: 'daniel.esteves@crossboxzs.com.br',
    status: 'WON',
    owner: 'manager',
    lastInteractionAt: '2026-05-05T12:00:00.000Z',
  },
  {
    name: 'Eduarda Farias',
    company: 'Studio Pilates Aurora',
    email: 'eduarda.farias@aurorapilates.com.br',
    status: 'LOST',
    owner: 'seller',
    lastInteractionAt: '2026-05-04T12:00:00.000Z',
  },
  {
    name: 'Fabio Gomes',
    company: 'Academia Ritmo',
    email: 'fabio.gomes@ritmo.com.br',
    status: 'NEW',
    owner: 'manager',
    lastInteractionAt: '2026-05-03T12:00:00.000Z',
  },
  {
    name: 'Gabriela Horta',
    company: 'Vital Fitness Norte',
    email: 'gabriela.horta@vitalfitness.com.br',
    status: 'CONTACT',
    owner: 'seller',
    lastInteractionAt: '2026-05-02T12:00:00.000Z',
  },
  {
    name: 'Heitor Ipanema',
    company: 'Academia Removida',
    email: 'heitor.ipanema@removida.com.br',
    status: 'NEW',
    owner: 'manager',
    lastInteractionAt: '2026-05-01T12:00:00.000Z',
    deleted: true,
  },
];

/** O nome do único Lead removido: nenhuma consulta pode devolvê-lo. */
export const DELETED_LEAD_NAME = 'Heitor Ipanema';

/** Quantos Leads uma consulta sem filtro devolve. */
export const VISIBLE_LEAD_COUNT = LEAD_FIXTURES.filter(
  (fixture) => fixture.deleted !== true,
).length;

const makeLeads = (manager: UserRecord, seller: UserRecord): readonly LeadRecord[] =>
  LEAD_FIXTURES.map((fixture, index) => ({
    id: newLeadId(),
    name: fixture.name,
    company: fixture.company,
    email: fixture.email,
    phone: `+55 11 9${String(index).padStart(4, '0')}-1000`,
    jobTitle: null,
    source: 'WEBSITE',
    status: fixture.status,
    ownerId: fixture.owner === 'manager' ? manager.id : seller.id,
    notes: null,
    lastInteractionAt: new Date(fixture.lastInteractionAt),
    deletedAt: fixture.deleted === true ? new Date('2026-05-09T12:00:00.000Z') : null,
  }));

export interface TestHarness {
  readonly app: FastifyInstance;
  readonly manager: UserRecord;
  readonly seller: UserRecord;
  /**
   * Um GET já autenticado como o gestor — o caminho normal de toda tela do CRM.
   * A sessão é aberta uma vez na montagem, para não pagar um bcrypt por teste.
   */
  readonly get: (url: string) => Promise<LightMyRequestResponse>;
  readonly close: () => Promise<void>;
}

export const makeTestHarness = async (): Promise<TestHarness> => {
  // Um hash só, reaproveitado: bcrypt é lento de propósito, e cada chamada a
  // mais aparece no tempo da suíte.
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const manager: UserRecord = {
    id: newUserId(),
    name: 'Rodrigo Ramos',
    email: 'rodrigo.ramos@kikos.com.br',
    passwordHash,
    role: 'MANAGER',
    tokenVersion: 0,
  };

  const seller: UserRecord = {
    id: newUserId(),
    name: 'Ana Paula Nogueira',
    email: 'ana.nogueira@kikos.com.br',
    passwordHash,
    role: 'SELLER',
    tokenVersion: 0,
  };

  const users = [manager, seller];
  const leads = makeLeads(manager, seller);

  /*
   * `Layer.mergeAll` compõe os repositórios do mesmo jeito que a produção
   * compõe os de Prisma. A Layer de Lead recebe os Users porque a listagem
   * devolve o responsável resolvido — é o `JOIN` do SQL, feito à mão.
   */
  const runtime = makeRuntime(
    Layer.mergeAll(UserRepositoryInMemory(users), LeadRepositoryInMemory(leads, users)),
  );

  const app = buildServer({ runtime, logger: false });
  await app.ready();

  const session = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: manager.email, password: TEST_PASSWORD },
  });
  const accessToken = cookieValue(session.cookies, ACCESS_COOKIE) ?? '';

  return {
    app,
    manager,
    seller,
    get: (url) =>
      app.inject({ method: 'GET', url, cookies: { [ACCESS_COOKIE]: accessToken } }),
    close: async () => {
      await app.close();
      // Descarta as Layers, como o `main.ts` faz no shutdown.
      await runtime.dispose();
    },
  };
};

/** O valor de um cookie na resposta, ou `undefined` se ele não foi gravado. */
export const cookieValue = (
  cookies: readonly { name: string; value: string }[],
  name: string,
): string | undefined => cookies.find((cookie) => cookie.name === name)?.value;
