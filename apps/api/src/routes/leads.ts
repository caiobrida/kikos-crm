import {
  CreateLeadInput,
  LeadDetail,
  LeadHasOpenDeals,
  LeadId,
  LeadListItem,
  LeadListQuery,
  LeadNotFound,
  LeadPage,
  OwnerNotFound,
  UpdateLeadInput,
  leadHasOpenDealsMessage,
} from '@kikos/domain';
import { Clock, Effect, Option, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeBody, decodeParams, decodeQuery } from '../http/validation';
import { DealRepository } from '../repositories/DealRepository';
import {
  LeadRepository,
  type LeadDetailWithOwner,
  type LeadRecord,
  type LeadWithOwner,
} from '../repositories/LeadRepository';
import { UserRepository } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/**
 * Monta a resposta paginada a partir do recorte que o repositório devolveu.
 *
 * Não há regra de negócio aqui: a consulta inteira — busca, filtro, ordenação e
 * corte da página — acontece no banco, e o que sobra para esta camada é
 * devolver, junto dos dados, em que página o recorte está e **quantos
 * registros ele tem no total**. É esse total que a tela mostra no contador; o
 * tamanho de `data` diria apenas quantas linhas couberam na página.
 */
const listLeads = (
  query: LeadListQuery,
): Effect.Effect<LeadPage, never, LeadRepository> =>
  Effect.gen(function* () {
    const leads = yield* LeadRepository;
    const slice = yield* leads.list(query);

    return {
      data: slice.data,
      page: query.page,
      pageSize: query.pageSize,
      total: slice.total,
    };
  });

/**
 * Cadastra um Lead.
 *
 * O Schema já garantiu a forma de cada campo — é o mesmo que o formulário usou
 * antes de enviar. Sobram para cá as duas coisas que só o servidor sabe:
 *
 * 1. **o responsável escolhido ainda existe?** A tela montou o `<select>` com a
 *    lista de vendedores de quando carregou, e o banco é quem tem a palavra
 *    final. Sem esta conferência a inserção falharia na chave estrangeira, o
 *    que viraria 500 em vez do 404 que a tela sabe explicar.
 * 2. **com que status e com que data o contato nasce.** "Novo, agora" é regra
 *    do CRM (ver o mapa de status no spec), não escolha de quem preenche o
 *    formulário — e por isso nenhum dos dois campos existe no Schema de entrada.
 */
const createLead = (
  input: CreateLeadInput,
): Effect.Effect<LeadWithOwner, OwnerNotFound, LeadRepository | UserRepository> =>
  Effect.gen(function* () {
    const users = yield* UserRepository;
    const owner = yield* users.findById(input.ownerId);

    if (Option.isNone(owner)) {
      return yield* Effect.fail(
        new OwnerNotFound({
          message: 'O vendedor responsável escolhido não existe mais.',
        }),
      );
    }

    /*
     * A hora vem do `Clock` do Effect, e não de `new Date()`. `Clock` é um
     * serviço do runtime, como os repositórios — a diferença é que este já vem
     * pronto na biblioteca. A consequência aparece quando uma regra passa a
     * depender do tempo de verdade (o `closedAt` de um Deal, na fatia 09):
     * quem a testa troca o relógio por `TestClock` e a data para de variar, sem
     * que este código precise saber que está sendo testado.
     */
    const now = new Date(yield* Clock.currentTimeMillis);

    const leads = yield* LeadRepository;
    return yield* leads.create({
      ...input,
      // O Schema entrega `undefined` para o campo opcional em branco; a coluna
      // do banco quer `NULL`. A tradução acontece uma vez, aqui.
      jobTitle: input.jobTitle ?? null,
      notes: input.notes ?? null,
      status: 'NEW',
      lastInteractionAt: now,
    });
  });

/**
 * O `:id` do caminho, conferido pelo mesmo mecanismo que confere um corpo.
 *
 * O identificador chega como texto vindo de fora, e é este Schema que devolve o
 * `LeadId` **com marca** — a única forma de produzir um (ver `ids.ts`). Um `id`
 * malformado vira 400 com o campo apontado, e não uma consulta ao banco.
 */
const LeadIdParams = Schema.Struct({ id: LeadId });

/**
 * O contato de identificador `id`, ou a recusa que a tela sabe explicar.
 *
 * As três rotas que agem sobre um contato pelo identificador da URL começam por
 * aqui, e é por isso que ela mora num lugar só: a frase da recusa é a mesma nas
 * três, e o filtro de remoção lógica que a produz vive uma camada abaixo, no
 * repositório.
 *
 * Devolve a linha crua, e não o detalhamento: quem chama daqui vai **escrever**,
 * e o `JOIN` do responsável seria pago à toa. Quem quer desenhar a tela usa
 * `openLead`.
 */
const requireLead = (
  id: LeadId,
): Effect.Effect<LeadRecord, LeadNotFound, LeadRepository> =>
  Effect.gen(function* () {
    const leads = yield* LeadRepository;
    const found = yield* leads.findById(id);

    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new LeadNotFound({ message: 'Este contato não existe mais.' }),
      );
    }

    return found.value;
  });

/**
 * Abre um contato — a consulta que o modal do Lead faz.
 *
 * O que ela tem de próprio em relação à linha da tabela são `jobTitle` e
 * `notes`, e é por eles que ela existe: sem eles, abrir a edição ofereceria dois
 * campos em branco que não estão em branco no banco, e salvar apagaria o que
 * alguém escreveu.
 */
const openLead = (
  id: LeadId,
): Effect.Effect<LeadDetailWithOwner, LeadNotFound, LeadRepository> =>
  Effect.gen(function* () {
    const leads = yield* LeadRepository;
    const found = yield* leads.detailById(id);

    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new LeadNotFound({ message: 'Este contato não existe mais.' }),
      );
    }

    return found.value;
  });

/**
 * Corrige o cadastro de um contato.
 *
 * As duas conferências são as mesmas do cadastro, e pelos mesmos motivos: o
 * contato ainda existe — a tabela da tela é de um instante atrás, e outra pessoa
 * pode tê-lo removido nesse meio-tempo —, e o responsável escolhido continua no
 * time.
 *
 * O que a edição **não** faz é o que vale a pena ler aqui:
 *
 * - **não mexe no selo.** O status é sincronizado pelas ações de Deal, com a
 *   regra "último evento vence"; corrigir um cadastro não é evento nenhum.
 * - **não mexe na última interação.** A lista dos acontecimentos que a avançam
 *   está no spec — criação, comentário, mudança de estágio e fechamento —, e
 *   editar não está nela. Uma carteira ordenada por última interação mostraria
 *   como "trabalhado hoje" o contato em que alguém só arrumou um cargo errado.
 *
 * Nenhum dos dois campos existe no Schema de entrada, então nem chega ao
 * domínio; nenhum dos dois existe no `LeadEdit` do repositório, então a escrita
 * também não tem como tocá-los. As duas travas dizem a mesma coisa em dois
 * níveis, e é de propósito.
 */
const updateLead = (
  id: LeadId,
  input: UpdateLeadInput,
): Effect.Effect<
  LeadWithOwner,
  LeadNotFound | OwnerNotFound,
  LeadRepository | UserRepository
> =>
  Effect.gen(function* () {
    yield* requireLead(id);

    const users = yield* UserRepository;
    const owner = yield* users.findById(input.ownerId);

    if (Option.isNone(owner)) {
      return yield* Effect.fail(
        new OwnerNotFound({
          message: 'O vendedor responsável escolhido não existe mais.',
        }),
      );
    }

    const leads = yield* LeadRepository;
    return yield* leads.update(id, {
      ...input,
      // O Schema entrega `undefined` para o campo opcional em branco; a coluna
      // do banco quer `NULL`. A tradução acontece uma vez, aqui — e é ela que
      // faz apagar o cargo na tela apagá-lo de verdade.
      jobTitle: input.jobTitle ?? null,
      notes: input.notes ?? null,
    });
  });

/**
 * Remove um contato — logicamente, gravando o momento em vez de apagar a linha.
 *
 * **A proteção que esta rota carrega é a razão de ela não ser trivial**: um
 * contato com negócio em aberto não sai da carteira, porque o funil não perde
 * oportunidade porque alguém decidiu limpar a lista. A recusa diz **quantos**
 * negócios travam a operação, que é o que permite a quem tentou decidir o que
 * fazer com eles antes.
 *
 * Em aberto quer dizer resultado `OPEN`. Negócio encerrado é história
 * registrada e não trava nada: não há oportunidade a perder, porque o desfecho
 * já aconteceu. Negócio já removido também não conta — a remoção lógica vale
 * para a contagem como vale para toda leitura.
 *
 * Os negócios do contato **não** são removidos junto, e a ausência é a decisão:
 * os que sobraram estão encerrados, e apagá-los levaria embora o histórico de
 * vendas ganhas junto com a limpeza de um cadastro. O `JOIN` do card continua
 * enxergando o contato removido de propósito (ver `detailById` no repositório de
 * Deal), então um negócio ganho continua sabendo de quem era.
 */
const removeLead = (
  id: LeadId,
): Effect.Effect<
  void,
  LeadNotFound | LeadHasOpenDeals,
  LeadRepository | DealRepository
> =>
  Effect.gen(function* () {
    yield* requireLead(id);

    const deals = yield* DealRepository;
    const openDeals = yield* deals.countOpenByLead(id);

    if (openDeals > 0) {
      return yield* Effect.fail(
        // A frase — com a contagem — vem do domínio, e é a mesma que a tela
        // mostra. Ver `leadHasOpenDealsMessage`.
        new LeadHasOpenDeals({ message: leadHasOpenDealsMessage(openDeals) }),
      );
    }

    // A hora vem do `Clock` do Effect, como nas outras escritas: é serviço do
    // runtime, e é o que um teste troca por `TestClock` para parar o tempo.
    const now = new Date(yield* Clock.currentTimeMillis);

    const leads = yield* LeadRepository;
    yield* leads.softDelete(id, now);
  });

export const registerLeadRoutes = (app: FastifyInstance, runtime: AppRuntime): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  app.get('/leads', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(LeadListQuery, request.query).pipe(
      Effect.flatMap(listLeads),
    );

    return run(reply, program, (reply, page) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(LeadPage)(page)),
    );
  });

  app.post('/leads', { preHandler: authenticate }, (request, reply) => {
    const program = decodeBody(CreateLeadInput, request.body).pipe(
      Effect.flatMap(createLead),
    );

    return run(reply, program, (reply, lead) =>
      /*
       * 201 com o recurso que nasceu — identificador e responsável resolvidos —,
       * no mesmo Schema da listagem. A tela não usa esse corpo para desenhar a
       * linha à mão: recortar a lista no navegador é justamente o que este CRM
       * não faz, então ela invalida o cache e deixa o servidor devolver a página
       * certa, já com o contato no lugar que a ordenação mandar.
       */
      reply.status(201).send(Schema.encodeSync(LeadListItem)(lead)),
    );
  });

  app.get('/leads/:id', { preHandler: authenticate }, (request, reply) => {
    const program = decodeParams(LeadIdParams, request.params).pipe(
      Effect.flatMap((params) => openLead(params.id)),
    );

    return run(reply, program, (reply, lead) =>
      // O mesmo Schema que o modal do Lead usa para decodificar.
      reply.send(Schema.encodeSync(LeadDetail)(lead)),
    );
  });

  /*
   * `PUT`, e não `PATCH`: o corpo é o contato inteiro, campo por campo, e é o
   * mesmo Schema que o cadastro usa. Não há estado intermediário em que metade
   * do contato foi salva, e a tela reusa o formulário de criação como está.
   */
  app.put('/leads/:id', { preHandler: authenticate }, (request, reply) => {
    const program = Effect.all([
      decodeParams(LeadIdParams, request.params),
      decodeBody(UpdateLeadInput, request.body),
    ]).pipe(Effect.flatMap(([params, input]) => updateLead(params.id, input)));

    return run(reply, program, (reply, lead) =>
      /*
       * 200 com o contato como a tabela o desenha, no mesmo Schema da listagem.
       * A tela não usa esse corpo para redesenhar a linha à mão: ela invalida o
       * cache e deixa o servidor devolver a página certa, já com o contato no
       * lugar que a ordenação mandar.
       */
      reply.send(Schema.encodeSync(LeadListItem)(lead)),
    );
  });

  app.delete('/leads/:id', { preHandler: authenticate }, (request, reply) => {
    const program = decodeParams(LeadIdParams, request.params).pipe(
      Effect.flatMap((params) => removeLead(params.id)),
    );

    return run(reply, program, (reply) =>
      /*
       * 204 e corpo nenhum: não há recurso a devolver — ele deixou de existir
       * para quem lê. A tela fecha o modal e recarrega a lista pelo servidor,
       * como faz depois de toda escrita.
       */
      reply.status(204).send(),
    );
  });
};
