import {
  BOARD_COLUMN_PAGE_SIZE,
  DEAL_STAGES,
  DealBoard,
  DealPage,
  DealSortBy,
  type DealBoardColumn,
  type DealStage,
} from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import {
  CROWDED_STAGE,
  DELETED_DEAL_TITLE,
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
