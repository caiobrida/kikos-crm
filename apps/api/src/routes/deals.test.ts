import {
  BOARD_COLUMN_PAGE_SIZE,
  DEAL_CLOSE_REFUSALS,
  DEAL_EDIT_REFUSALS,
  DEAL_STAGES,
  DealBoard,
  type DealDetail,
  DealListItem,
  DealPage,
  DealSortBy,
  LeadListItem,
  OPEN_DEAL_STAGES,
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
import * as read from '../testing/reads';

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

/*
 * As leituras por identificador vêm de `testing/reads`, compartilhadas com os
 * outros arquivos de teste: o contato é achado pela busca da lista de Leads —
 * como o formulário de negócio o acha — e o negócio pelo próprio card do board.
 * Um teste que fosse buscar o identificador na fixture passaria mesmo com a
 * consulta quebrada.
 */
const leadNamed = (name: string): Promise<LeadListItem> => read.leadNamed(harness, name);

const dealNamed = (title: string): Promise<DealListItem> =>
  read.dealNamed(harness, title);

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
 * O contrato de `GET /deals/:id`.
 *
 * É a consulta que o painel lateral e o modal de detalhamento compartilham — uma
 * só, e não duas. O que ela tem de próprio em relação ao card do board é o
 * **dossiê do cliente**: telefone, e-mail e cargo do Lead, que o card não
 * carrega porque num funil de cinco colunas seriam dados repetidos que ninguém
 * lê, e que aqui são o motivo de a seção existir.
 */
describe('GET /deals/:id', () => {
  /** O negócio que este bloco abre. Está em Novo, do contato Ana Beatriz. */
  const DEAL_TITLE = 'Esteiras para a sala principal';

  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(DEAL_TITLE);
  });

  const detailOf = (id: string = deal.id): Promise<DealDetail> =>
    read.dealDetail(harness, id);

  it('recusa quem não está logado', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: `/deals/${deal.id}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('devolve o negócio com os dados que o card não carrega', async () => {
    const detail = await detailOf();

    expect(detail.id).toBe(deal.id);
    expect(detail.title).toBe(DEAL_TITLE);
    expect(detail.valueInCents).toBe(deal.valueInCents);
    // Onde o negócio está × se ele terminou e como: as duas dimensões, sempre.
    expect(detail.stage).toBe('NEW');
    expect(detail.result).toBe('OPEN');
    expect(detail.closedAt).toBeNull();
    expect(detail.lastInteractionAt).toBeInstanceOf(Date);
  });

  it('devolve o dossiê do cliente, com telefone e e-mail', async () => {
    const { lead } = await detailOf();

    // É o que responde "para qual número eu ligo?" sem sair do detalhamento.
    expect(lead.name).toBe('Ana Beatriz Souza');
    expect(lead.company).toBe('Studio Corpo Livre');
    expect(lead.email).toBe('ana.souza@corpolivre.com.br');
    expect(lead.phone).not.toBe('');
    expect(lead.jobTitle).toBe('Gerente de Operações');
  });

  it('devolve `null` no cargo de quem não informou', async () => {
    const other = await dealNamed('Reforma da sala de musculação');

    // `null` e não `""`: o campo é opcional no cadastro, e a tela desenha
    // "não informado" em vez de uma linha vazia.
    expect((await detailOf(other.id)).lead.jobTitle).toBeNull();
  });

  it('separa o responsável pelo negócio do responsável pelo contato', async () => {
    const detail = await detailOf();

    // Quem prospecta nem sempre é quem fecha: os dois campos existem porque as
    // duas pessoas podem ser diferentes.
    expect(detail.owner.id).toBe(harness.seller.id);
    expect(detail.lead.owner.id).toBe(harness.seller.id);
  });

  it('devolve o resultado e a data de fechamento de um negócio encerrado', async () => {
    const closed = columnOf(await board(), 'CLOSED').deals.at(0);
    const detail = await detailOf(closed?.id ?? '');

    // Estágio e resultado nascem juntos no encerramento (ADR-0003), e o modal
    // precisa dos dois para dizer se a venda foi ganha ou perdida.
    expect(detail.stage).toBe('CLOSED');
    expect(detail.result).not.toBe('OPEN');
    expect(detail.closedAt).toBeInstanceOf(Date);
  });

  it('não devolve o e-mail nem o hash de senha dos responsáveis', async () => {
    const response = await harness.get(`/deals/${deal.id}`);

    // Os responsáveis embutidos são só identificador e nome — ver `UserSummary`.
    // O e-mail que aparece na resposta é o do cliente, que é o ponto do dossiê.
    expect(JSON.stringify(response.json())).not.toContain('@kikos.com.br');
  });

  it('devolve 404 quando o negócio não existe', async () => {
    const response = await harness.get(`/deals/${randomUUID()}`);

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('DealNotFound');
  });

  it('devolve 404 quando o negócio foi removido', async () => {
    const removed = harness.deals.find((record) => record.title === DELETED_DEAL_TITLE);
    const response = await harness.get(`/deals/${removed?.id ?? ''}`);

    // Negócio removido não existe para quem lê — nem pelo link direto.
    expect(response.statusCode).toBe(404);
  });

  it('recusa um identificador que não é UUID', async () => {
    const response = await harness.get('/deals/o-negocio-de-ontem');

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; issues: { path: string }[] }>();
    expect(body.error).toBe('ValidationFailed');
    expect(body.issues.map((issue) => issue.path)).toContain('id');
  });

  it('não é confundida com a rota do board', async () => {
    /*
     * `/deals/board` é estática e `/deals/:id` é paramétrica: no Fastify a
     * estática vence independentemente da ordem de registro. Este teste é a
     * trava contra o dia em que alguém reordenar as rotas e o board virar uma
     * consulta por identificador malformado.
     */
    const response = await harness.get('/deals/board');

    expect(response.statusCode).toBe(200);
    expect(response.json<{ columns?: unknown }>().columns).toBeDefined();
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

/*
 * O contrato de `POST /deals/:id/close`.
 *
 * A regra que ela aplica é curta — negócio encerrado não se encerra de novo —, e
 * o que estes testes existem para provar é a outra metade, que é onde mora a
 * decisão de ADR-0003: **encerrar preenche resultado, data de fechamento e
 * estágio numa operação só**. São três colunas que o vendedor nunca atualiza à
 * mão, e é isso que torna inalcançável o estado "estágio Fechado com resultado
 * em aberto" — o que, por sua vez, é o que permite à coluna Fechado sempre saber
 * pintar cada card de verde ou vermelho.
 */
describe('POST /deals/:id/close', () => {
  /** O negócio que este bloco encerra. Nasce em Novo, do contato Ana Beatriz. */
  const DEAL_TITLE = 'Esteiras para a sala principal';
  const LEAD_NAME = 'Ana Beatriz Souza';

  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(DEAL_TITLE);
  });

  /** Encerra e decodifica a resposta com o mesmo Schema do card do board. */
  const close = async (result: string, id: string = deal.id) => {
    const response = await harness.post(`/deals/${id}/close`, { result });

    expect(response.statusCode).toBe(200);
    return Schema.decodeUnknownSync(DealListItem)(response.json());
  };

  const rejection = async (
    result: unknown,
    status: number,
    id: string = deal.id,
  ): Promise<{ error: string; message: string; issues?: { path: string }[] }> => {
    const response = await harness.post(`/deals/${id}/close`, { result });

    expect(response.statusCode).toBe(status);
    return response.json();
  };

  /** O negócio como o detalhamento o lê — de onde saem resultado e data. */
  const detailOf = (id: string = deal.id): Promise<DealDetail> =>
    read.dealDetail(harness, id);

  /** Um negócio que já nasceu encerrado na fixture, para as recusas. */
  const closedDeal = async (): Promise<DealListItem> => {
    const card = columnOf(await board(), 'CLOSED').deals.at(0);
    if (card === undefined) throw new Error('A fixture não tem negócio encerrado.');
    return card;
  };

  describe('o encerramento', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: `/deals/${deal.id}/close`,
        payload: { result: 'WON' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('preenche resultado, data de fechamento e estágio numa operação', async () => {
      expect(deal.stage).toBe('NEW');
      await close('WON');

      /*
       * As três de uma vez, e não duas ações do usuário: é a decisão de
       * ADR-0003. Um encerramento que deixasse o estágio para trás produziria
       * um negócio ganho parado no meio do funil.
       */
      const detail = await detailOf();
      expect(detail.result).toBe('WON');
      expect(detail.stage).toBe('CLOSED');
      expect(detail.closedAt).toBeInstanceOf(Date);
    });

    it('registra o mesmo instante na data de fechamento e na última interação', async () => {
      await close('WON');
      const detail = await detailOf();

      // Um relógio só para a operação: encerrar é um acontecimento, e as duas
      // colunas descrevem o mesmo.
      expect(detail.closedAt?.getTime()).toBe(detail.lastInteractionAt.getTime());
    });

    it('faz o mesmo ao marcar Perdido', async () => {
      await close('LOST');

      const detail = await detailOf();
      expect(detail.result).toBe('LOST');
      expect(detail.stage).toBe('CLOSED');
      expect(detail.closedAt).toBeInstanceOf(Date);
    });

    it('leva o card para a coluna Fechado, tirando-o da de origem', async () => {
      const before = await board();
      await close('WON');
      const after = await board();

      expect(columnOf(after, 'NEW').total).toBe(columnOf(before, 'NEW').total - 1);
      expect(columnOf(after, 'CLOSED').total).toBe(columnOf(before, 'CLOSED').total + 1);
      expect(columnOf(after, 'NEW').deals.map((card) => card.id)).not.toContain(deal.id);
    });

    it('devolve o card com o desfecho, que é o que pinta a coluna Fechado', async () => {
      const closed = await close('LOST');

      /*
       * O `result` no card é o que permite distinguir ganho de perdido **sem
       * abrir os cards**. Sem ele a coluna Fechado precisaria de um
       * detalhamento por card só para escolher a cor.
       */
      expect(closed.result).toBe('LOST');
      expect(closed.stage).toBe('CLOSED');
      expect(closed.lead).toEqual(deal.lead);
      expect(closed.owner).toEqual(deal.owner);
    });

    it('deixa ganhos e perdidos distinguíveis dentro da coluna Fechado', async () => {
      const column = columnOf(await board(), 'CLOSED');

      // A fixture tem um de cada, e nenhum card da coluna pode estar em aberto:
      // "estágio Fechado com resultado em aberto" é inalcançável (ADR-0003).
      expect(column.deals.map((card) => card.result).sort()).toEqual(['LOST', 'WON']);
    });

    it('deixa em aberto o negócio que ninguém encerrou', async () => {
      // Nas outras quatro colunas o desfecho é sempre o mesmo, e é isso que faz
      // a cor do card significar alguma coisa só na coluna Fechado.
      for (const stage of OPEN_DEAL_STAGES) {
        const column = columnOf(await board(), stage);
        expect(column.deals.every((card) => card.result === 'OPEN')).toBe(true);
      }
    });

    it('não perde nem duplica negócio no funil inteiro', async () => {
      await close('WON');
      const after = await board();

      expect(totalsOf(after).reduce((total, column) => total + column, 0)).toBe(
        VISIBLE_DEAL_COUNT,
      );
    });
  });

  describe('o status do Lead', () => {
    it('leva o contato para Ganho quando a venda fecha', async () => {
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEW');
      await close('WON');

      expect((await leadNamed(LEAD_NAME)).status).toBe('WON');
    });

    it('leva o contato para Perdido quando a venda não acontece', async () => {
      await close('LOST');

      expect((await leadNamed(LEAD_NAME)).status).toBe('LOST');
    });

    it('registra o encerramento como última interação do contato', async () => {
      const before = (await leadNamed(LEAD_NAME)).lastInteractionAt.getTime();
      await close('WON');

      expect((await leadNamed(LEAD_NAME)).lastInteractionAt.getTime()).toBeGreaterThan(
        before,
      );
    });

    it('não mexe no contato de quem não teve negócio encerrado', async () => {
      await close('WON');

      expect((await leadNamed('Carla Dias')).status).toBe('NEGOTIATION');
    });
  });

  describe('a recusa', () => {
    it('devolve 409 ao encerrar um negócio já encerrado', async () => {
      const closed = await closedDeal();
      const body = await rejection('WON', 409, closed.id);

      /*
       * 409, e não 422: o pedido existe no funil, e o que impede é o desfecho
       * já registrado. Reabrir negócio não existe (ADR-0003).
       */
      expect(body.error).toBe('DealAlreadyClosed');
      expect(body.message).toBe(DEAL_CLOSE_REFUSALS.DealAlreadyClosed);
    });

    it('não sobrescreve o desfecho de quem já foi encerrado', async () => {
      const closed = await closedDeal();
      const before = await read.dealDetail(harness, closed.id);

      await rejection(before.result === 'WON' ? 'LOST' : 'WON', 409, closed.id);

      const after = await read.dealDetail(harness, closed.id);
      expect(after.result).toBe(before.result);
      expect(after.closedAt?.getTime()).toBe(before.closedAt?.getTime());
    });

    it('recusa encerrar duas vezes o negócio que este teste acabou de encerrar', async () => {
      await close('WON');

      // O caminho que a tela de fato produz: dois cliques no mesmo botão, ou
      // duas abas com o mesmo negócio aberto.
      expect((await rejection('LOST', 409)).error).toBe('DealAlreadyClosed');
      expect((await detailOf()).result).toBe('WON');
    });

    it('recusa encerrar com o resultado em aberto', async () => {
      const body = await rejection('OPEN', 400);

      /*
       * 400, e não 422 como o `stage: 'CLOSED'` do cadastro: `OPEN` não é um
       * desfecho pedido num movimento que não existe — encerrar *é* escolher
       * entre Ganho e Perdido, e o Schema da rota não conhece outra entrada.
       */
      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('result');
      expect((await detailOf()).stage).toBe('NEW');
    });

    it('recusa um desfecho fora do vocabulário', async () => {
      const body = await rejection('GANHAMOS', 400);

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('result');
    });

    it('devolve 404 quando o negócio não existe', async () => {
      expect((await rejection('WON', 404, randomUUID())).error).toBe('DealNotFound');
    });

    it('devolve 404 quando o negócio foi removido', async () => {
      const removed = harness.deals.find((record) => record.title === DELETED_DEAL_TITLE);

      // Negócio removido não existe para quem lê — nem para quem encerra.
      expect((await rejection('WON', 404, removed?.id ?? '')).error).toBe('DealNotFound');
    });

    it('recusa um identificador de negócio que não é UUID', async () => {
      const body = await rejection('WON', 400, 'o-negocio-de-ontem');

      expect(body.issues?.map((issue) => issue.path)).toContain('id');
    });
  });

  describe('depois de encerrado', () => {
    it('continua recusando mover o negócio', async () => {
      await close('WON');

      const response = await harness.patch(`/deals/${deal.id}/stage`, {
        stage: 'NEGOTIATION',
      });

      // A recusa que a fatia anterior já cobria, agora sobre um negócio que
      // este teste encerrou: fechado é terminal, e o card nem arrasta na tela.
      expect(response.statusCode).toBe(409);
      expect(response.json<{ error: string }>().error).toBe('DealAlreadyClosed');
      expect((await detailOf()).stage).toBe('CLOSED');
    });

    it('continua aceitando comentário', async () => {
      await close('LOST');

      /*
       * `DealAlreadyClosed` recusa o que muda o desfecho de um negócio
       * encerrado; acrescentar ao histórico não muda nada do que foi registrado
       * (ADR-0003). Sem isso ninguém poderia anotar por que a venda foi perdida.
       */
      const response = await harness.post(`/deals/${deal.id}/comments`, {
        body: 'Perdemos por prazo de entrega.',
      });

      expect(response.statusCode).toBe(201);
    });
  });
});

/*
 * O contrato de `PUT /deals/:id`.
 *
 * O corpo é o do cadastro menos o estágio, validado pelo mesmo Schema — o que
 * estes testes provam não é "a API recusa", que já está coberto lá. O que é
 * próprio da edição são as fronteiras que ela respeita:
 *
 * - **negócio encerrado não se edita** (409), pelo mesmo princípio que impede
 *   movê-lo — é a terceira escrita que ADR-0003 recusa;
 * - **editar não move o card, não avança a última interação e não mexe no selo
 *   do contato.** Corrigir o valor de uma proposta não é acontecimento com o
 *   cliente, e um card que subisse ao topo da coluna por causa de um ajuste de
 *   digitação mentiria sobre onde a negociação está viva.
 */
describe('PUT /deals/:id', () => {
  /** O negócio que este bloco edita. Está em Novo, do contato Ana Beatriz. */
  const DEAL_TITLE = 'Esteiras para a sala principal';
  const LEAD_NAME = 'Ana Beatriz Souza';

  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(DEAL_TITLE);
  });

  /** A carga completa, como o formulário de edição a manda. */
  const payload = (overrides: Record<string, unknown> = {}) => ({
    title: DEAL_TITLE,
    valueInCents: 1_250_000,
    leadId: deal.lead.id,
    ownerId: deal.owner.id,
    expectedCloseDate: '2026-10-15',
    description: 'Doze esteiras, com instalação.',
    ...overrides,
  });

  /** Edita e decodifica a resposta com o mesmo Schema do card do board. */
  const edit = async (overrides: Record<string, unknown> = {}, id: string = deal.id) => {
    const response = await harness.put(`/deals/${id}`, payload(overrides));

    expect(response.statusCode).toBe(200);
    return Schema.decodeUnknownSync(DealListItem)(response.json());
  };

  const rejection = async (
    overrides: Record<string, unknown>,
    status: number,
    id: string = deal.id,
  ) => {
    const response = await harness.put(`/deals/${id}`, payload(overrides));

    expect(response.statusCode).toBe(status);
    return response.json<{
      error: string;
      message: string;
      issues?: { path: string }[];
    }>();
  };

  const detailOf = (id: string = deal.id): Promise<DealDetail> =>
    read.dealDetail(harness, id);

  describe('a edição', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'PUT',
        url: `/deals/${deal.id}`,
        payload: payload(),
      });

      expect(response.statusCode).toBe(401);
    });

    it('corrige o valor e a data prevista, que é o caso do spec', async () => {
      const edited = await edit({ valueInCents: 1_990_000 });

      expect(edited.id).toBe(deal.id);
      expect(edited.valueInCents).toBe(1_990_000);

      const detail = await detailOf();
      expect(detail.expectedCloseDate).toEqual(new Date('2026-10-15T00:00:00.000Z'));
      expect(detail.description).toBe('Doze esteiras, com instalação.');
    });

    it('reflete no board imediatamente', async () => {
      await edit({ title: 'Esteiras para a sala principal — revisado' });

      const card = columnOf(await board(), 'NEW').deals.find(
        (candidate) => candidate.id === deal.id,
      );
      expect(card?.title).toBe('Esteiras para a sala principal — revisado');
    });

    it('limpa os campos opcionais que foram apagados na tela', async () => {
      await edit({ expectedCloseDate: '', description: '' });

      // Apagar o campo na tela precisa apagá-lo no banco: `""` volta a ser
      // `NULL`, e não uma string vazia que a tela depois trataria como nada.
      const detail = await detailOf();
      expect(detail.expectedCloseDate).toBeNull();
      expect(detail.description).toBeNull();
    });

    it('passa o negócio para outro vendedor', async () => {
      const edited = await edit({ ownerId: harness.manager.id });

      expect(edited.owner).toEqual({
        id: harness.manager.id,
        name: harness.manager.name,
      });
    });

    it('corrige o contato vinculado', async () => {
      // Um negócio cadastrado no contato errado é exatamente o engano que a
      // edição existe para corrigir.
      const other = await leadNamed('Carla Dias');
      const edited = await edit({ leadId: other.id });

      expect(edited.lead).toEqual({
        id: other.id,
        name: other.name,
        company: other.company,
      });
    });

    it('não move o negócio de coluna', async () => {
      /*
       * Mover é `PATCH /deals/:id/stage`, e é lá que moram a regra do funil, o
       * registro na linha do tempo e o selo do contato. O estágio nem existe no
       * Schema desta entrada, então não há como o corpo escolhê-lo.
       */
      const edited = await edit({ stage: 'NEGOTIATION' });

      expect(edited.stage).toBe('NEW');
      expect(columnOf(await board(), 'NEW').deals.map((card) => card.id)).toContain(
        deal.id,
      );
    });

    it('não deixa o corpo escolher o desfecho', async () => {
      const edited = await edit({ result: 'WON', closedAt: '2026-05-30T12:00:00.000Z' });

      // Resultado e data de fechamento nascem juntos no encerramento (ADR-0003),
      // e nenhum dos dois existe neste Schema.
      expect(edited.result).toBe('OPEN');
      expect((await detailOf()).closedAt).toBeNull();
    });

    it('não avança a última interação, e o card não sobe na coluna', async () => {
      const before = (await detailOf()).lastInteractionAt.getTime();
      await edit({ valueInCents: 999_000 });

      /*
       * Corrigir um valor não é acontecimento com o cliente: a lista dos que são
       * está no spec, e editar não está nela.
       */
      expect((await detailOf()).lastInteractionAt.getTime()).toBe(before);
    });

    it('não mexe no selo do contato vinculado', async () => {
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEW');
      await edit({ valueInCents: 999_000 });

      // O status do Lead segue os acontecimentos do funil — criar, mover,
      // encerrar. Corrigir um cadastro não é nenhum deles.
      expect((await leadNamed(LEAD_NAME)).status).toBe('NEW');
    });

    it('não deixa registro na linha do tempo', async () => {
      const before = (await read.dealTimeline(harness, deal.id)).length;
      await edit({ title: 'Esteiras da sala principal' });

      /*
       * O histórico registra o que aconteceu com a negociação, e não cada
       * correção de digitação. Quem quiser deixar anotado o que mudou escreve um
       * comentário — que é justamente o que a linha do tempo é.
       */
      expect(await read.dealTimeline(harness, deal.id)).toHaveLength(before);
    });

    it('não mexe em nenhum outro negócio', async () => {
      await edit({ valueInCents: 1 });

      expect((await dealNamed('Piso emborrachado')).valueInCents).toBe(320_000);
      expect((await list('?pageSize=100')).total).toBe(VISIBLE_DEAL_COUNT);
    });
  });

  describe('a recusa', () => {
    it('devolve 409 ao editar um negócio já encerrado, e não grava nada', async () => {
      const closed = columnOf(await board(), 'CLOSED').deals.at(0);
      const before = await detailOf(closed?.id ?? '');

      const body = await rejection({ title: 'Outro título' }, 409, closed?.id ?? '');

      /*
       * 409, e não 422: o pedido é legítimo, e o que impede é o desfecho já
       * registrado. É a terceira escrita que ADR-0003 recusa, ao lado de mover e
       * de encerrar de novo.
       */
      expect(body.error).toBe('DealAlreadyClosed');
      /*
       * A frase é a da **edição**, e não a do encerramento: a tag é a mesma, mas
       * quem clicou em "Editar" precisa ler sobre editar. Ela vem do pacote
       * compartilhado, junto da regra.
       */
      expect(body.message).toBe(DEAL_EDIT_REFUSALS.DealAlreadyClosed);
      expect((await detailOf(closed?.id ?? '')).title).toBe(before.title);
    });

    it('devolve 409 mesmo para o negócio que este teste acabou de encerrar', async () => {
      const closing = await harness.post(`/deals/${deal.id}/close`, { result: 'WON' });
      expect(closing.statusCode).toBe(200);

      // O caminho que a tela de fato produz: o formulário aberto numa aba
      // enquanto a outra encerra o negócio.
      expect((await rejection({ valueInCents: 1 }, 409)).error).toBe('DealAlreadyClosed');
    });

    it('devolve 404 quando o negócio não existe', async () => {
      expect((await rejection({}, 404, randomUUID())).error).toBe('DealNotFound');
    });

    it('devolve 404 quando o negócio foi removido', async () => {
      const removed = harness.deals.find((record) => record.title === DELETED_DEAL_TITLE);

      // Negócio removido não existe para quem lê — nem para quem edita.
      expect((await rejection({}, 404, removed?.id ?? '')).error).toBe('DealNotFound');
    });

    it('devolve 404 quando o Lead escolhido não existe', async () => {
      expect((await rejection({ leadId: randomUUID() }, 404)).error).toBe('LeadNotFound');
    });

    it('devolve 404 quando o Lead escolhido foi removido', async () => {
      const removed = harness.leads.find((record) => record.name === DELETED_LEAD_NAME);

      expect((await rejection({ leadId: removed?.id }, 404)).error).toBe('LeadNotFound');
    });

    it('devolve 404 quando o responsável escolhido não existe', async () => {
      expect((await rejection({ ownerId: randomUUID() }, 404)).error).toBe(
        'OwnerNotFound',
      );
    });

    it('aponta o campo obrigatório em branco, e não grava nada', async () => {
      const body = await rejection({ title: '   ' }, 400);

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('title');
      expect((await detailOf()).title).toBe(DEAL_TITLE);
    });

    it('aponta o valor negativo e a data malformada', async () => {
      expect((await rejection({ valueInCents: -1 }, 400)).issues?.at(0)?.path).toBe(
        'valueInCents',
      );
      expect(
        (await rejection({ expectedCloseDate: '15/10/2026' }, 400)).issues?.at(0)?.path,
      ).toBe('expectedCloseDate');
    });

    it('recusa um identificador de negócio que não é UUID', async () => {
      const body = await rejection({}, 400, 'o-negocio-de-ontem');

      expect(body.issues?.map((issue) => issue.path)).toContain('id');
    });
  });
});

/*
 * O contrato de `DELETE /deals/:id`.
 *
 * A regra é a da remoção lógica, e o que este bloco existe para provar é a
 * consequência dela: **um negócio removido some de todo lugar** — do card, do
 * contador da coluna, da listagem, do link direto e da linha do tempo. O filtro
 * mora no repositório justamente para que nenhuma rota precise lembrar dele.
 */
describe('DELETE /deals/:id', () => {
  /** O negócio que este bloco remove. Está em Novo, do contato Ana Beatriz. */
  const DEAL_TITLE = 'Esteiras para a sala principal';
  const LEAD_NAME = 'Ana Beatriz Souza';

  let deal: DealListItem;

  beforeEach(async () => {
    deal = await dealNamed(DEAL_TITLE);
  });

  describe('a remoção', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'DELETE',
        url: `/deals/${deal.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('responde 204 e some do board, do contador e da listagem', async () => {
      const before = columnOf(await board(), 'NEW');
      const response = await harness.del(`/deals/${deal.id}`);

      // 204: nada a devolver. O recurso deixou de existir para quem lê.
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      const after = columnOf(await board(), 'NEW');
      expect(after.total).toBe(before.total - 1);
      expect(after.deals.map((card) => card.id)).not.toContain(deal.id);
      expect((await list('?pageSize=100')).total).toBe(VISIBLE_DEAL_COUNT - 1);
    });

    it('some também do link direto e da linha do tempo', async () => {
      await harness.del(`/deals/${deal.id}`);

      /*
       * O negócio tem endereço próprio — o modal é uma rota —, e um link
       * compartilhado antes da remoção precisa explicar o que aconteceu em vez
       * de mostrar uma tela vazia.
       */
      expect((await harness.get(`/deals/${deal.id}`)).statusCode).toBe(404);
      expect((await harness.get(`/deals/${deal.id}/comments`)).statusCode).toBe(404);
    });

    it('não perde nem duplica os outros negócios do funil', async () => {
      await harness.del(`/deals/${deal.id}`);
      const after = await board();

      expect(totalsOf(after).reduce((total, column) => total + column, 0)).toBe(
        VISIBLE_DEAL_COUNT - 1,
      );
    });

    it('remove um negócio já encerrado', async () => {
      const closed = columnOf(await board(), 'CLOSED').deals.at(0);

      /*
       * ADR-0003 recusa as três escritas que **mudam o desfecho** de um negócio
       * encerrado — mover, editar e encerrar de novo. Remover não muda desfecho
       * nenhum: retira o registro inteiro, que é o que se quer de um negócio
       * cadastrado por engano e encerrado por engano junto.
       */
      expect((await harness.del(`/deals/${closed?.id ?? ''}`)).statusCode).toBe(204);
      expect(
        columnOf(await board(), 'CLOSED').deals.map((card) => card.id),
      ).not.toContain(closed?.id);
    });

    it('não mexe no contato vinculado', async () => {
      const before = await leadNamed(LEAD_NAME);
      await harness.del(`/deals/${deal.id}`);

      /*
       * O contato continua na carteira com o selo e a data que tinha: remover um
       * negócio não é evento de status, e o Lead existe independentemente de
       * haver negócio (ver CONTEXT.md).
       */
      const after = await leadNamed(LEAD_NAME);
      expect(after.status).toBe(before.status);
      expect(after.lastInteractionAt.getTime()).toBe(before.lastInteractionAt.getTime());
    });

    it('deixa o contato removível quando era o último negócio em aberto dele', async () => {
      // As duas metades da fatia se encontram aqui: remover os negócios em
      // aberto é o que destrava a remoção do contato.
      for (const title of ['Esteiras para a sala principal', 'Piso emborrachado']) {
        const open = await dealNamed(title);
        expect((await harness.del(`/deals/${open.id}`)).statusCode).toBe(204);
      }

      const lead = await leadNamed(LEAD_NAME);
      expect((await harness.del(`/leads/${lead.id}`)).statusCode).toBe(204);
    });
  });

  describe('a recusa', () => {
    it('devolve 404 quando o negócio não existe', async () => {
      const response = await harness.del(`/deals/${randomUUID()}`);

      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: string }>().error).toBe('DealNotFound');
    });

    it('devolve 404 ao remover de novo o que já foi removido', async () => {
      expect((await harness.del(`/deals/${deal.id}`)).statusCode).toBe(204);

      // Duas abas com o mesmo negócio aberto, ou dois cliques: a segunda
      // remoção não encontra nada, e é isso que a tela explica.
      expect((await harness.del(`/deals/${deal.id}`)).statusCode).toBe(404);
    });

    it('recusa um identificador que não é UUID', async () => {
      const response = await harness.del('/deals/o-negocio-de-ontem');

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string; issues: { path: string }[] }>();
      expect(body.issues.map((issue) => issue.path)).toContain('id');
    });
  });
});
