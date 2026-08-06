import { LeadPage, LeadSortBy, type LeadStatus } from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import {
  DELETED_LEAD_NAME,
  VISIBLE_LEAD_COUNT,
  makeTestHarness,
  type TestHarness,
} from '../testing/harness';

/*
 * O contrato de `GET /leads`, exercitado pela pilha inteira do Fastify com
 * `app.inject()`.
 *
 * A regra que este arquivo existe para provar é a do spec: **busca, filtro,
 * ordenação e paginação acontecem no servidor**. Cada asserção aqui é sobre o
 * recorte que a rota devolveu — se alguém mudar de ideia e recortar no
 * navegador, estes testes continuam passando enquanto a rota não regride, e é
 * exatamente por isso que eles vivem deste lado.
 */
describe('GET /leads', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await makeTestHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  /** Faz a consulta autenticada e decodifica com o Schema compartilhado. */
  const list = async (query = ''): Promise<LeadPage> => {
    const response = await harness.get(`/leads${query}`);
    expect(response.statusCode).toBe(200);
    return Schema.decodeUnknownSync(LeadPage)(response.json());
  };

  const namesIn = (page: LeadPage): readonly string[] =>
    page.data.map((lead) => lead.name);

  describe('a carteira', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({ method: 'GET', url: '/leads' });

      expect(response.statusCode).toBe(401);
    });

    it('devolve os Leads com o responsável já resolvido', async () => {
      const page = await list();

      expect(page.total).toBe(VISIBLE_LEAD_COUNT);
      // O nome do responsável é o que vira as iniciais do avatar na tabela.
      for (const lead of page.data) {
        expect(lead.owner.name).not.toBe('');
      }
    });

    it('nunca devolve um Lead removido, nem quando a busca aponta para ele', async () => {
      const everything = await list('?pageSize=100');
      const byName = await list(`?search=${encodeURIComponent(DELETED_LEAD_NAME)}`);

      expect(namesIn(everything)).not.toContain(DELETED_LEAD_NAME);
      expect(byName.total).toBe(0);
      expect(byName.data).toHaveLength(0);
    });

    it('não devolve o e-mail nem o hash de senha do responsável', async () => {
      const response = await harness.get('/leads');

      // O responsável embutido é só identificador e nome — ver `UserSummary`.
      expect(JSON.stringify(response.json())).not.toContain('@kikos.com.br');
    });
  });

  describe('busca', () => {
    it('casa com parte do nome', async () => {
      const page = await list('?search=beatriz');

      expect(namesIn(page)).toEqual(['Ana Beatriz Souza']);
    });

    it('casa com parte da empresa, sem diferenciar caixa', async () => {
      const page = await list('?search=RITMO');

      expect(page.total).toBe(2);
      expect([...namesIn(page)].sort()).toEqual(['Bruno Carvalho', 'Fabio Gomes']);
    });

    it('casa com parte do e-mail', async () => {
      const page = await list('?search=vitalfitness');

      expect(page.total).toBe(2);
      expect([...namesIn(page)].sort()).toEqual(['Carla Dias', 'Gabriela Horta']);
    });

    it('trata a busca vazia como ausência de filtro', async () => {
      // A tela manda `?search=` no instante em que alguém limpa a caixa.
      const page = await list('?search=');

      expect(page.total).toBe(VISIBLE_LEAD_COUNT);
    });

    it('trata os curingas do LIKE como texto comum', async () => {
      const page = await list('?search=_');

      /*
       * `_` casa com "um caractere qualquer" dentro de um `LIKE`, então sem
       * escape esta busca devolveria a carteira inteira. A Layer em memória
       * usa `includes` e nunca teve o problema; quem o tem é a de Prisma, que
       * escapa o termo antes de montar o padrão. Sem Postgres no CI, esta
       * asserção fixa o comportamento esperado dos dois lados — o de Prisma
       * fica coberto pela verificação manual descrita no README.
       */
      expect(page.total).toBe(0);
    });
  });

  describe('filtros', () => {
    it('filtra por status', async () => {
      const page = await list('?status=NEW');

      expect(page.total).toBe(2);
      expect(page.data.every((lead) => lead.status === 'NEW')).toBe(true);
    });

    it('filtra por vendedor responsável', async () => {
      const page = await list(`?ownerId=${harness.seller.id}&pageSize=100`);

      expect(page.total).toBe(4);
      expect(page.data.every((lead) => lead.owner.id === harness.seller.id)).toBe(true);
    });

    it('combina busca, status e vendedor numa consulta só', async () => {
      const page = await list(`?search=ritmo&status=NEW&ownerId=${harness.manager.id}`);

      // "Academia Ritmo" tem dois contatos; só um é NEW e do gestor.
      expect(namesIn(page)).toEqual(['Fabio Gomes']);
    });

    it('devolve recorte vazio quando os filtros não se encontram', async () => {
      const page = await list(`?status=WON&ownerId=${harness.seller.id}`);

      expect(page.total).toBe(0);
      expect(page.data).toHaveLength(0);
    });
  });

  describe('ordenação', () => {
    it('ordena por nome e inverte ao repetir o clique', async () => {
      const ascending = await list('?sortBy=name&order=asc&pageSize=100');
      const descending = await list('?sortBy=name&order=desc&pageSize=100');

      expect(namesIn(ascending).at(0)).toBe('Ana Beatriz Souza');
      expect(namesIn(descending).at(0)).toBe('Gabriela Horta');
      expect(namesIn(descending)).toEqual([...namesIn(ascending)].reverse());
    });

    it('ordena pela última interação, do mais recente para o mais antigo', async () => {
      const page = await list('?sortBy=lastInteractionAt&order=desc&pageSize=100');

      const moments = page.data.map((lead) => lead.lastInteractionAt.getTime());
      expect(moments).toEqual([...moments].sort((a, b) => b - a));
    });

    it('usa a última interação decrescente quando ninguém pediu ordenação', async () => {
      const page = await list('?pageSize=100');

      // Quem abre a tela quer ver o que se mexeu hoje, não o contato mais
      // antigo da carteira.
      expect(namesIn(page).at(0)).toBe('Ana Beatriz Souza');
    });

    it('ordena o status na ordem do funil, não em ordem alfabética', async () => {
      const page = await list('?sortBy=status&order=asc&pageSize=100');

      const statuses = page.data.map((lead) => lead.status);
      const funnelOrder: readonly LeadStatus[] = [
        'NEW',
        'NEW',
        'CONTACT',
        'CONTACT',
        'NEGOTIATION',
        'WON',
        'LOST',
      ];
      // Em ordem alfabética 'CONTACT' viria antes de 'NEW' e 'LOST' antes de
      // 'WON' — o funil não é o dicionário.
      expect(statuses).toEqual(funnelOrder);
    });

    it('ordena por qualquer coluna que a tabela oferece', async () => {
      /*
       * Percorre a própria união do Schema, então uma coluna nova nascida no
       * domínio já entra neste teste. É a trava contra o caso em que `sortBy`
       * aceita um nome que o repositório não sabe traduzir para coluna.
       */
      for (const column of LeadSortBy.literals) {
        const page = await list(`?sortBy=${column}&order=asc&pageSize=100`);

        expect(page.data).toHaveLength(VISIBLE_LEAD_COUNT);
      }
    });

    it('ordena pelo nome do vendedor responsável', async () => {
      const page = await list('?sortBy=owner&order=asc&pageSize=100');

      expect(page.data.at(0)?.owner.name).toBe(harness.seller.name);
      expect(page.data.at(-1)?.owner.name).toBe(harness.manager.name);
    });
  });

  describe('paginação', () => {
    it('devolve a fatia pedida e ecoa a página', async () => {
      const page = await list('?pageSize=3&page=2');

      expect(page.page).toBe(2);
      expect(page.pageSize).toBe(3);
      expect(page.data).toHaveLength(3);
    });

    it('a última página vem incompleta, sem repetir registro', async () => {
      const first = await list('?sortBy=name&order=asc&pageSize=3&page=1');
      const last = await list('?sortBy=name&order=asc&pageSize=3&page=3');

      expect(last.data).toHaveLength(VISIBLE_LEAD_COUNT - 6);
      expect(namesIn(last)).not.toContain(namesIn(first).at(0));
    });

    it('o contador reflete o total do recorte, não o tamanho da página', async () => {
      const page = await list('?pageSize=2');

      // É esta diferença que faz a tela dizer "7 contatos" mostrando 2 linhas.
      expect(page.data).toHaveLength(2);
      expect(page.total).toBe(VISIBLE_LEAD_COUNT);
    });

    it('o total acompanha o filtro, não a base inteira', async () => {
      const page = await list('?search=ritmo&pageSize=1');

      expect(page.data).toHaveLength(1);
      expect(page.total).toBe(2);
    });

    it('devolve página vazia além da última, sem erro', async () => {
      const page = await list('?pageSize=3&page=99');

      expect(page.data).toHaveLength(0);
      expect(page.total).toBe(VISIBLE_LEAD_COUNT);
    });
  });

  describe('parâmetros inválidos', () => {
    const expectRejection = async (query: string, path: string) => {
      const response = await harness.get(`/leads${query}`);

      expect(response.statusCode).toBe(400);

      const body = response.json<{ error: string; issues: { path: string }[] }>();
      expect(body.error).toBe('ValidationFailed');
      expect(body.issues.map((issue) => issue.path)).toContain(path);
    };

    it('recusa um status fora do vocabulário', async () => {
      await expectRejection('?status=QUASE_FECHANDO', 'status');
    });

    it('recusa uma coluna de ordenação que não existe', async () => {
      // A união fechada de `sortBy` é o que impede a query string de chegar ao
      // `ORDER BY`.
      await expectRejection('?sortBy=passwordHash', 'sortBy');
    });

    it('recusa página zero', async () => {
      await expectRejection('?page=0', 'page');
    });

    it('recusa um pageSize que pediria a base inteira', async () => {
      await expectRejection('?pageSize=100000', 'pageSize');
    });

    it('recusa um identificador de vendedor que não é UUID', async () => {
      await expectRejection('?ownerId=ana', 'ownerId');
    });
  });
});
