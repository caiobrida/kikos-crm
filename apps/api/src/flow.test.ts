import {
  DealListItem,
  DealTimeline,
  LeadListItem,
  dealCloseRecord,
  leadHasOpenDealsMessage,
  stageMoveRecord,
  type DomainError,
} from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import type { LightMyRequestResponse } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './http/cookies';
import type { ErrorBody } from './http/errors';
import {
  CLOSED_DEAL_TITLE,
  LEAD_WITH_ONE_OPEN_DEAL,
  OPEN_DEAL_TITLE,
  TEST_PASSWORD,
  cookieValue,
  makeTestHarness,
  type TestHarness,
} from './testing/harness';
import * as read from './testing/reads';

/*
 * ---------------------------------------------------------------------------
 * O fluxo pela API
 * ---------------------------------------------------------------------------
 *
 * Os outros arquivos de teste da API exercitam uma rota de cada vez, cada um com
 * o funil recém-montado. Este exercita **a ligação entre HTTP e domínio**: uma
 * sessão só, do login à remoção, em que cada passo depende do que o anterior
 * gravou de verdade — e o mapa de erro inteiro, como uma tabela verificável.
 *
 * As duas coisas que ele cobre e nenhum teste de regra alcança:
 *
 * 1. **a rota está registrada, o Schema de entrada é o do formulário, e o
 *    cookie que o login entregou é o que abre as portas.** Um erro de digitação
 *    num caminho, um Schema trocado ou um `preHandler` esquecido aparecem aqui, e
 *    só aqui;
 * 2. **todo erro de domínio chega com o status da tabela de mapeamento.** A
 *    tabela é dado neste arquivo, não uma sequência de números soltos: um
 *    `Data.TaggedError` novo na união `DomainError` quebra o typecheck daqui —
 *    como já quebra o do `switch` em `http/errors.ts` — em vez de estrear em
 *    produção sem status.
 *
 * Sem Postgres: o único duble são as Layers em memória dos repositórios, e abaixo
 * delas roda tudo — Fastify, Schema, bcrypt, JWT, autenticação e o mapa de erro.
 */

let harness: TestHarness;

beforeEach(async () => {
  harness = await makeTestHarness();
});

afterEach(async () => {
  await harness.close();
});

/**
 * O corpo de erro que a API devolve, em qualquer recusa.
 *
 * O tipo é o da própria API, e não uma cópia local: um campo que mudasse de
 * forma lá quebraria este arquivo, que é justamente o que se quer de um teste
 * de contrato.
 */
const errorBody = (response: LightMyRequestResponse): ErrorBody =>
  response.json<ErrorBody>();

describe('uma sessão de trabalho, do login à remoção', () => {
  /*
   * Um teste só, e não onze: os passos não são independentes — o negócio do
   * passo 4 é o que o 5 move, e o contato do passo 3 é o que o 8 se recusa a
   * remover. Quebrá-los em `it`s separados fingiria isolamento onde não há, e a
   * primeira falha derrubaria dez testes em vez de nomear o passo que quebrou.
   */
  it('percorre o caminho inteiro, e cada passo enxerga o que o anterior gravou', async () => {
    /*
     * 1. O login. A sessão é aberta aqui, e não pelo atalho do harness: o que
     *    este arquivo tem a provar é justamente que o cookie que a rota de login
     *    entrega é o que abre as portas do CRM.
     */
    const session = await harness.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: harness.manager.email, password: TEST_PASSWORD },
    });

    expect(session.statusCode).toBe(200);
    expect(cookieValue(session.cookies, ACCESS_COOKIE)).toBeDefined();
    expect(cookieValue(session.cookies, REFRESH_COOKIE)).toBeDefined();

    const cookies = {
      [ACCESS_COOKIE]: cookieValue(session.cookies, ACCESS_COOKIE) ?? '',
    };

    const get = (url: string) => harness.app.inject({ method: 'GET', url, cookies });
    const post = (url: string, payload: Record<string, unknown>) =>
      harness.app.inject({ method: 'POST', url, cookies, payload });
    const patch = (url: string, payload: Record<string, unknown>) =>
      harness.app.inject({ method: 'PATCH', url, cookies, payload });
    const del = (url: string) => harness.app.inject({ method: 'DELETE', url, cookies });

    /*
     * 2. A mesma rota sem o cookie. É a metade que prova que o passo 1 serviu
     *    para alguma coisa: sem esta, um `preHandler` esquecido passaria
     *    despercebido, porque a requisição autenticada responderia igual.
     */
    const semCookie = await harness.app.inject({ method: 'GET', url: '/leads' });

    expect(semCookie.statusCode).toBe(401);
    expect(errorBody(semCookie).error).toBe('Unauthorized');

    // A rota autenticada responde, e é o mesmo caminho.
    expect((await get('/leads')).statusCode).toBe(200);

    /*
     * 3. O contato novo. Nasce "Novo" com a data de agora — nem `status` nem
     *    `lastInteractionAt` existem no Schema de entrada, então não há como o
     *    corpo da requisição escolhê-los.
     */
    const created = await post('/leads', {
      name: 'Juliana Prado',
      company: 'Smart Fit Morumbi',
      email: 'juliana.prado@smartfitmorumbi.com.br',
      phone: '(11) 98812-4471',
      source: 'REFERRAL',
      ownerId: harness.seller.id,
    });

    expect(created.statusCode).toBe(201);

    // Decodificar com o Schema compartilhado é a asserção que importa: se a
    // rota e o contrato divergirem, isto falha antes de qualquer campo.
    const lead = Schema.decodeUnknownSync(LeadListItem)(created.json());
    expect(lead.status).toBe('NEW');
    expect(lead.owner.id).toBe(harness.seller.id);

    /*
     * 4. O negócio sobre esse contato. Nasce em aberto, e promove o contato a
     *    "Em contato" — a sincronização de status é do domínio, com a regra
     *    "último evento vence".
     */
    const opened = await post('/deals', {
      title: 'Esteiras da unidade Morumbi',
      valueInCents: 1_250_000,
      stage: 'NEW',
      leadId: lead.id,
      ownerId: harness.seller.id,
    });

    expect(opened.statusCode).toBe(201);

    const deal = Schema.decodeUnknownSync(DealListItem)(opened.json());
    expect(deal.stage).toBe('NEW');
    expect(deal.result).toBe('OPEN');
    expect(deal.lead.id).toBe(lead.id);

    expect((await read.leadNamed(harness, 'Juliana Prado')).status).toBe('CONTACT');

    /*
     * 5. O card muda de coluna. O contato acompanha — "Proposta enviada" é
     *    evento de negociação —, e o movimento deixa registro na linha do tempo.
     */
    const moved = await patch(`/deals/${deal.id}/stage`, { stage: 'PROPOSAL_SENT' });

    expect(moved.statusCode).toBe(200);
    expect(Schema.decodeUnknownSync(DealListItem)(moved.json()).stage).toBe(
      'PROPOSAL_SENT',
    );
    expect((await read.leadNamed(harness, 'Juliana Prado')).status).toBe('NEGOTIATION');

    /*
     * 6. Arrastar para Fechado não existe: 422, e o negócio não sai do lugar.
     *    Chega-se em Fechado marcando Ganho ou Perdido (ADR-0003) — é o passo 9.
     */
    const paraFechado = await patch(`/deals/${deal.id}/stage`, { stage: 'CLOSED' });

    expect(paraFechado.statusCode).toBe(422);
    expect(errorBody(paraFechado).error).toBe('InvalidStageTransition');
    expect((await read.dealDetail(harness, deal.id)).stage).toBe('PROPOSAL_SENT');

    /*
     * 7. O comentário. Entra no topo da linha do tempo, acima do registro de
     *    sistema que o passo 5 gravou.
     */
    const commented = await post(`/deals/${deal.id}/comments`, {
      body: 'Cliente pediu a proposta com instalação inclusa.',
    });

    expect(commented.statusCode).toBe(201);

    const timeline = Schema.decodeUnknownSync(DealTimeline)(
      (await get(`/deals/${deal.id}/comments`)).json(),
    );

    expect(timeline.map((item) => [item.kind, item.body])).toEqual([
      ['USER', 'Cliente pediu a proposta com instalação inclusa.'],
      ['SYSTEM', stageMoveRecord('NEW', 'PROPOSAL_SENT')],
    ]);

    /*
     * 8. Remover o contato agora não passa: ele tem um negócio em aberto, e o
     *    funil não perde oportunidade porque alguém quis limpar a lista. A
     *    recusa diz **quantos** negócios travam a operação.
     */
    const comNegocioAberto = await del(`/leads/${lead.id}`);

    expect(comNegocioAberto.statusCode).toBe(409);
    expect(errorBody(comNegocioAberto)).toMatchObject({
      error: 'LeadHasOpenDeals',
      // A frase vem do domínio, e é a mesma que a tela mostra.
      message: leadHasOpenDealsMessage(1),
    });

    /*
     * 9. O encerramento, que é a única ação que tira um negócio do funil.
     *    Resultado, data de fechamento e estágio numa operação só (ADR-0003).
     */
    const closed = await post(`/deals/${deal.id}/close`, { result: 'WON' });

    expect(closed.statusCode).toBe(200);

    const won = Schema.decodeUnknownSync(DealListItem)(closed.json());
    expect(won.stage).toBe('CLOSED');
    expect(won.result).toBe('WON');

    const afterClose = await read.dealDetail(harness, deal.id);
    expect(afterClose.closedAt).toBeInstanceOf(Date);

    // O contato acompanha o desfecho, e o encerramento também deixa registro.
    expect((await read.leadNamed(harness, 'Juliana Prado')).status).toBe('WON');
    expect(
      Schema.decodeUnknownSync(DealTimeline)(
        (await get(`/deals/${deal.id}/comments`)).json(),
      ).at(0)?.body,
    ).toBe(dealCloseRecord('WON'));

    /*
     * 10. Encerrar de novo: 409. O desfecho já registrado é o que impede, e
     *     reabrir negócio não existe.
     */
    const deNovo = await post(`/deals/${deal.id}/close`, { result: 'LOST' });

    expect(deNovo.statusCode).toBe(409);
    expect(errorBody(deNovo).error).toBe('DealAlreadyClosed');
    expect((await read.dealDetail(harness, deal.id)).result).toBe('WON');

    /*
     * 11. E agora o contato sai. É o fecho da história do passo 8: a recusa era
     *     um estado, não um muro — encerrado o negócio, a remoção passa.
     */
    const removed = await del(`/leads/${lead.id}`);

    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe('');

    // Removido para quem lê: some da carteira, e a leitura por identificador
    // devolve 404 — o filtro da remoção lógica mora no repositório.
    expect((await get('/leads?search=juliana')).json()).toMatchObject({ total: 0 });
    expect((await get(`/leads/${lead.id}`)).statusCode).toBe(404);

    /*
     * O negócio ganho continua no funil, e continua sabendo de quem era. Apagar
     * os negócios junto do contato levaria embora o histórico de vendas.
     */
    const dossie = await read.dealDetail(harness, deal.id);
    expect(dossie.result).toBe('WON');
    expect(dossie.lead.name).toBe('Juliana Prado');
  });
});

/*
 * ---------------------------------------------------------------------------
 * O mapa de erro para HTTP
 * ---------------------------------------------------------------------------
 */

/**
 * A tabela de mapeamento do spec, como dado.
 *
 * `Record<DomainError['_tag'], number>` é o que torna esta lista **exaustiva por
 * construção**: acrescentar um `Data.TaggedError` à união `DomainError` sem
 * acrescentá-lo aqui quebra `tsc --noEmit`, do mesmo jeito que quebra o `switch`
 * de `toHttpError`. As duas travas dizem a mesma coisa de dois lados — uma no
 * código que traduz, outra no teste que confere.
 */
const HTTP_STATUS: Record<DomainError['_tag'], number> = {
  ValidationFailed: 400,
  InvalidCredentials: 401,
  Unauthorized: 401,
  OwnerNotFound: 404,
  LeadNotFound: 404,
  DealNotFound: 404,
  DealAlreadyClosed: 409,
  LeadHasOpenDeals: 409,
  InvalidStageTransition: 422,
};

/**
 * Uma requisição que provoca cada erro, pela porta da frente.
 *
 * O `Record` é exaustivo pelo mesmo motivo do de cima: um erro novo que nenhuma
 * requisição saiba provocar não passa no typecheck — o que impede a tabela
 * acima de crescer com uma linha que nada exercita.
 */
const PROVOCATIONS: Record<
  DomainError['_tag'],
  (harness: TestHarness) => Promise<LightMyRequestResponse>
> = {
  /** Corpo malformado: o e-mail não é e-mail, e o telefone está em branco. */
  ValidationFailed: (harness) =>
    harness.post('/leads', {
      name: 'Juliana Prado',
      company: 'Smart Fit Morumbi',
      email: 'nao-e-um-email',
      phone: '',
      source: 'REFERRAL',
      ownerId: harness.seller.id,
    }),

  /** A senha errada, na única rota que recebe senha. */
  InvalidCredentials: (harness) =>
    harness.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: harness.manager.email, password: 'senha-errada' },
    }),

  /** Sem cookie de sessão: a requisição não passa do `preHandler`. */
  Unauthorized: (harness) => harness.app.inject({ method: 'GET', url: '/leads' }),

  /**
   * Um responsável que não está no time. A forma do identificador o Schema
   * confere sozinho; que ele aponte para alguém, só o servidor sabe.
   */
  OwnerNotFound: (harness) =>
    harness.post('/leads', {
      name: 'Juliana Prado',
      company: 'Smart Fit Morumbi',
      email: 'juliana.prado@smartfitmorumbi.com.br',
      phone: '(11) 98812-4471',
      source: 'REFERRAL',
      ownerId: randomUUID(),
    }),

  /** Um contato que nunca existiu — como o que outra pessoa acabou de remover. */
  LeadNotFound: (harness) => harness.get(`/leads/${randomUUID()}`),

  /** O mesmo para um negócio: um card que sumiu entre o carregar e o clique. */
  DealNotFound: (harness) => harness.get(`/deals/${randomUUID()}`),

  /** Mover um negócio que já terminou. */
  DealAlreadyClosed: async (harness) => {
    const closed = await read.dealNamed(harness, CLOSED_DEAL_TITLE);

    return harness.patch(`/deals/${closed.id}/stage`, { stage: 'NEGOTIATION' });
  },

  /** Remover um contato que ainda tem negócio no funil. */
  LeadHasOpenDeals: async (harness) => {
    const lead = await read.leadNamed(harness, LEAD_WITH_ONE_OPEN_DEAL);

    return harness.del(`/leads/${lead.id}`);
  },

  /** Pedir a coluna Fechado para um negócio em aberto, por fora da tela. */
  InvalidStageTransition: async (harness) => {
    const open = await read.dealNamed(harness, OPEN_DEAL_TITLE);

    return harness.patch(`/deals/${open.id}/stage`, { stage: 'CLOSED' });
  },
};

describe('todo erro de domínio chega com o status da tabela', () => {
  // `Object.keys` de um `Record` exaustivo: a lista de casos é a união inteira,
  // e não uma seleção que alguém precisa lembrar de atualizar.
  const tags = Object.keys(HTTP_STATUS) as readonly DomainError['_tag'][];

  for (const tag of tags) {
    it(`${tag} → ${String(HTTP_STATUS[tag])}`, async () => {
      const response = await PROVOCATIONS[tag](harness);

      expect(response.statusCode).toBe(HTTP_STATUS[tag]);

      /*
       * A tag no corpo, e não só o status: é ela que o app web lê para escolher
       * o que fazer — dois erros compartilham 401 e dois compartilham 409, e um
       * status sozinho não os distingue.
       */
      const body = errorBody(response);
      expect(body.error).toBe(tag);
      expect(body.message.length).toBeGreaterThan(0);
    });
  }

  it('aponta o campo culpado, e só em ValidationFailed', async () => {
    const invalid = errorBody(await PROVOCATIONS.ValidationFailed(harness));

    // As duas queixas do corpo do passo acima, cada uma no seu campo.
    expect(invalid.issues?.map((issue) => issue.path)).toEqual(['email', 'phone']);

    // Nos outros não há campo a apontar: a recusa é sobre o estado, não sobre a
    // forma da entrada, e o corpo de erro tem um formato só.
    const conflict = errorBody(await PROVOCATIONS.DealAlreadyClosed(harness));
    expect(conflict.issues).toBeUndefined();
  });
});
