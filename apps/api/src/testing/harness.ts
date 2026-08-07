import {
  DealId,
  LeadId,
  UserId,
  type DealResult,
  type DealStage,
  type LeadStatus,
} from '@kikos/domain';
import { Schema } from 'effect';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { ACCESS_COOKIE } from '../http/cookies';
import type { DealRecord } from '../repositories/DealRepository';
import { InMemoryRepositories } from '../repositories/inMemory';
import type { LeadRecord } from '../repositories/LeadRepository';
import type { UserRecord } from '../repositories/UserRepository';
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
const newDealId = (): DealId => Schema.decodeSync(DealId)(randomUUID());

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

/*
 * O funil dos testes.
 *
 * Como a carteira acima, não é uma amostra qualquer — cada linha existe para
 * tornar uma consulta do board verificável:
 *
 * - os cinco Stages aparecem, e `CONTACT_MADE` tem **mais negócios que uma
 *   página de coluna**, que é o caso do "carregar mais";
 * - "esteiras" aparece no título de negócios de três colunas diferentes, e
 *   "ritmo" é a empresa de dois Leads com negócios em três colunas: são as duas
 *   buscas que provam que o filtro atravessa o board inteiro;
 * - os dois responsáveis dividem o funil;
 * - as datas de última interação são distintas e decrescentes, então a ordem é
 *   total e a página 2 de uma coluna não repete nem pula card;
 * - um negócio nasce removido, dentro da coluna cheia — o que nenhuma consulta
 *   pode devolver, e que nenhum contador pode contar.
 */
interface DealFixture {
  readonly title: string;
  readonly valueInCents: number;
  readonly stage: DealStage;
  /** O nome do Lead vinculado, que precisa existir em `LEAD_FIXTURES`. */
  readonly lead: string;
  readonly owner: 'manager' | 'seller';
  readonly result?: DealResult;
  readonly lastInteractionAt: string;
  readonly deleted?: true;
}

const DEAL_FIXTURES: readonly DealFixture[] = [
  {
    title: 'Esteiras para a sala principal',
    valueInCents: 1_250_000,
    stage: 'NEW',
    lead: 'Ana Beatriz Souza',
    owner: 'seller',
    lastInteractionAt: '2026-05-20T12:00:00.000Z',
  },
  {
    title: 'Kit de halteres emborrachados',
    valueInCents: 380_000,
    stage: 'NEW',
    lead: 'Bruno Carvalho',
    owner: 'manager',
    lastInteractionAt: '2026-05-19T12:00:00.000Z',
  },
  {
    title: 'Bicicletas ergométricas',
    valueInCents: 890_000,
    stage: 'CONTACT_MADE',
    lead: 'Carla Dias',
    owner: 'seller',
    lastInteractionAt: '2026-05-18T12:00:00.000Z',
  },
  {
    title: 'Reforma da sala de musculação',
    valueInCents: 4_500_000,
    stage: 'CONTACT_MADE',
    lead: 'Daniel Esteves',
    owner: 'manager',
    lastInteractionAt: '2026-05-17T12:00:00.000Z',
  },
  {
    title: 'Esteiras da unidade norte',
    valueInCents: 2_100_000,
    stage: 'CONTACT_MADE',
    lead: 'Gabriela Horta',
    owner: 'seller',
    lastInteractionAt: '2026-05-16T12:00:00.000Z',
  },
  {
    title: 'Aparelhos de pilates',
    valueInCents: 670_000,
    stage: 'CONTACT_MADE',
    lead: 'Eduarda Farias',
    owner: 'seller',
    lastInteractionAt: '2026-05-15T12:00:00.000Z',
  },
  {
    title: 'Reposição de anilhas',
    valueInCents: 210_000,
    stage: 'CONTACT_MADE',
    lead: 'Fabio Gomes',
    owner: 'manager',
    lastInteractionAt: '2026-05-14T12:00:00.000Z',
  },
  {
    title: 'Estação multifuncional',
    valueInCents: 1_580_000,
    stage: 'CONTACT_MADE',
    lead: 'Bruno Carvalho',
    owner: 'manager',
    lastInteractionAt: '2026-05-13T12:00:00.000Z',
  },
  {
    title: 'Piso emborrachado',
    valueInCents: 320_000,
    stage: 'CONTACT_MADE',
    lead: 'Ana Beatriz Souza',
    owner: 'seller',
    lastInteractionAt: '2026-05-12T12:00:00.000Z',
  },
  {
    title: 'Negócio removido por engano',
    valueInCents: 100_000,
    stage: 'CONTACT_MADE',
    lead: 'Carla Dias',
    owner: 'manager',
    lastInteractionAt: '2026-05-11T12:00:00.000Z',
    deleted: true,
  },
  {
    title: 'Esteiras profissionais',
    valueInCents: 3_200_000,
    stage: 'PROPOSAL_SENT',
    lead: 'Daniel Esteves',
    owner: 'manager',
    lastInteractionAt: '2026-05-10T12:00:00.000Z',
  },
  {
    title: 'Linha completa de cardio',
    valueInCents: 7_800_000,
    stage: 'PROPOSAL_SENT',
    lead: 'Carla Dias',
    owner: 'seller',
    lastInteractionAt: '2026-05-09T12:00:00.000Z',
  },
  {
    title: 'Aparelhos de musculação da matriz',
    valueInCents: 450_000,
    stage: 'PROPOSAL_SENT',
    lead: 'Gabriela Horta',
    owner: 'seller',
    lastInteractionAt: '2026-05-08T12:00:00.000Z',
  },
  {
    title: 'Renovação do parque de máquinas',
    valueInCents: 12_400_000,
    stage: 'NEGOTIATION',
    lead: 'Eduarda Farias',
    owner: 'seller',
    lastInteractionAt: '2026-05-07T12:00:00.000Z',
  },
  {
    title: 'Kit de acessórios funcionais',
    valueInCents: 260_000,
    stage: 'CLOSED',
    lead: 'Fabio Gomes',
    owner: 'manager',
    result: 'WON',
    lastInteractionAt: '2026-05-06T12:00:00.000Z',
  },
  {
    title: 'Ampliação do espaço de crossfit',
    valueInCents: 5_600_000,
    stage: 'CLOSED',
    lead: 'Daniel Esteves',
    owner: 'manager',
    result: 'LOST',
    lastInteractionAt: '2026-05-05T12:00:00.000Z',
  },
];

const visibleDeals = DEAL_FIXTURES.filter((fixture) => fixture.deleted !== true);

/** O título do único negócio removido: nenhuma consulta pode devolvê-lo. */
export const DELETED_DEAL_TITLE = 'Negócio removido por engano';

/** Quantos negócios uma consulta sem filtro devolve. */
export const VISIBLE_DEAL_COUNT = visibleDeals.length;

/** Quantos negócios visíveis a coluna tem — o número que o cabeçalho mostra. */
export const dealsInStage = (stage: DealStage): number =>
  visibleDeals.filter((fixture) => fixture.stage === stage).length;

/** Quantos negócios visíveis são de um dos dois responsáveis. */
export const dealsOwnedBy = (owner: 'manager' | 'seller'): number =>
  visibleDeals.filter((fixture) => fixture.owner === owner).length;

/** A coluna com mais negócios que uma página: a que exercita o "carregar mais". */
export const CROWDED_STAGE: DealStage = 'CONTACT_MADE';

const makeDeals = (
  leads: readonly LeadRecord[],
  manager: UserRecord,
  seller: UserRecord,
): readonly DealRecord[] =>
  DEAL_FIXTURES.map((fixture) => {
    const lead = leads.find((candidate) => candidate.name === fixture.lead);
    if (lead === undefined) {
      throw new Error(
        `O negócio "${fixture.title}" aponta para um Lead fora da fixture.`,
      );
    }

    const result = fixture.result ?? 'OPEN';

    return {
      id: newDealId(),
      title: fixture.title,
      valueInCents: fixture.valueInCents,
      leadId: lead.id,
      ownerId: fixture.owner === 'manager' ? manager.id : seller.id,
      stage: fixture.stage,
      result,
      description: null,
      expectedCloseDate: null,
      // Fechar preenche resultado e data numa operação só (ADR-0003), então a
      // fixture não tem como produzir um encerrado sem data de fechamento.
      closedAt: result === 'OPEN' ? null : new Date(fixture.lastInteractionAt),
      lastInteractionAt: new Date(fixture.lastInteractionAt),
      deletedAt: fixture.deleted === true ? new Date('2026-05-21T12:00:00.000Z') : null,
    };
  });

export interface TestHarness {
  readonly app: FastifyInstance;
  readonly manager: UserRecord;
  readonly seller: UserRecord;
  /**
   * A carteira como ela nasceu, para quando o teste precisa de um contato que
   * a API não devolve — o removido, que só existe do lado de cá da seam.
   */
  readonly leads: readonly LeadRecord[];
  /** O funil como ele nasceu, pelo mesmo motivo: o negócio removido tem `id`. */
  readonly deals: readonly DealRecord[];
  /**
   * Um GET já autenticado como o gestor — o caminho normal de toda tela do CRM.
   * A sessão é aberta uma vez na montagem, para não pagar um bcrypt por teste.
   */
  readonly get: (url: string) => Promise<LightMyRequestResponse>;
  /** O mesmo para as escritas: o corpo vai como JSON, a sessão já vai junto. */
  readonly post: (
    url: string,
    payload: Record<string, unknown>,
  ) => Promise<LightMyRequestResponse>;
  /** A escrita parcial: uma ação sobre um registro que já existe. */
  readonly patch: (
    url: string,
    payload: Record<string, unknown>,
  ) => Promise<LightMyRequestResponse>;
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
  const deals = makeDeals(leads, manager, seller);

  // Os três repositórios sobre um estado só, como as três tabelas do mesmo
  // Postgres — o que permite criar um Lead e vincular um Deal a ele em seguida.
  const runtime = makeRuntime(InMemoryRepositories({ users, leads, deals }));

  const app = buildServer({ runtime, logger: false });
  await app.ready();

  const session = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: manager.email, password: TEST_PASSWORD },
  });
  const accessToken = cookieValue(session.cookies, ACCESS_COOKIE) ?? '';

  const cookies = { [ACCESS_COOKIE]: accessToken };

  return {
    app,
    manager,
    seller,
    leads,
    deals,
    get: (url) => app.inject({ method: 'GET', url, cookies }),
    post: (url, payload) => app.inject({ method: 'POST', url, cookies, payload }),
    patch: (url, payload) => app.inject({ method: 'PATCH', url, cookies, payload }),
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
