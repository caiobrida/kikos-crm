import {
  Comment,
  DealDetail,
  DealListItem,
  DealPage,
  DealTimeline,
  LeadListItem,
  LeadPage,
  stageMoveRecord,
  type DealStage,
} from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import {
  COMMENTED_DEAL_TITLE,
  DELETED_DEAL_TITLE,
  commentsOnDeal,
  makeTestHarness,
  type TestHarness,
} from '../testing/harness';

/*
 * O contrato da linha do tempo: `GET /deals/:id/comments` e
 * `POST /deals/:id/comments`.
 *
 * Três coisas são o que este arquivo existe para provar, e nenhuma delas é
 * alcançável por um teste de regra pura:
 *
 * 1. **as duas espécies convivem numa sequência só**, distinguidas por `kind` —
 *    é o que permite à tela desenhar o que uma pessoa escreveu diferente do que
 *    o sistema registrou;
 * 2. **comentar é interação**, e avança a última interação do negócio *e* do
 *    contato — a regra que liga o histórico à ordem das colunas e da carteira;
 * 3. **mover um card deixa registro**, e o registro nomeia os dois estágios em
 *    português e é assinado por quem moveu.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await makeTestHarness();
});

afterEach(async () => {
  await harness.close();
});

/** Um negócio do funil, achado como o board o acha: pela busca. */
const dealNamed = async (title: string): Promise<DealListItem> => {
  const response = await harness.get(`/deals?search=${encodeURIComponent(title)}`);
  expect(response.statusCode).toBe(200);

  const deal = Schema.decodeUnknownSync(DealPage)(response.json()).data.at(0);
  if (deal === undefined) throw new Error(`O negócio "${title}" não está no funil.`);
  return deal;
};

/** O negócio inteiro, como o painel e o modal o leem. */
const detailOf = async (id: string): Promise<DealDetail> => {
  const response = await harness.get(`/deals/${id}`);
  expect(response.statusCode).toBe(200);
  return Schema.decodeUnknownSync(DealDetail)(response.json());
};

/** A linha do tempo, decodificada com o Schema compartilhado. */
const timelineOf = async (id: string): Promise<DealTimeline> => {
  const response = await harness.get(`/deals/${id}/comments`);
  expect(response.statusCode).toBe(200);
  return Schema.decodeUnknownSync(DealTimeline)(response.json());
};

/** Um contato da carteira, achado do mesmo jeito que a tela o acha. */
const leadNamed = async (name: string): Promise<LeadListItem> => {
  const response = await harness.get(`/leads?search=${encodeURIComponent(name)}`);
  expect(response.statusCode).toBe(200);

  const lead = Schema.decodeUnknownSync(LeadPage)(response.json()).data.at(0);
  if (lead === undefined) throw new Error(`O contato "${name}" não está na carteira.`);
  return lead;
};

describe('GET /deals/:id/comments', () => {
  /** O negócio que já nasce com histórico. Está em Novo, do contato Ana Beatriz. */
  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(COMMENTED_DEAL_TITLE);
  });

  it('recusa quem não está logado', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: `/deals/${deal.id}/comments`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('devolve a linha do tempo do mais recente para o mais antigo', async () => {
    const timeline = await timelineOf(deal.id);

    expect(timeline).toHaveLength(commentsOnDeal(COMMENTED_DEAL_TITLE));

    const moments = timeline.map((entry) => entry.createdAt.getTime());
    expect(moments).toEqual([...moments].sort((a, b) => b - a));
  });

  it('traz o autor e o horário de cada registro', async () => {
    const [newest] = await timelineOf(deal.id);

    // "com autor e horário": sem os dois, a linha do tempo não responde quem
    // disse o quê e quando.
    expect(newest?.author.name).toBe(harness.manager.name);
    expect(newest?.createdAt).toBeInstanceOf(Date);
  });

  it('marca a espécie de cada registro, que é o que a tela usa para distingui-las', async () => {
    const timeline = await timelineOf(deal.id);

    // As duas espécies numa sequência só. É `kind` — e não duas listas — que
    // permite desenhar o que o sistema registrou diferente do que uma pessoa
    // escreveu.
    expect(timeline.map((entry) => entry.kind).sort()).toEqual(['SYSTEM', 'USER']);
  });

  it('assina o registro de sistema, como assina o comentário', async () => {
    const timeline = await timelineOf(deal.id);
    const system = timeline.find((entry) => entry.kind === 'SYSTEM');

    // Registro de sistema também tem autor: sem ele, "estágio alterado" não
    // responde quem moveu — que é a pergunta que se faz ao histórico.
    expect(system?.author.name).toBe(harness.manager.name);
  });

  it('não devolve o e-mail nem o hash de senha do autor', async () => {
    const response = await harness.get(`/deals/${deal.id}/comments`);

    // O autor embutido é só identificador e nome — ver `UserSummary`.
    expect(JSON.stringify(response.json())).not.toContain('@kikos.com.br');
  });

  it('devolve lista vazia para o negócio que ainda não tem histórico', async () => {
    const quiet = await dealNamed('Kit de halteres emborrachados');

    // É o caso de um negócio recém-cadastrado: lista vazia, não 404.
    expect(await timelineOf(quiet.id)).toEqual([]);
  });

  it('devolve 404 quando o negócio não existe', async () => {
    const response = await harness.get(`/deals/${randomUUID()}/comments`);

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('DealNotFound');
  });

  it('devolve 404 quando o negócio foi removido', async () => {
    const removed = harness.deals.find((record) => record.title === DELETED_DEAL_TITLE);
    const response = await harness.get(`/deals/${removed?.id ?? ''}/comments`);

    // Negócio removido não existe para quem lê — nem para quem lê o histórico.
    expect(response.statusCode).toBe(404);
  });

  it('recusa um identificador de negócio que não é UUID', async () => {
    const response = await harness.get('/deals/o-negocio-de-ontem/comments');

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; issues: { path: string }[] }>();
    expect(body.error).toBe('ValidationFailed');
    expect(body.issues.map((issue) => issue.path)).toContain('id');
  });
});

describe('POST /deals/:id/comments', () => {
  const BODY = 'Liguei para o cliente: ele confirma a compra até sexta.';
  const LEAD_NAME = 'Ana Beatriz Souza';

  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(COMMENTED_DEAL_TITLE);
  });

  /** Comenta e decodifica a resposta com o Schema que a linha do tempo usa. */
  const comment = async (body: string = BODY, id: string = deal.id): Promise<Comment> => {
    const response = await harness.post(`/deals/${id}/comments`, { body });

    expect(response.statusCode).toBe(201);
    return Schema.decodeUnknownSync(Comment)(response.json());
  };

  const rejection = async (
    payload: Record<string, unknown>,
    status: number,
    id: string = deal.id,
  ): Promise<{ error: string; message: string; issues?: { path: string }[] }> => {
    const response = await harness.post(`/deals/${id}/comments`, payload);

    expect(response.statusCode).toBe(status);
    return response.json();
  };

  describe('o comentário', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: `/deals/${deal.id}/comments`,
        payload: { body: BODY },
      });

      expect(response.statusCode).toBe(401);
    });

    it('devolve o registro criado, assinado por quem está logado', async () => {
      const created = await comment();

      expect(created.body).toBe(BODY);
      // Escrito por uma pessoa, e a pessoa é a da sessão: ninguém comenta em
      // nome de outra, e por isso `kind` e `authorId` não existem no corpo.
      expect(created.kind).toBe('USER');
      expect(created.author).toEqual({
        id: harness.manager.id,
        name: harness.manager.name,
      });
    });

    it('faz o comentário aparecer no topo da linha do tempo', async () => {
      const created = await comment();
      const timeline = await timelineOf(deal.id);

      expect(timeline.at(0)?.id).toBe(created.id);
    });

    it('não apaga o que já estava no histórico', async () => {
      const before = await timelineOf(deal.id);
      await comment();
      const after = await timelineOf(deal.id);

      expect(after).toHaveLength(before.length + 1);
      // Comentário não edita nem remove nada: o histórico só cresce.
      expect(after.map((entry) => entry.id)).toEqual(
        expect.arrayContaining(before.map((entry) => entry.id)),
      );
    });

    it('apara o texto antes de gravar', async () => {
      const created = await comment(`   ${BODY}   `);

      expect(created.body).toBe(BODY);
    });

    it('aceita comentar num negócio já encerrado', async () => {
      const closed = await dealNamed('Kit de acessórios funcionais');
      expect(closed.stage).toBe('CLOSED');

      /*
       * `DealAlreadyClosed` recusa o que **muda** um negócio encerrado — mover,
       * editar, fechar de novo (ADR-0003). Acrescentar ao histórico não muda
       * nada do que foi registrado, e proibir seria impedir alguém de anotar por
       * que a venda foi perdida.
       */
      const created = await comment(
        'Cliente avisou que reabre a conversa em janeiro.',
        closed.id,
      );

      expect(created.kind).toBe('USER');
      expect((await timelineOf(closed.id)).at(0)?.id).toBe(created.id);
    });
  });

  describe('a última interação', () => {
    it('avança a do negócio, e o card sobe na coluna', async () => {
      const before = await detailOf(deal.id);
      const created = await comment();
      const after = await detailOf(deal.id);

      expect(after.lastInteractionAt.getTime()).toBeGreaterThan(
        before.lastInteractionAt.getTime(),
      );
      /*
       * O registro e a última interação descrevem **o mesmo instante**: os dois
       * saem do mesmo `now`. Fossem duas leituras do relógio, a linha do tempo
       * e a ordem da coluna contariam histórias com segundos de diferença.
       */
      expect(after.lastInteractionAt.getTime()).toBe(created.createdAt.getTime());
    });

    it('avança a do contato vinculado', async () => {
      const before = (await leadNamed(LEAD_NAME)).lastInteractionAt.getTime();
      await comment();

      // "Comentar atualiza a última interação do negócio e do Lead": sem a
      // segunda metade, a carteira mostraria um contato parado que acabou de
      // ser trabalhado.
      expect((await leadNamed(LEAD_NAME)).lastInteractionAt.getTime()).toBeGreaterThan(
        before,
      );
    });

    it('não mexe no status do contato', async () => {
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEW');
      await comment();

      /*
       * Comentar é interação, e não evento de status: a tabela do spec promove o
       * contato na criação e na movimentação do negócio, não a cada anotação.
       */
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEW');
    });

    it('não mexe no contato de quem não recebeu comentário', async () => {
      await comment();

      expect((await leadNamed('Carla Dias')).status).toBe('NEGOTIATION');
    });
  });

  describe('a recusa', () => {
    it('aponta o comentário em branco, e não grava nada', async () => {
      const before = await timelineOf(deal.id);
      const body = await rejection({ body: '   ' }, 400);

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('body');
      expect(await timelineOf(deal.id)).toHaveLength(before.length);
    });

    it('aponta o comentário acima do teto de tamanho', async () => {
      const body = await rejection({ body: 'a'.repeat(2001) }, 400);

      expect(body.issues?.map((issue) => issue.path)).toContain('body');
    });

    it('devolve 404 quando o negócio não existe, sem gravar registro órfão', async () => {
      const orphan = randomUUID();
      const body = await rejection({ body: BODY }, 404, orphan);

      expect(body.error).toBe('DealNotFound');
      expect(body.message).not.toBe('');
    });

    it('devolve 404 quando o negócio foi removido', async () => {
      const removed = harness.deals.find((record) => record.title === DELETED_DEAL_TITLE);
      const body = await rejection({ body: BODY }, 404, removed?.id ?? '');

      expect(body.error).toBe('DealNotFound');
    });

    it('não avança a última interação do contato quando recusa', async () => {
      const before = (await leadNamed(LEAD_NAME)).lastInteractionAt.getTime();
      await rejection({ body: '' }, 400);

      expect((await leadNamed(LEAD_NAME)).lastInteractionAt.getTime()).toBe(before);
    });
  });
});

/*
 * O registro que a movimentação deixa.
 *
 * É a metade da fatia 07 que ficou para esta: lá o caso de uso moveu o card e
 * sincronizou o contato; aqui ele ganhou a dependência do repositório de
 * comentário e passou a registrar o evento. Os testes daquela fatia não mudaram
 * — a movimentação continua fazendo tudo o que fazia.
 */
describe('o registro de sistema da movimentação', () => {
  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(COMMENTED_DEAL_TITLE);
  });

  const move = async (stage: DealStage, id: string = deal.id) => {
    const response = await harness.patch(`/deals/${id}/stage`, { stage });
    expect(response.statusCode).toBe(200);
  };

  it('deixa um registro de sistema no topo da linha do tempo', async () => {
    await move('PROPOSAL_SENT');
    const [newest] = await timelineOf(deal.id);

    expect(newest?.kind).toBe('SYSTEM');
  });

  it('nomeia os dois estágios com as palavras que o board usa', async () => {
    await move('PROPOSAL_SENT');
    const [newest] = await timelineOf(deal.id);

    /*
     * A frase vem da regra compartilhada, e não de um texto escrito de novo do
     * lado da API. É o mesmo argumento de `STAGE_MOVE_REFUSALS`: o histórico e
     * o cabeçalho da coluna chamam o estágio pelo mesmo nome.
     */
    expect(newest?.body).toBe(stageMoveRecord('NEW', 'PROPOSAL_SENT'));
  });

  it('assina o registro com quem moveu o card', async () => {
    await move('CONTACT_MADE');
    const [newest] = await timelineOf(deal.id);

    expect(newest?.author.id).toBe(harness.manager.id);
  });

  it('registra o mesmo instante da última interação do negócio', async () => {
    await move('CONTACT_MADE');
    const [newest] = await timelineOf(deal.id);
    const detail = await detailOf(deal.id);

    expect(newest?.createdAt.getTime()).toBe(detail.lastInteractionAt.getTime());
  });

  it('deixa um registro por movimento, na ordem em que aconteceram', async () => {
    const before = await timelineOf(deal.id);

    await move('CONTACT_MADE');
    await move('NEGOTIATION');

    const timeline = await timelineOf(deal.id);
    expect(timeline).toHaveLength(before.length + 2);
    expect(timeline.at(0)?.body).toBe(stageMoveRecord('CONTACT_MADE', 'NEGOTIATION'));
    expect(timeline.at(1)?.body).toBe(stageMoveRecord('NEW', 'CONTACT_MADE'));
  });

  it('não registra nada quando o negócio já está no estágio pedido', async () => {
    const before = await timelineOf(deal.id);
    await move('NEW');

    /*
     * `PATCH` com o estágio atual é idempotente e a tela nem chega a pedi-lo. Um
     * registro dizendo "estágio alterado de Novo para Novo" seria ruído no
     * histórico — e ruído que ninguém pode apagar depois.
     */
    expect(await timelineOf(deal.id)).toHaveLength(before.length);
  });

  it('não registra nada quando o funil recusa o movimento', async () => {
    const before = await timelineOf(deal.id);

    const response = await harness.patch(`/deals/${deal.id}/stage`, { stage: 'CLOSED' });
    expect(response.statusCode).toBe(422);

    expect(await timelineOf(deal.id)).toHaveLength(before.length);
  });
});
