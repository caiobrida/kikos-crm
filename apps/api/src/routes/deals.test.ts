import {
  BOARD_COLUMN_PAGE_SIZE,
  DEAL_STAGES,
  DealBoard,
  DealListItem,
  DealPage,
  DealSortBy,
  LeadListItem,
  LeadPage,
  STAGE_MOVE_REFUSALS,
  type DealBoardColumn,
  type DealStage,
} from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import {
  CROWDED_STAGE,
  DELETED_DEAL_TITLE,
  DELETED_LEAD_NAME,
  VISIBLE_DEAL_COUNT,
  dealsInStage,
  dealsOwnedBy,
  makeTestHarness,
  type TestHarness,
} from '../testing/harness';

/*
 * O contrato de `GET /deals/board` e `GET /deals`, exercitado pela pilha
 * inteira do Fastify com `app.inject()`.
 *
 * Duas regras do spec são o que este arquivo existe para provar:
 *
 * 1. **o contador de uma coluna é o total do servidor**, e não o tamanho da
 *    leva de cards que veio junto — sem isso, uma coluna cheia mentiria o
 *    número exatamente onde o funil está mais entupido;
 * 2. **o board é a listagem rodada cinco vezes**, então a página 2 que o
 *    "carregar mais" pede continua de onde a coluna parou.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await makeTestHarness();
});

afterEach(async () => {
  await harness.close();
});

/** Abre o board e decodifica com o Schema compartilhado. */
const board = async (query = ''): Promise<DealBoard> => {
  const response = await harness.get(`/deals/board${query}`);
  expect(response.statusCode).toBe(200);
  return Schema.decodeUnknownSync(DealBoard)(response.json());
};

/** Consulta a listagem paginada e decodifica com o mesmo Schema do app web. */
const list = async (query = ''): Promise<DealPage> => {
  const response = await harness.get(`/deals${query}`);
  expect(response.statusCode).toBe(200);
  return Schema.decodeUnknownSync(DealPage)(response.json());
};

const columnOf = (deals: DealBoard, stage: DealStage): DealBoardColumn => {
  const column = deals.columns.find((candidate) => candidate.stage === stage);
  if (column === undefined) throw new Error(`O board não trouxe a coluna ${stage}.`);
  return column;
};

const totalsOf = (deals: DealBoard): readonly number[] =>
  deals.columns.map((column) => column.total);

const titlesIn = (page: DealPage): readonly string[] =>
  page.data.map((deal) => deal.title);

/**
 * Um contato da carteira, achado do mesmo jeito que a tela o acha: pela busca
 * da lista de Leads. É assim que o formulário de negócio descobre o
 * identificador que vai no corpo — e é por isso que o teste não vai buscá-lo na
 * fixture.
 */
const leadNamed = async (name: string): Promise<LeadListItem> => {
  const response = await harness.get(`/leads?search=${encodeURIComponent(name)}`);
  expect(response.statusCode).toBe(200);

  const lead = Schema.decodeUnknownSync(LeadPage)(response.json()).data.at(0);
  if (lead === undefined) throw new Error(`O contato "${name}" não está na carteira.`);
  return lead;
};

/**
 * Um negócio do funil, achado como o board o acha: pela busca. O identificador
 * que a tela usa para mover um card é o que veio no card, e não um que ela
 * conheça por outro caminho.
 */
const dealNamed = async (title: string): Promise<DealListItem> => {
  const page = await list(`?search=${encodeURIComponent(title)}`);

  const deal = page.data.at(0);
  if (deal === undefined) throw new Error(`O negócio "${title}" não está no funil.`);
  return deal;
};

describe('GET /deals/board', () => {
  describe('o funil', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({ method: 'GET', url: '/deals/board' });

      expect(response.statusCode).toBe(401);
    });

    it('devolve as cinco colunas na ordem do Pipeline, numa ida só', async () => {
      const { columns } = await board();

      expect(columns.map((column) => column.stage)).toEqual([...DEAL_STAGES]);
    });

    it('distribui os negócios pelas colunas, sem perder nenhum pelo caminho', async () => {
      const deals = await board();

      const sum = totalsOf(deals).reduce((total, column) => total + column, 0);
      expect(sum).toBe(VISIBLE_DEAL_COUNT);
    });

    it('devolve o card com o valor em centavos, o Lead e o responsável', async () => {
      const [card] = columnOf(await board(), 'NEGOTIATION').deals;

      // O card do mockup: nome do negócio, valor, o Lead e o avatar de quem
      // responde por ele.
      expect(card?.title).toBe('Renovação do parque de máquinas');
      expect(card?.valueInCents).toBe(12_400_000);
      expect(card?.lead.name).toBe('Eduarda Farias');
      expect(card?.owner.name).toBe(harness.seller.name);
    });

    it('não devolve o e-mail nem o hash de senha do responsável', async () => {
      const response = await harness.get('/deals/board');

      // O responsável embutido é só identificador e nome — ver `UserSummary`.
      expect(JSON.stringify(response.json())).not.toContain('@kikos.com.br');
    });
  });

  describe('o contador da coluna', () => {
    it('vem do total do servidor, não do tamanho da leva recebida', async () => {
      const column = columnOf(await board(), CROWDED_STAGE);

      /*
       * É esta diferença que faz o cabeçalho dizer "7" mostrando cinco cards.
       * Contar `deals.length` no navegador daria 5, e a coluna mais cheia do
       * funil seria justamente a que anunciaria o número menor.
       */
      expect(column.deals).toHaveLength(BOARD_COLUMN_PAGE_SIZE);
      expect(column.total).toBe(dealsInStage(CROWDED_STAGE));
      expect(column.total).toBeGreaterThan(column.deals.length);
    });

    it('conta zero na coluna vazia, que continua no board', async () => {
      // Coluna vazia também é informação sobre o funil: some do board e o
      // vendedor não sabe se o estágio existe.
      const column = columnOf(await board('?search=esteiras'), 'CLOSED');

      expect(column.total).toBe(0);
      expect(column.deals).toHaveLength(0);
    });

    it('ignora o negócio removido, no card e no contador', async () => {
      const deals = await board();
      const removed = await board(`?search=${encodeURIComponent(DELETED_DEAL_TITLE)}`);

      expect(JSON.stringify(deals)).not.toContain(DELETED_DEAL_TITLE);
      expect(totalsOf(removed)).toEqual([0, 0, 0, 0, 0]);
    });
  });

  describe('busca e filtro', () => {
    it('a busca por título filtra as cinco colunas de uma vez', async () => {
      const deals = await board('?search=esteiras');

      // "Esteiras" está no título de um negócio de três colunas diferentes: o
      // recorte é do board inteiro, não de uma coluna.
      expect(totalsOf(deals)).toEqual([1, 1, 1, 0, 0]);
    });

    it('a busca alcança o Lead vinculado, não só o título do negócio', async () => {
      // "Academia Ritmo" é a empresa de dois Leads, com negócios em três
      // colunas. O vendedor procura pelo cliente com a mesma caixa de busca.
      const deals = await board('?search=RITMO');

      expect(totalsOf(deals)).toEqual([1, 2, 0, 0, 1]);
    });

    it('trata a busca vazia como ausência de filtro', async () => {
      const deals = await board('?search=');

      expect(totalsOf(deals).reduce((total, column) => total + column, 0)).toBe(
        VISIBLE_DEAL_COUNT,
      );
    });

    it('trata os curingas do LIKE como texto comum', async () => {
      const deals = await board('?search=_');

      expect(totalsOf(deals)).toEqual([0, 0, 0, 0, 0]);
    });

    it('o filtro por vendedor vale para o board inteiro', async () => {
      const deals = await board(`?ownerId=${harness.seller.id}`);

      const sum = totalsOf(deals).reduce((total, column) => total + column, 0);
      expect(sum).toBe(dealsOwnedBy('seller'));

      for (const column of deals.columns) {
        expect(column.deals.every((deal) => deal.owner.id === harness.seller.id)).toBe(
          true,
        );
      }
    });

    it('combina busca e vendedor num recorte só', async () => {
      const deals = await board(`?search=esteiras&ownerId=${harness.manager.id}`);

      // Das três "esteiras", só a da coluna Proposta enviada é do gestor.
      expect(totalsOf(deals)).toEqual([0, 0, 1, 0, 0]);
    });

    it('recusa um identificador de vendedor que não é UUID', async () => {
      const response = await harness.get('/deals/board?ownerId=ana');

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toBe('ValidationFailed');
    });
  });
});

/*
 * O contrato de `GET /deals`.
 *
 * Esta listagem serve o "carregar mais" de uma coluna cheia agora, e a tabela
 * de negócios do dashboard depois. Por isso ela é testada como listagem
 * completa — busca, filtro, ordenação e paginação — e não só como continuação
 * do board.
 */
describe('GET /deals', () => {
  describe('carregar mais', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({ method: 'GET', url: '/deals' });

      expect(response.statusCode).toBe(401);
    });

    it('a primeira página de uma coluna é a leva que o board já mostrou', async () => {
      const column = columnOf(await board(), CROWDED_STAGE);
      const page = await list(
        `?stage=${CROWDED_STAGE}&pageSize=${BOARD_COLUMN_PAGE_SIZE}&page=1`,
      );

      /*
       * O board não tem consulta própria: ele é esta listagem rodada cinco
       * vezes com o estágio fixado. Se as duas divergissem em ordem, o
       * "carregar mais" repetiria ou pularia cards sem que nada acusasse.
       */
      expect(page.data.map((deal) => deal.id)).toEqual(
        column.deals.map((deal) => deal.id),
      );
    });

    it('a página seguinte continua a coluna, sem repetir card', async () => {
      const first = await list(
        `?stage=${CROWDED_STAGE}&pageSize=${BOARD_COLUMN_PAGE_SIZE}&page=1`,
      );
      const second = await list(
        `?stage=${CROWDED_STAGE}&pageSize=${BOARD_COLUMN_PAGE_SIZE}&page=2`,
      );

      const loaded = [...first.data, ...second.data].map((deal) => deal.id);

      expect(second.total).toBe(dealsInStage(CROWDED_STAGE));
      expect(loaded).toHaveLength(dealsInStage(CROWDED_STAGE));
      expect(new Set(loaded).size).toBe(loaded.length);
    });

    it('carrega mais dentro do recorte, e não do funil inteiro', async () => {
      // Quem clica em "carregar mais" com uma busca ativa continua na busca.
      const page = await list(`?stage=${CROWDED_STAGE}&search=esteiras`);

      expect(titlesIn(page)).toEqual(['Esteiras da unidade norte']);
      expect(page.total).toBe(1);
    });

    it('devolve página vazia além da última, sem erro', async () => {
      const page = await list(`?stage=${CROWDED_STAGE}&page=99`);

      expect(page.data).toHaveLength(0);
      expect(page.total).toBe(dealsInStage(CROWDED_STAGE));
    });
  });

  describe('a listagem', () => {
    it('sem estágio, devolve o funil inteiro paginado', async () => {
      const page = await list('?pageSize=100');

      expect(page.total).toBe(VISIBLE_DEAL_COUNT);
      expect(page.data).toHaveLength(VISIBLE_DEAL_COUNT);
    });

    it('nunca devolve um negócio removido, nem quando a busca aponta para ele', async () => {
      const page = await list(`?search=${encodeURIComponent(DELETED_DEAL_TITLE)}`);

      expect(page.total).toBe(0);
      expect(page.data).toHaveLength(0);
    });

    it('ordena do mais recente para o mais antigo quando ninguém pediu ordenação', async () => {
      const page = await list('?pageSize=100');

      // O mesmo default que o board aplica dentro de cada coluna.
      expect(titlesIn(page).at(0)).toBe('Esteiras para a sala principal');
    });

    it('ordena por valor e inverte ao repetir o clique', async () => {
      const ascending = await list('?sortBy=valueInCents&order=asc&pageSize=100');
      const descending = await list('?sortBy=valueInCents&order=desc&pageSize=100');

      const values = ascending.data.map((deal) => deal.valueInCents);
      expect(values).toEqual([...values].sort((a, b) => a - b));
      expect(titlesIn(descending)).toEqual([...titlesIn(ascending)].reverse());
    });

    it('ordena por qualquer coluna que a listagem oferece', async () => {
      /*
       * Percorre a própria união do Schema, então uma coluna nova nascida no
       * domínio já entra neste teste. É a trava contra o caso em que `sortBy`
       * aceita um nome que o repositório não sabe traduzir para coluna.
       */
      for (const column of DealSortBy.literals) {
        const page = await list(`?sortBy=${column}&order=asc&pageSize=100`);

        expect(page.data).toHaveLength(VISIBLE_DEAL_COUNT);
      }
    });

    it('o total acompanha o filtro, não a base inteira', async () => {
      const page = await list(`?ownerId=${harness.seller.id}&pageSize=2`);

      expect(page.data).toHaveLength(2);
      expect(page.total).toBe(dealsOwnedBy('seller'));
    });
  });

  describe('parâmetros inválidos', () => {
    const expectRejection = async (query: string, path: string) => {
      const response = await harness.get(`/deals${query}`);

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string; issues: { path: string }[] }>();
      expect(body.error).toBe('ValidationFailed');
      expect(body.issues.map((issue) => issue.path)).toContain(path);
    };

    it('recusa um estágio fora do vocabulário', async () => {
      await expectRejection('?stage=QUASE_FECHANDO', 'stage');
    });

    it('recusa uma coluna de ordenação que não existe', async () => {
      // A união fechada de `sortBy` é o que impede a query string de chegar ao
      // `ORDER BY`.
      await expectRejection('?sortBy=passwordHash', 'sortBy');
    });

    it('recusa página zero', async () => {
      await expectRejection('?page=0', 'page');
    });

    it('recusa um pageSize que pediria o funil inteiro', async () => {
      await expectRejection('?pageSize=100000', 'pageSize');
    });
  });
});

/*
 * O contrato de `POST /deals`.
 *
 * O formulário e esta rota são validados pelo mesmo Schema, então o que estes
 * testes provam não é "a API recusa" — é o que **só o servidor sabe**:
 *
 * - se o Lead e o responsável escolhidos ainda existem (404);
 * - que negócio nenhum nasce fechado (422, e não 400: o estágio existe, o
 *   movimento é que não);
 * - que criar um negócio **sincroniza o status do Lead**, que é a regra que
 *   liga o board à lista de contatos.
 */
describe('POST /deals', () => {
  /** O contato que os cadastros deste bloco vinculam. Nasce como Novo. */
  const LEAD_NAME = 'Ana Beatriz Souza';
  let lead: LeadListItem;

  beforeEach(async () => {
    lead = await leadNamed(LEAD_NAME);
  });

  const payload = (overrides: Record<string, unknown> = {}) => ({
    title: 'Esteiras da unidade nova',
    // Centavos inteiros: quem digita reais é a tela, que converte antes de enviar.
    valueInCents: 1_250_000,
    leadId: lead.id,
    ownerId: harness.seller.id,
    stage: 'NEW',
    expectedCloseDate: '2026-09-20',
    description: 'Doze esteiras, com instalação.',
    ...overrides,
  });

  /** Cadastra e decodifica a resposta com o Schema que o card do board usa. */
  const create = async (overrides: Record<string, unknown> = {}) => {
    const response = await harness.post('/deals', payload(overrides));

    expect(response.statusCode).toBe(201);
    return Schema.decodeUnknownSync(DealListItem)(response.json());
  };

  const rejection = async (overrides: Record<string, unknown>, status: number) => {
    const response = await harness.post('/deals', payload(overrides));

    expect(response.statusCode).toBe(status);
    return response.json<{
      error: string;
      message: string;
      issues?: { path: string }[];
    }>();
  };

  /** Quantos negócios o funil inteiro tem — o que uma recusa não pode mexer. */
  const dealCount = async (): Promise<number> => (await list('?pageSize=100')).total;

  describe('o cadastro', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/deals',
        payload: payload(),
      });

      expect(response.statusCode).toBe(401);
    });

    it('devolve o negócio criado, já com o Lead e o responsável resolvidos', async () => {
      const deal = await create();

      expect(deal.title).toBe('Esteiras da unidade nova');
      expect(deal.valueInCents).toBe(1_250_000);
      // O card do board desenha os dois; devolvê-los resolvidos é o que permite
      // responder no mesmo Schema da listagem.
      expect(deal.lead).toEqual({ id: lead.id, name: lead.name, company: lead.company });
      expect(deal.owner).toEqual({ id: harness.seller.id, name: harness.seller.name });
    });

    it('faz o card aparecer na coluna do estágio escolhido', async () => {
      const before = columnOf(await board(), 'PROPOSAL_SENT');
      const deal = await create({ stage: 'PROPOSAL_SENT' });
      const after = columnOf(await board(), 'PROPOSAL_SENT');

      expect(after.total).toBe(before.total + 1);
      // Recém-criado é o mais recente, e a coluna vem do mais recente para o
      // mais antigo: o card nasce no topo dela.
      expect(after.deals.at(0)?.id).toBe(deal.id);
    });

    it('deixa o negócio em aberto, fora da coluna Fechado', async () => {
      const before = columnOf(await board(), 'CLOSED');
      await create();

      expect(columnOf(await board(), 'CLOSED').total).toBe(before.total);
    });

    it('aceita um responsável diferente do dono do Lead', async () => {
      // Quem prospecta nem sempre é quem fecha: o formulário só pré-preenche.
      expect(lead.owner.id).toBe(harness.seller.id);
      const deal = await create({ ownerId: harness.manager.id });

      expect(deal.owner.id).toBe(harness.manager.id);
      expect((await leadNamed(LEAD_NAME)).owner.id).toBe(harness.seller.id);
    });

    it('aceita cadastrar sem data prevista e sem descrição', async () => {
      const deal = await create({ expectedCloseDate: '', description: '' });

      expect(deal.title).toBe('Esteiras da unidade nova');
    });

    it('vincula um contato cadastrado agora, sem passo intermediário', async () => {
      const response = await harness.post('/leads', {
        name: 'Juliana Prado',
        company: 'Smart Fit Morumbi',
        email: 'juliana.prado@smartfitmorumbi.com.br',
        phone: '(11) 98812-4471',
        source: 'REFERRAL',
        ownerId: harness.seller.id,
      });
      const created = Schema.decodeUnknownSync(LeadListItem)(response.json());

      const deal = await create({ leadId: created.id });

      expect(deal.lead.name).toBe('Juliana Prado');
    });
  });

  describe('o status do Lead', () => {
    it('move o contato vinculado para Em contato', async () => {
      expect(lead.status).toBe('NEW');
      await create();

      // A regra "último evento vence": quem tem negócio aberto está em contato.
      expect((await leadNamed(LEAD_NAME)).status).toBe('CONTACT');
    });

    it('registra a criação como última interação do contato', async () => {
      const before = lead.lastInteractionAt.getTime();
      await create();

      expect((await leadNamed(LEAD_NAME)).lastInteractionAt.getTime()).toBeGreaterThan(
        before,
      );
    });

    it('não mexe no status de quem não recebeu negócio', async () => {
      await create();

      expect((await leadNamed('Carla Dias')).status).toBe('NEGOTIATION');
    });
  });

  describe('a recusa', () => {
    it('devolve 404 quando o Lead escolhido não existe', async () => {
      const before = await dealCount();
      const body = await rejection({ leadId: randomUUID() }, 404);

      expect(body.error).toBe('LeadNotFound');
      expect(body.message).not.toBe('');
      expect(await dealCount()).toBe(before);
    });

    it('devolve 404 quando o Lead escolhido foi removido', async () => {
      const removed = harness.leads.find((record) => record.name === DELETED_LEAD_NAME);
      const body = await rejection({ leadId: removed?.id }, 404);

      // Contato removido não existe para quem lê — nem para quem vincula.
      expect(body.error).toBe('LeadNotFound');
    });

    it('devolve 404 quando o responsável escolhido não existe', async () => {
      const body = await rejection({ ownerId: randomUUID() }, 404);

      expect(body.error).toBe('OwnerNotFound');
    });

    it('devolve 422 quando o estágio inicial é Fechado', async () => {
      const before = await dealCount();
      const body = await rejection({ stage: 'CLOSED' }, 422);

      /*
       * 422, e não 400: `CLOSED` é um estágio legítimo do vocabulário e o corpo
       * está bem formado. O que não existe é o movimento — chega-se em Fechado
       * marcando Ganho ou Perdido (ADR-0003).
       */
      expect(body.error).toBe('InvalidStageTransition');
      expect(await dealCount()).toBe(before);
    });

    it('aponta o campo obrigatório em branco, e não cadastra nada', async () => {
      const before = await dealCount();
      const body = await rejection({ title: '   ' }, 400);

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('title');
      expect(await dealCount()).toBe(before);
    });

    it('aponta o valor negativo e o valor acima do teto', async () => {
      expect((await rejection({ valueInCents: -1 }, 400)).issues?.at(0)?.path).toBe(
        'valueInCents',
      );
      expect(
        (await rejection({ valueInCents: 1_000_000_001 }, 400)).issues?.at(0)?.path,
      ).toBe('valueInCents');
    });

    it('recusa um estágio fora do vocabulário', async () => {
      const body = await rejection({ stage: 'QUASE_FECHANDO' }, 400);

      expect(body.issues?.map((issue) => issue.path)).toContain('stage');
    });

    it('recusa uma data prevista malformada', async () => {
      const body = await rejection({ expectedCloseDate: '20/09/2026' }, 400);

      expect(body.issues?.map((issue) => issue.path)).toContain('expectedCloseDate');
    });
  });
});

/*
 * O contrato de `PATCH /deals/:id/stage`.
 *
 * O que esta rota tem de próprio é que **a regra que ela aplica não é dela**: a
 * mesma função pura do pacote compartilhado (`refuseStageMove`) decide se a
 * coluna do board aceita o drop e se a API aceita a requisição. Por isso os
 * testes daqui não repetem a tabela de transições — ela já é exercitada direto
 * em `pipeline.test.ts`, sem servidor. O que se prova aqui é o que só a rota
 * faz: mover de verdade, ajustar os dois contadores, sincronizar o contato, e
 * traduzir cada recusa no status HTTP que a tela sabe ler.
 */
describe('PATCH /deals/:id/stage', () => {
  /** O negócio que este bloco move. Nasce em Novo, do contato Ana Beatriz. */
  const DEAL_TITLE = 'Esteiras para a sala principal';
  const LEAD_NAME = 'Ana Beatriz Souza';

  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(DEAL_TITLE);
  });

  /** Move e decodifica a resposta com o mesmo Schema do card do board. */
  const move = async (stage: DealStage, id: string = deal.id) => {
    const response = await harness.patch(`/deals/${id}/stage`, { stage });

    expect(response.statusCode).toBe(200);
    return Schema.decodeUnknownSync(DealListItem)(response.json());
  };

  const rejection = async (
    stage: string,
    status: number,
    id: string = deal.id,
  ): Promise<{ error: string; message: string; issues?: { path: string }[] }> => {
    const response = await harness.patch(`/deals/${id}/stage`, { stage });

    expect(response.statusCode).toBe(status);
    return response.json();
  };

  /** Onde o negócio está agora, segundo o funil — e não segundo a resposta. */
  const stageOf = async (title: string): Promise<DealStage> =>
    (await dealNamed(title)).stage;

  describe('o movimento', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'PATCH',
        url: `/deals/${deal.id}/stage`,
        payload: { stage: 'CONTACT_MADE' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('leva o negócio para o estágio pedido', async () => {
      const moved = await move('PROPOSAL_SENT');

      expect(moved.id).toBe(deal.id);
      expect(moved.stage).toBe('PROPOSAL_SENT');
      expect(await stageOf(DEAL_TITLE)).toBe('PROPOSAL_SENT');
    });

    it('deixa o negócio recuar, porque negociação real anda para trás', async () => {
      await move('NEGOTIATION');
      await move('CONTACT_MADE');

      expect(await stageOf(DEAL_TITLE)).toBe('CONTACT_MADE');
    });

    it('devolve o card já com o Lead e o responsável resolvidos', async () => {
      const moved = await move('CONTACT_MADE');

      // O mesmo Schema da listagem: a resposta é o card como o board o desenha.
      expect(moved.lead).toEqual(deal.lead);
      expect(moved.owner).toEqual(deal.owner);
      expect(moved.valueInCents).toBe(deal.valueInCents);
    });

    it('ajusta os contadores das duas colunas envolvidas', async () => {
      const before = await board();
      await move('NEGOTIATION');
      const after = await board();

      expect(columnOf(after, 'NEW').total).toBe(columnOf(before, 'NEW').total - 1);
      expect(columnOf(after, 'NEGOTIATION').total).toBe(
        columnOf(before, 'NEGOTIATION').total + 1,
      );
    });

    it('não perde nem duplica negócio no funil inteiro', async () => {
      await move('NEGOTIATION');
      const after = await board();

      expect(totalsOf(after).reduce((total, column) => total + column, 0)).toBe(
        VISIBLE_DEAL_COUNT,
      );
      expect(columnOf(after, 'NEW').deals.map((card) => card.id)).not.toContain(deal.id);
    });

    it('registra o movimento como última interação, e o card sobe na coluna', async () => {
      await move('CONTACT_MADE');

      /*
       * A coluna vem do mais recente para o mais antigo, então o negócio que
       * acabou de se mexer é o primeiro card dela. É assim que a última
       * interação é observável sem espiar a coluna do banco.
       */
      expect(columnOf(await board(), 'CONTACT_MADE').deals.at(0)?.id).toBe(deal.id);
    });
  });

  describe('o status do Lead', () => {
    it('leva o contato para Em negociação quando a proposta sai', async () => {
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEW');
      await move('PROPOSAL_SENT');

      expect((await leadNamed(LEAD_NAME)).status).toBe('NEGOTIATION');
    });

    it('deixa o selo onde está quando o negócio recua', async () => {
      await move('NEGOTIATION');
      await move('CONTACT_MADE');

      /*
       * Recuar conta como interação, e não como evento de status: a tabela do
       * spec só promove o contato em Proposta enviada e Negociação. Rebaixá-lo
       * aqui desfaria, sem que ninguém peça, o que outro negócio do mesmo
       * contato registrou.
       */
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEGOTIATION');
    });

    it('não desfaz o desfecho de um contato que já tem negócio encerrado', async () => {
      // Daniel Esteves tem um negócio ganho e outro em aberto na fixture.
      expect((await leadNamed('Daniel Esteves')).status).toBe('WON');

      const other = await dealNamed('Reforma da sala de musculação');
      await move('NEW', other.id);

      expect((await leadNamed('Daniel Esteves')).status).toBe('WON');
    });

    it('registra o movimento como última interação do contato', async () => {
      const before = (await leadNamed(LEAD_NAME)).lastInteractionAt.getTime();
      await move('PROPOSAL_SENT');

      expect((await leadNamed(LEAD_NAME)).lastInteractionAt.getTime()).toBeGreaterThan(
        before,
      );
    });

    it('registra a interação mesmo no movimento que não mexe no selo', async () => {
      const before = (await leadNamed(LEAD_NAME)).lastInteractionAt.getTime();
      await move('CONTACT_MADE');

      // "A última interação do Lead é atualizada a cada movimento" vale para os
      // quatro estágios; o status é que tem tabela própria.
      expect((await leadNamed(LEAD_NAME)).lastInteractionAt.getTime()).toBeGreaterThan(
        before,
      );
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEW');
    });

    it('não mexe no status de quem não teve negócio movido', async () => {
      await move('PROPOSAL_SENT');

      expect((await leadNamed('Carla Dias')).status).toBe('NEGOTIATION');
    });
  });

  describe('a recusa', () => {
    it('devolve 422 ao mover para Fechado, e não move nada', async () => {
      const body = await rejection('CLOSED', 422);

      /*
       * Encerrar um negócio é decisão explícita — Ganho ou Perdido —, e não
       * um card solto numa coluna (ADR-0003). O board nem chega a chamar a
       * rota; a recusa existe para quem enviar por fora da tela.
       */
      expect(body.error).toBe('InvalidStageTransition');
      /*
       * A frase é a **mesma** que o board mostra ao recusar o drop: ela vem da
       * regra compartilhada, e não de um texto escrito de novo do lado da API.
       * Duas explicações para a mesma recusa é o que este `toBe` impede.
       */
      expect(body.message).toBe(STAGE_MOVE_REFUSALS.InvalidStageTransition);
      expect(await stageOf(DEAL_TITLE)).toBe('NEW');
    });

    it('devolve 409 ao mover um negócio já encerrado', async () => {
      const closed = columnOf(await board(), 'CLOSED').deals.at(0);
      const body = await rejection('NEGOTIATION', 409, closed?.id ?? '');

      // Negócio fechado é terminal: o histórico do que foi encerrado não muda.
      expect(body.error).toBe('DealAlreadyClosed');
      expect(body.message).toBe(STAGE_MOVE_REFUSALS.DealAlreadyClosed);
      expect(columnOf(await board(), 'CLOSED').deals.at(0)?.stage).toBe('CLOSED');
    });

    it('devolve 409 mesmo quando o destino também seria inválido', async () => {
      const closed = columnOf(await board(), 'CLOSED').deals.at(0);

      // Arrastar um negócio encerrado para a própria coluna Fechado casa com as
      // duas recusas; a que responde é a que explica o que aconteceu.
      expect((await rejection('CLOSED', 409, closed?.id ?? '')).error).toBe(
        'DealAlreadyClosed',
      );
    });

    it('devolve 404 quando o negócio não existe', async () => {
      const body = await rejection('CONTACT_MADE', 404, randomUUID());

      expect(body.error).toBe('DealNotFound');
    });

    it('devolve 404 quando o negócio foi removido', async () => {
      const removed = harness.deals.find((record) => record.title === DELETED_DEAL_TITLE);
      const body = await rejection('CONTACT_MADE', 404, removed?.id ?? '');

      // Negócio removido não existe para quem lê — nem para quem move.
      expect(body.error).toBe('DealNotFound');
    });

    it('recusa um estágio fora do vocabulário', async () => {
      const body = await rejection('QUASE_FECHANDO', 400);

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('stage');
    });

    it('recusa um identificador de negócio que não é UUID', async () => {
      const body = await rejection('CONTACT_MADE', 400, 'o-negocio-de-ontem');

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('id');
    });
  });
});
