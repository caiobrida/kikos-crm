import {
  LeadListItem,
  LeadPage,
  LeadSortBy,
  leadHasOpenDealsMessage,
  type LeadDetail,
  type LeadStatus,
} from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import {
  DELETED_LEAD_NAME,
  LEAD_WITH_ONE_OPEN_DEAL,
  OPEN_DEAL_OF_THAT_LEAD,
  VISIBLE_LEAD_COUNT,
  makeTestHarness,
  openDealsOfLead,
  type TestHarness,
} from '../testing/harness';
import * as read from '../testing/reads';

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

const namesIn = (page: LeadPage): readonly string[] => page.data.map((lead) => lead.name);

/*
 * As leituras por identificador vêm de `testing/reads`: o teste acha o contato
 * pelo caminho que a tela acha — a busca da própria lista —, e não espiando a
 * fixture. Um teste que pegasse o identificador do outro lado da seam passaria
 * mesmo com a consulta quebrada.
 */
const leadNamed = (name: string): Promise<LeadListItem> => read.leadNamed(harness, name);

describe('GET /leads', () => {
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

/*
 * O contrato de `POST /leads`.
 *
 * O formulário do navegador e esta rota são validados pelo mesmo Schema, então
 * o que estes testes provam não é "a API recusa" — é que **as duas pontas
 * recusam a mesma coisa**, porque a regra é uma só. O que sobra de exclusivo da
 * API é o que o navegador não tem como saber: se o responsável escolhido ainda
 * existe, e o que um Lead recém-nascido vale de status e de última interação.
 */
describe('POST /leads', () => {
  const payload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Juliana Prado',
    company: 'Smart Fit Morumbi',
    email: 'juliana.prado@smartfitmorumbi.com.br',
    phone: '(11) 98812-4471',
    jobTitle: 'Gerente de Operações',
    source: 'REFERRAL',
    ownerId: harness.seller.id,
    notes: 'Quer trocar a linha de esteiras das duas unidades.',
    ...overrides,
  });

  /** Cadastra e decodifica a resposta com o Schema que a tabela usa. */
  const create = async (overrides: Record<string, unknown> = {}) => {
    const response = await harness.post('/leads', payload(overrides));

    expect(response.statusCode).toBe(201);
    return Schema.decodeUnknownSync(LeadListItem)(response.json());
  };

  const rejection = async (overrides: Record<string, unknown>, status: number) => {
    const response = await harness.post('/leads', payload(overrides));

    expect(response.statusCode).toBe(status);
    return response.json<{
      error: string;
      message: string;
      issues?: { path: string }[];
    }>();
  };

  describe('o cadastro', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/leads',
        payload: payload(),
      });

      expect(response.statusCode).toBe(401);
    });

    it('devolve o contato criado, já com o responsável resolvido', async () => {
      const lead = await create();

      expect(lead.name).toBe('Juliana Prado');
      expect(lead.company).toBe('Smart Fit Morumbi');
      // O responsável vem embutido: é o avatar que a linha da tabela desenha.
      expect(lead.owner).toEqual({ id: harness.seller.id, name: harness.seller.name });
    });

    it('faz o contato aparecer na lista, sem passo intermediário', async () => {
      await create();
      const page = await list('?search=juliana&pageSize=100');

      expect(namesIn(page)).toEqual(['Juliana Prado']);
      expect((await list('?pageSize=100')).total).toBe(VISIBLE_LEAD_COUNT + 1);
    });

    it('nasce com status Novo e última interação no momento da criação', async () => {
      const before = Date.now();
      const lead = await create();
      const after = Date.now();

      expect(lead.status).toBe('NEW');
      expect(lead.lastInteractionAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(lead.lastInteractionAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('não deixa o corpo da requisição escolher o status', async () => {
      // O campo não existe no Schema de entrada, então nem chega ao domínio:
      // "nasce como Novo" é regra do CRM, não sugestão de quem cadastra.
      const lead = await create({ status: 'WON' });

      expect(lead.status).toBe('NEW');
    });

    it('normaliza o que foi digitado com espaço e caixa alta', async () => {
      const lead = await create({
        name: '  Juliana Prado  ',
        email: ' Juliana.Prado@SmartFitMorumbi.com.br ',
      });

      expect(lead.name).toBe('Juliana Prado');
      expect(lead.email).toBe('juliana.prado@smartfitmorumbi.com.br');
    });

    it('aceita cadastrar sem cargo e sem observações', async () => {
      const lead = await create({ jobTitle: '', notes: '' });

      expect(lead.name).toBe('Juliana Prado');
    });

    it('aceita o mesmo e-mail de um contato que já existe', async () => {
      // O e-mail do Lead não é único de propósito: com remoção lógica, a linha
      // apagada continuaria ocupando o índice e travaria o recadastro.
      await create();
      await create({ name: 'Juliana Prado (novo contato)' });

      expect((await list('?search=juliana.prado&pageSize=100')).total).toBe(2);
    });
  });

  describe('a recusa', () => {
    it('aponta o campo obrigatório em branco, e não cadastra nada', async () => {
      const body = await rejection({ name: '   ' }, 400);

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('name');
      expect((await list('?pageSize=100')).total).toBe(VISIBLE_LEAD_COUNT);
    });

    it('aponta o e-mail malformado', async () => {
      const body = await rejection({ email: 'juliana.prado' }, 400);

      expect(body.issues?.map((issue) => issue.path)).toContain('email');
    });

    it('recusa uma origem fora do vocabulário', async () => {
      const body = await rejection({ source: 'INDICACAO' }, 400);

      expect(body.issues?.map((issue) => issue.path)).toContain('source');
    });

    it('devolve 404 quando o responsável escolhido não existe', async () => {
      /*
       * É a única regra deste cadastro que o navegador não tem como conferir
       * sozinho: o `<select>` foi preenchido com uma lista de vendedores que
       * pode ter mudado desde que a tela carregou.
       */
      const body = await rejection({ ownerId: randomUUID() }, 404);

      expect(body.error).toBe('OwnerNotFound');
      expect(body.message).not.toBe('');
      expect((await list('?pageSize=100')).total).toBe(VISIBLE_LEAD_COUNT);
    });
  });
});

/*
 * O contrato de `GET /leads/:id`.
 *
 * A leitura que o modal do Lead faz, e a razão de ela existir separada da
 * listagem são dois campos: `jobTitle` e `notes`, que a tabela não desenha. Sem
 * eles, abrir a edição de um contato ofereceria dois campos em branco que não
 * estão em branco no banco — e salvar apagaria o que alguém escreveu.
 */
describe('GET /leads/:id', () => {
  /** O contato que este bloco abre. Tem cargo preenchido na fixture. */
  const LEAD_NAME = 'Ana Beatriz Souza';

  let lead: LeadListItem;

  beforeEach(async () => {
    lead = await leadNamed(LEAD_NAME);
  });

  const detailOf = (id: string = lead.id): Promise<LeadDetail> =>
    read.leadDetail(harness, id);

  it('recusa quem não está logado', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: `/leads/${lead.id}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('devolve o contato com os campos que a tabela não carrega', async () => {
    const detail = await detailOf();

    expect(detail.id).toBe(lead.id);
    expect(detail.name).toBe(LEAD_NAME);
    expect(detail.company).toBe('Studio Corpo Livre');
    // Os dois que só existem nesta leitura, e por causa dos quais ela existe.
    expect(detail.jobTitle).toBe('Gerente de Operações');
    expect(detail).toHaveProperty('notes');
  });

  it('devolve `null` no cargo e nas observações de quem não informou', async () => {
    // `null` e não `""`: os campos são opcionais no cadastro, e a tela desenha
    // "não informado" em vez de uma linha vazia.
    const detail = await detailOf((await leadNamed('Bruno Carvalho')).id);

    expect(detail.jobTitle).toBeNull();
    expect(detail.notes).toBeNull();
  });

  it('devolve o selo e a última interação, que o modal mostra sem deixar editar', async () => {
    const detail = await detailOf();

    expect(detail.status).toBe('NEW');
    expect(detail.lastInteractionAt).toBeInstanceOf(Date);
    expect(detail.owner).toEqual({ id: harness.seller.id, name: harness.seller.name });
  });

  it('não devolve o e-mail nem o hash de senha do responsável', async () => {
    const response = await harness.get(`/leads/${lead.id}`);

    /*
     * O responsável embutido é só identificador e nome — ver `UserSummary`. O
     * e-mail que aparece na resposta é o do contato, que é o ponto da tela.
     */
    expect(JSON.stringify(response.json())).not.toContain('@kikos.com.br');
  });

  it('devolve 404 quando o contato não existe', async () => {
    const response = await harness.get(`/leads/${randomUUID()}`);

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('LeadNotFound');
  });

  it('devolve 404 quando o contato foi removido', async () => {
    const removed = harness.leads.find((record) => record.name === DELETED_LEAD_NAME);
    const response = await harness.get(`/leads/${removed?.id ?? ''}`);

    // Contato removido não existe para quem lê — nem pelo link direto.
    expect(response.statusCode).toBe(404);
  });

  it('recusa um identificador que não é UUID', async () => {
    const response = await harness.get('/leads/o-contato-de-ontem');

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; issues: { path: string }[] }>();
    expect(body.error).toBe('ValidationFailed');
    expect(body.issues.map((issue) => issue.path)).toContain('id');
  });
});

/*
 * O contrato de `PUT /leads/:id`.
 *
 * O corpo é o do cadastro, campo por campo, e é validado pelo mesmo Schema — o
 * que estes testes provam não é "a API recusa", que já está coberto lá. O que é
 * próprio da edição são as duas coisas que ela **não** faz: mexer no selo do
 * contato e mexer na última interação. As duas são decididas pelos
 * acontecimentos do funil, e corrigir um telefone não é um deles.
 */
describe('PUT /leads/:id', () => {
  const LEAD_NAME = 'Ana Beatriz Souza';

  let lead: LeadListItem;

  beforeEach(async () => {
    lead = await leadNamed(LEAD_NAME);
  });

  /** A carga completa, como o formulário de edição a manda: tudo preenchido. */
  const payload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Ana Beatriz Souza',
    company: 'Studio Corpo Livre',
    email: 'ana.souza@corpolivre.com.br',
    phone: '(11) 91234-5678',
    jobTitle: 'Diretora de Operações',
    source: 'WEBSITE',
    ownerId: harness.seller.id,
    notes: 'Prefere ser chamada de manhã.',
    ...overrides,
  });

  /** Edita e decodifica a resposta com o Schema que a tabela usa. */
  const edit = async (overrides: Record<string, unknown> = {}, id: string = lead.id) => {
    const response = await harness.put(`/leads/${id}`, payload(overrides));

    expect(response.statusCode).toBe(200);
    return Schema.decodeUnknownSync(LeadListItem)(response.json());
  };

  const rejection = async (
    overrides: Record<string, unknown>,
    status: number,
    id: string = lead.id,
  ) => {
    const response = await harness.put(`/leads/${id}`, payload(overrides));

    expect(response.statusCode).toBe(status);
    return response.json<{
      error: string;
      message: string;
      issues?: { path: string }[];
    }>();
  };

  describe('a edição', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'PUT',
        url: `/leads/${lead.id}`,
        payload: payload(),
      });

      expect(response.statusCode).toBe(401);
    });

    it('grava a correção e devolve o contato no formato da tabela', async () => {
      const edited = await edit({ phone: '(11) 90000-1111' });

      expect(edited.id).toBe(lead.id);
      expect(edited.phone).toBe('(11) 90000-1111');
      expect(edited.owner).toEqual({ id: harness.seller.id, name: harness.seller.name });
    });

    it('reflete na tabela imediatamente, sem passo intermediário', async () => {
      await edit({ company: 'Studio Corpo Livre — Matriz' });

      expect((await leadNamed(LEAD_NAME)).company).toBe('Studio Corpo Livre — Matriz');
    });

    it('preenche e limpa os campos opcionais', async () => {
      await edit({ jobTitle: 'Sócia-fundadora', notes: 'Indicada pelo Bruno.' });
      expect((await read.leadDetail(harness, lead.id)).jobTitle).toBe('Sócia-fundadora');

      // Apagar o campo na tela precisa apagá-lo no banco: `""` volta a ser
      // `NULL`, e não uma string vazia que a tela depois trataria como nada.
      await edit({ jobTitle: '', notes: '' });
      const cleared = await read.leadDetail(harness, lead.id);
      expect(cleared.jobTitle).toBeNull();
      expect(cleared.notes).toBeNull();
    });

    it('normaliza o que foi digitado com espaço e caixa alta', async () => {
      const edited = await edit({
        name: '  Ana Beatriz Souza  ',
        email: ' Ana.Souza@CorpoLivre.com.br ',
      });

      expect(edited.name).toBe('Ana Beatriz Souza');
      expect(edited.email).toBe('ana.souza@corpolivre.com.br');
    });

    it('passa o contato para outro vendedor', async () => {
      const edited = await edit({ ownerId: harness.manager.id });

      expect(edited.owner.id).toBe(harness.manager.id);
    });

    it('não mexe no selo do contato', async () => {
      /*
       * O status é sincronizado pelas ações de Deal, com a regra "último evento
       * vence". Editar o cadastro não é evento nenhum — e o campo nem existe no
       * Schema de entrada, então não há como o corpo escolhê-lo.
       */
      const edited = await edit({ status: 'WON' });

      expect(edited.status).toBe(lead.status);
      expect(edited.status).toBe('NEW');
    });

    it('não mexe na última interação', async () => {
      const edited = await edit({ phone: '(11) 90000-2222' });

      /*
       * Corrigir um telefone não é interação com o cliente: a lista de
       * acontecimentos que avançam a data está no spec, e editar não está nela.
       * Uma carteira ordenada por última interação mostraria como "trabalhado
       * hoje" o contato em que alguém só arrumou um cargo errado.
       */
      expect(edited.lastInteractionAt.getTime()).toBe(lead.lastInteractionAt.getTime());
    });

    it('não mexe em nenhum outro contato', async () => {
      await edit({ name: 'Ana Beatriz Souza Filha' });

      expect((await leadNamed('Bruno Carvalho')).name).toBe('Bruno Carvalho');
      expect((await list('?pageSize=100')).total).toBe(VISIBLE_LEAD_COUNT);
    });
  });

  describe('a recusa', () => {
    it('devolve 404 quando o contato não existe', async () => {
      expect((await rejection({}, 404, randomUUID())).error).toBe('LeadNotFound');
    });

    it('devolve 404 quando o contato foi removido', async () => {
      const removed = harness.leads.find((record) => record.name === DELETED_LEAD_NAME);

      // Contato removido não existe para quem lê — nem para quem edita.
      expect((await rejection({}, 404, removed?.id ?? '')).error).toBe('LeadNotFound');
    });

    it('devolve 404 quando o responsável escolhido não existe', async () => {
      const body = await rejection({ ownerId: randomUUID() }, 404);

      // A mesma queixa do cadastro, pelo mesmo motivo: a tela montou o
      // `<select>` com a lista de vendedores de quando carregou.
      expect(body.error).toBe('OwnerNotFound');
      expect((await leadNamed(LEAD_NAME)).owner.id).toBe(harness.seller.id);
    });

    it('aponta o campo obrigatório em branco, e não grava nada', async () => {
      const body = await rejection({ name: '   ' }, 400);

      expect(body.error).toBe('ValidationFailed');
      expect(body.issues?.map((issue) => issue.path)).toContain('name');
      expect((await leadNamed(LEAD_NAME)).name).toBe(LEAD_NAME);
    });

    it('aponta o e-mail malformado', async () => {
      expect((await rejection({ email: 'ana.souza' }, 400)).issues?.at(0)?.path).toBe(
        'email',
      );
    });

    it('recusa um identificador que não é UUID', async () => {
      const body = await rejection({}, 400, 'o-contato-de-ontem');

      expect(body.issues?.map((issue) => issue.path)).toContain('id');
    });
  });
});

/*
 * O contrato de `DELETE /leads/:id`.
 *
 * Duas regras do spec são o que este bloco existe para provar:
 *
 * 1. **a remoção é lógica**, e o filtro que a respeita mora no repositório — um
 *    contato removido some de toda listagem, inclusive da busca que aponta
 *    direto para ele;
 * 2. **contato com negócio em aberto não é removido**, e a recusa diz quantos
 *    travam a operação. É o que impede o funil de perder dinheiro porque alguém
 *    limpou a lista de contatos.
 */
describe('DELETE /leads/:id', () => {
  /** O contato com **um** negócio em aberto: o caso do singular na recusa. */
  let blocked: LeadListItem;

  beforeEach(async () => {
    blocked = await leadNamed(LEAD_WITH_ONE_OPEN_DEAL);
  });

  /** Quantos contatos a carteira tem — o que uma recusa não pode mexer. */
  const leadCount = async (): Promise<number> => (await list('?pageSize=100')).total;

  /** Tira do caminho o único negócio em aberto do contato, encerrando-o. */
  const closeTheOpenDeal = async (): Promise<void> => {
    const deal = await read.dealNamed(harness, OPEN_DEAL_OF_THAT_LEAD);
    const response = await harness.post(`/deals/${deal.id}/close`, { result: 'WON' });

    expect(response.statusCode).toBe(200);
  };

  describe('a remoção', () => {
    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({
        method: 'DELETE',
        url: `/leads/${blocked.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('remove um contato sem negócio nenhum, e ele some da carteira', async () => {
      // Um contato cadastrado agora não tem negócio: é o "cadastrei por engano"
      // do spec, o caso mais comum da remoção.
      const created = Schema.decodeUnknownSync(LeadListItem)(
        (
          await harness.post('/leads', {
            name: 'Juliana Prado',
            company: 'Smart Fit Morumbi',
            email: 'juliana.prado@smartfitmorumbi.com.br',
            phone: '(11) 98812-4471',
            source: 'REFERRAL',
            ownerId: harness.seller.id,
          })
        ).json(),
      );

      const response = await harness.del(`/leads/${created.id}`);

      // 204: nada a devolver. O recurso deixou de existir para quem lê, e a tela
      // fecha o modal e recarrega a lista pelo servidor.
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      expect(namesIn(await list('?pageSize=100'))).not.toContain('Juliana Prado');
      expect((await list('?search=juliana')).total).toBe(0);
    });

    it('some também do link direto', async () => {
      await closeTheOpenDeal();
      await harness.del(`/leads/${blocked.id}`);

      // O filtro de remoção mora no repositório, então nenhuma rota precisa
      // lembrar dele — nem a que responde por identificador.
      expect((await harness.get(`/leads/${blocked.id}`)).statusCode).toBe(404);
    });

    it('remove um contato cujos negócios estejam todos encerrados', async () => {
      await closeTheOpenDeal();

      /*
       * Negócio encerrado é história registrada: ele não trava a limpeza da
       * carteira, porque não há oportunidade a perder — o desfecho já aconteceu.
       */
      expect((await harness.del(`/leads/${blocked.id}`)).statusCode).toBe(204);
    });

    it('não conta o negócio que já foi removido', async () => {
      const deal = await read.dealNamed(harness, OPEN_DEAL_OF_THAT_LEAD);
      expect((await harness.del(`/deals/${deal.id}`)).statusCode).toBe(204);

      // A remoção lógica vale para a contagem como vale para toda leitura: um
      // negócio apagado não existe para quem pergunta quantos travam.
      expect((await harness.del(`/leads/${blocked.id}`)).statusCode).toBe(204);
    });

    it('deixa recadastrar o mesmo e-mail depois', async () => {
      await closeTheOpenDeal();
      await harness.del(`/leads/${blocked.id}`);

      /*
       * O e-mail do Lead não é único de propósito: com remoção lógica, a linha
       * apagada continuaria ocupando o índice e travaria o recadastro do mesmo
       * contato.
       */
      const response = await harness.post('/leads', {
        name: blocked.name,
        company: 'Academia Ritmo',
        email: blocked.email,
        phone: blocked.phone,
        source: 'REFERRAL',
        ownerId: harness.seller.id,
      });

      expect(response.statusCode).toBe(201);
      expect((await list(`?search=${encodeURIComponent(blocked.email)}`)).total).toBe(1);
    });

    it('deixa o negócio encerrado dele continuar dizendo quem era o cliente', async () => {
      await closeTheOpenDeal();
      await harness.del(`/leads/${blocked.id}`);

      /*
       * O `JOIN` do card não filtra o contato removido, e é de propósito: quem
       * saiu da carteira continua sendo o cliente daquele negócio, e um card sem
       * nome esconderia justamente a informação de que ele saiu.
       */
      const deal = await read.dealNamed(harness, 'Kit de acessórios funcionais');
      expect(deal.lead.name).toBe(LEAD_WITH_ONE_OPEN_DEAL);
    });
  });

  describe('a recusa', () => {
    it('devolve 409 quando o contato tem negócio em aberto, e não remove nada', async () => {
      const before = await leadCount();
      const response = await harness.del(`/leads/${blocked.id}`);

      /*
       * 409, e não 422: o pedido é legítimo e a operação existe — o que impede é
       * o estado em que o contato está, e ele muda assim que os negócios forem
       * encerrados ou removidos.
       */
      expect(response.statusCode).toBe(409);
      expect(response.json<{ error: string }>().error).toBe('LeadHasOpenDeals');
      expect(await leadCount()).toBe(before);
    });

    it('diz quantos negócios travam a operação', async () => {
      const response = await harness.del(`/leads/${blocked.id}`);

      /*
       * A frase vem do domínio, e é a mesma que a tela mostra: sem o número,
       * quem lê não sabe se falta encerrar um negócio ou uma dúzia. Este contato
       * tem um só, então a frase precisa estar no singular.
       */
      expect(response.json<{ message: string }>().message).toBe(
        leadHasOpenDealsMessage(openDealsOfLead(LEAD_WITH_ONE_OPEN_DEAL)),
      );
    });

    it('conta no plural quando são vários', async () => {
      const busy = await leadNamed('Ana Beatriz Souza');
      const response = await harness.del(`/leads/${busy.id}`);

      expect(response.statusCode).toBe(409);
      expect(response.json<{ message: string }>().message).toBe(
        leadHasOpenDealsMessage(openDealsOfLead('Ana Beatriz Souza')),
      );
    });

    it('devolve 404 quando o contato não existe', async () => {
      const response = await harness.del(`/leads/${randomUUID()}`);

      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: string }>().error).toBe('LeadNotFound');
    });

    it('devolve 404 ao remover de novo o que já foi removido', async () => {
      await closeTheOpenDeal();
      expect((await harness.del(`/leads/${blocked.id}`)).statusCode).toBe(204);

      // Duas abas com o mesmo contato aberto, ou dois cliques: a segunda
      // remoção não encontra nada, e é isso que a tela explica.
      expect((await harness.del(`/leads/${blocked.id}`)).statusCode).toBe(404);
    });

    it('recusa um identificador que não é UUID', async () => {
      const response = await harness.del('/leads/o-contato-de-ontem');

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: string; issues: { path: string }[] }>();
      expect(body.issues.map((issue) => issue.path)).toContain('id');
    });
  });
});
