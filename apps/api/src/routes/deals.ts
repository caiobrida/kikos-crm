import {
  CloseDealInput,
  CreateDealInput,
  DEAL_CLOSE_REFUSALS,
  DealAlreadyClosed,
  DealBoard,
  DealBoardQuery,
  DealDetail,
  DealId,
  DealListItem,
  DealListQuery,
  DealNotFound,
  DealPage,
  InvalidStageTransition,
  LEAD_STATUS_AFTER_DEAL_CREATED,
  LeadNotFound,
  MoveDealStageInput,
  OwnerNotFound,
  STAGE_MOVE_REFUSALS,
  dealCloseRecord,
  isOpenDealStage,
  leadStatusAfterDealClosed,
  leadStatusAfterDealMoved,
  refuseDealClose,
  refuseStageMove,
  stageMoveRecord,
  type DealBoardColumn,
  type StageMoveRefusal,
  type UserId,
} from '@kikos/domain';
import { Clock, Effect, Option, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate, requireCurrentUser } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeBody, decodeParams, decodeQuery } from '../http/validation';
import { CommentRepository } from '../repositories/CommentRepository';
import {
  DealRepository,
  type DealRecord,
  type DealWithDossier,
  type DealWithRelations,
} from '../repositories/DealRepository';
import { LeadRepository } from '../repositories/LeadRepository';
import { UserRepository } from '../repositories/UserRepository';
import type { AppRuntime } from '../runtime';

/**
 * O board inteiro numa ida ao servidor.
 *
 * Paginar um kanban como "página 2 do board" não significa nada: as cinco
 * colunas são cinco recortes que o vendedor olha ao mesmo tempo. Por isso este
 * endpoint existe separado da listagem — ele devolve as cinco de uma vez, cada
 * uma com a sua primeira leva de cards e, principalmente, **com o total real da
 * coluna**. É esse total que vira o contador do cabeçalho; o tamanho de `deals`
 * diria apenas quantos cards couberam na primeira leva.
 */
const openBoard = (
  query: DealBoardQuery,
): Effect.Effect<
  { readonly columns: readonly DealBoardColumn[] },
  never,
  DealRepository
> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const columns = yield* deals.board(query);

    return { columns };
  });

/**
 * Uma página de negócios.
 *
 * Tem dois consumidores: o "carregar mais" de uma coluna cheia do board, que
 * fixa `stage` e deixa a ordenação no default, e a tabela de negócios do
 * dashboard. Como na lista de Leads, não há regra de negócio aqui — a consulta
 * inteira acontece no banco, e o que sobra é dizer em que página o recorte está
 * e quantos registros ele tem no total.
 */
const listDeals = (
  query: DealListQuery,
): Effect.Effect<DealPage, never, DealRepository> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const slice = yield* deals.list(query);

    return {
      data: slice.data,
      page: query.page,
      pageSize: query.pageSize,
      total: slice.total,
    };
  });

/**
 * Cadastra um negócio.
 *
 * O Schema já garantiu a forma de cada campo — é o mesmo que o formulário usou
 * antes de enviar. Sobram para cá as três coisas que ele não alcança:
 *
 * 1. **negócio nenhum nasce fechado.** A regra é pura e vive no pacote
 *    compartilhado, então o formulário nem oferece a opção; aqui ela recusa
 *    quem enviar por fora, com 422 — o estágio existe, o movimento é que não.
 * 2. **o Lead e o responsável escolhidos ainda existem?** A tela montou os dois
 *    campos com dados de quando carregou, e o banco é quem tem a palavra final.
 *    Sem esta conferência a inserção falharia na chave estrangeira, o que
 *    viraria 500 em vez do 404 que a tela sabe explicar.
 * 3. **o Lead vinculado passa a estar "Em contato".** O status do Lead é
 *    sincronizado pelo domínio a cada ação de Deal, com a regra "último evento
 *    vence" — é o que faz a lista de contatos e o board contarem a mesma
 *    história.
 *
 * As duas escritas não compartilham transação: cada repositório tem o seu
 * cliente, e a seam de teste está acima deles. O pior caso é um negócio criado
 * com o status do contato um passo atrás — e a próxima ação sobre o Deal o
 * corrige, porque a regra é "último evento vence", não um acumulador.
 */
const createDeal = (
  input: CreateDealInput,
): Effect.Effect<
  DealWithRelations,
  InvalidStageTransition | LeadNotFound | OwnerNotFound,
  DealRepository | LeadRepository | UserRepository
> =>
  Effect.gen(function* () {
    if (!isOpenDealStage(input.stage)) {
      return yield* Effect.fail(
        new InvalidStageTransition({
          message:
            'Um negócio não nasce fechado. Escolha um estágio em aberto — ' +
            'para encerrar, marque o negócio como ganho ou perdido.',
        }),
      );
    }

    const leads = yield* LeadRepository;
    const lead = yield* leads.findById(input.leadId);

    if (Option.isNone(lead)) {
      return yield* Effect.fail(
        new LeadNotFound({ message: 'O Lead escolhido não existe mais.' }),
      );
    }

    const users = yield* UserRepository;
    const owner = yield* users.findById(input.ownerId);

    if (Option.isNone(owner)) {
      return yield* Effect.fail(
        new OwnerNotFound({
          message: 'O vendedor responsável escolhido não existe mais.',
        }),
      );
    }

    // A hora vem do `Clock` do Effect, e não de `new Date()`: é um serviço do
    // runtime, como os repositórios, e é o que um teste troca por `TestClock`
    // quando precisa que a data pare de variar.
    const now = new Date(yield* Clock.currentTimeMillis);

    const deals = yield* DealRepository;
    const deal = yield* deals.create({
      ...input,
      // O Schema entrega `undefined` para o campo opcional em branco; a coluna
      // do banco quer `NULL`. A tradução acontece uma vez, aqui.
      description: input.description ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
      /*
       * Em aberto e sem data de fechamento — as duas nascem juntas, no
       * encerramento (ADR-0003). Nenhum dos dois campos existe no Schema de
       * entrada, então não há como o corpo da requisição escolhê-los.
       */
      result: 'OPEN',
      closedAt: null,
      lastInteractionAt: now,
    });

    yield* leads.recordLeadInteraction(input.leadId, {
      status: LEAD_STATUS_AFTER_DEAL_CREATED,
      at: now,
    });

    return deal;
  });

/**
 * O `:id` do caminho, conferido pelo mesmo mecanismo que confere um corpo.
 *
 * O identificador chega como texto vindo de fora, e é este Schema que devolve o
 * `DealId` **com marca** — a única forma de produzir um (ver `ids.ts`). Um `id`
 * malformado vira 400 com o campo apontado, e não uma consulta ao banco.
 */
const DealIdParams = Schema.Struct({ id: DealId });

/**
 * O negócio de identificador `id`, ou a recusa que a tela sabe explicar.
 *
 * Toda rota que age sobre um negócio pelo identificador da URL começa por aqui,
 * e é por isso que ela mora num lugar só: a frase da recusa é a mesma nas três,
 * e o filtro de remoção lógica que a produz vive uma camada abaixo, no
 * repositório. É exportada porque a linha do tempo (`comments.ts`) faz a mesma
 * pergunta antes de ler ou escrever — um comentário pertence a um negócio, e um
 * negócio que não existe não recebe histórico.
 *
 * Devolve a linha crua, e não o detalhamento: quem chama daqui vai **escrever**,
 * e precisa saber em que coluna o negócio está de verdade, não o dossiê do
 * cliente. Quem quer desenhar a tela usa `detailById`.
 */
export const requireDeal = (
  id: DealId,
): Effect.Effect<DealRecord, DealNotFound, DealRepository> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const found = yield* deals.findById(id);

    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new DealNotFound({ message: 'Este negócio não existe mais.' }),
      );
    }

    return found.value;
  });

/**
 * Abre um negócio — a consulta que o painel lateral e o modal compartilham.
 *
 * **Uma consulta para as duas telas, e não duas.** O painel usa a parte de cima
 * do que volta (título, valor, selo, Lead, responsável, última interação) e o
 * modal usa o resto; como a chave de cache é a mesma no navegador, abrir o
 * detalhamento a partir do painel não custa ida nenhuma ao servidor — e há um
 * cache só a invalidar quando alguém comenta.
 *
 * Não há regra de negócio aqui além da que existe em toda leitura de registro
 * pelo identificador: quem não existe — ou foi removido — não existe para quem
 * lê, e é o repositório quem aplica o filtro.
 */
const openDeal = (
  id: DealId,
): Effect.Effect<DealWithDossier, DealNotFound, DealRepository> =>
  Effect.gen(function* () {
    const deals = yield* DealRepository;
    const found = yield* deals.detailById(id);

    if (Option.isNone(found)) {
      return yield* Effect.fail(
        new DealNotFound({ message: 'Este negócio não existe mais.' }),
      );
    }

    return found.value;
  });

/** A recusa da regra pura, como o erro de domínio que a rota devolve. */
const stageMoveError = (
  refusal: StageMoveRefusal,
): InvalidStageTransition | DealAlreadyClosed => {
  /*
   * A frase é a mesma que o navegador mostra ao recusar o drop: ela vem do
   * pacote compartilhado, junto da regra. O `switch` existe só para escolher a
   * tag — e é ele que faz uma recusa nova nascida na regra quebrar o typecheck
   * aqui, em vez de escapar sem status HTTP.
   */
  const message = STAGE_MOVE_REFUSALS[refusal];

  switch (refusal) {
    case 'DealAlreadyClosed':
      return new DealAlreadyClosed({ message });
    case 'InvalidStageTransition':
      return new InvalidStageTransition({ message });
  }
};

/**
 * Move um negócio de coluna.
 *
 * **A regra que decide o movimento não é desta rota.** Ela é a mesma função
 * pura que o board consulta antes de aceitar o drop (`refuseStageMove`, no
 * pacote compartilhado), e é esse compartilhamento que garante que o card que o
 * navegador recusa é exatamente o que a API recusaria. O que sobra para cá são
 * as quatro coisas que só o servidor sabe ou pode fazer:
 *
 * 1. **o negócio ainda existe, e em que coluna ele está de verdade?** O board
 *    da tela é de um instante atrás; outra pessoa pode ter movido ou removido o
 *    card nesse meio-tempo.
 * 2. **escrever o movimento junto da última interação**, que é o que faz o card
 *    subir para o topo da coluna de destino.
 * 3. **sincronizar o contato vinculado**: o status do Lead acompanha o
 *    movimento, com a regra "último evento vence".
 * 4. **deixar o registro na linha do tempo**, para que o gestor reconstitua
 *    depois como a negociação evoluiu. É a metade que faltava desta rota: a
 *    fatia que a escreveu deixou o histórico para a que é dona da linha do
 *    tempo inteira, e é por isso que ela ganhou aqui uma dependência a mais.
 *
 * As escritas não compartilham transação, pelo mesmo motivo do cadastro: a seam
 * de teste está acima dos repositórios. O pior caso é um negócio movido com o
 * status do contato um passo atrás, e a próxima ação sobre o Deal o corrige.
 */
const moveDealStage = (
  id: DealId,
  input: MoveDealStageInput,
  /** Quem arrastou o card: é essa pessoa que assina o registro de sistema. */
  actor: UserId,
): Effect.Effect<
  DealWithRelations,
  DealNotFound | InvalidStageTransition | DealAlreadyClosed,
  DealRepository | LeadRepository | CommentRepository
> =>
  Effect.gen(function* () {
    const deal = yield* requireDeal(id);
    const refusal = refuseStageMove(deal.stage, input.stage);

    if (refusal !== undefined) return yield* Effect.fail(stageMoveError(refusal));

    /*
     * O destino é um dos quatro abertos — é o que a regra acabou de garantir —,
     * mas o compilador não acompanha essa dedução através da recusa. O type
     * guard o diz de novo, e o `else` é inalcançável: o próprio
     * `refuseStageMove` já teria recusado.
     */
    if (!isOpenDealStage(input.stage)) {
      return yield* Effect.fail(stageMoveError('InvalidStageTransition'));
    }

    // A hora vem do `Clock` do Effect, como no cadastro: é serviço do runtime, e
    // é o que um teste troca por `TestClock` quando precisa parar o tempo.
    const now = new Date(yield* Clock.currentTimeMillis);

    const deals = yield* DealRepository;
    const moved = yield* deals.moveToStage(id, { stage: input.stage, at: now });

    /*
     * O registro de sistema, com o **mesmo** `now` do movimento: o item no topo
     * da linha do tempo e o card no topo da coluna descrevem o mesmo instante.
     *
     * Só quando o estágio muda de verdade. `PATCH` com o estágio atual é
     * idempotente — a regra o deixa passar de propósito —, e registrar "estágio
     * alterado de Novo para Novo" encheria o histórico de ruído que ninguém
     * pode apagar depois.
     */
    if (deal.stage !== input.stage) {
      const comments = yield* CommentRepository;
      yield* comments.create({
        dealId: id,
        kind: 'SYSTEM',
        body: stageMoveRecord(deal.stage, input.stage),
        authorId: actor,
        createdAt: now,
      });
    }

    /*
     * O contato é sincronizado em toda movimentação, mas nem toda movimentação
     * mexe no selo: a regra devolve `undefined` quando o estágio de destino não
     * é evento de status, e aí só a data anda. O campo é omitido em vez de ir
     * como `undefined` porque `exactOptionalPropertyTypes` distingue as duas
     * coisas — e aqui a distinção é justamente a que importa.
     */
    const status = leadStatusAfterDealMoved(input.stage);

    const leads = yield* LeadRepository;
    yield* leads.recordLeadInteraction(deal.leadId, {
      at: now,
      ...(status === undefined ? {} : { status }),
    });

    return moved;
  });

/**
 * Encerra um negócio como ganho ou perdido.
 *
 * **É a única ação do CRM que tira um negócio do funil**, e a decisão que ela
 * carrega é de ADR-0003: resultado, data de fechamento e estágio são preenchidos
 * numa operação só, e não em dois passos que o vendedor faz na mão. É isso que
 * torna inalcançável o estado "estágio Fechado com resultado em aberto" — e é
 * essa impossibilidade que permite à coluna Fechado sempre saber pintar cada
 * card de verde ou vermelho.
 *
 * O caso de uso é o irmão de `moveDealStage`, e a simetria é deliberada:
 *
 * 1. **o negócio ainda existe, e ele já terminou?** A regra pura
 *    (`refuseDealClose`) é a mesma que a tela consulta antes de oferecer os
 *    botões, e é ela que recusa encerrar duas vezes — com 409, porque o que
 *    impede não é o pedido, é o desfecho já registrado.
 * 2. **escrever o desfecho junto da última interação**, numa escrita só.
 * 3. **sincronizar o contato vinculado**: aqui o status **sempre** muda, ao
 *    contrário da movimentação — encerrar é o evento mais forte que existe sobre
 *    o relacionamento, e por isso `leadStatusAfterDealClosed` devolve um status
 *    e não um `undefined`.
 * 4. **deixar o registro na linha do tempo**, para que o gestor leia depois como
 *    a negociação terminou. Um registro só: a mudança de estágio é parte do
 *    encerramento, não um segundo acontecimento.
 *
 * As escritas não compartilham transação, pelo mesmo motivo do cadastro e da
 * movimentação: a seam de teste está acima dos repositórios. O pior caso é um
 * negócio encerrado com o selo do contato um passo atrás — e o contato já não
 * tem, por esse negócio, ação seguinte que o corrija, o que é o preço conhecido
 * dessa escolha em toda a fatia.
 */
const closeDeal = (
  id: DealId,
  input: CloseDealInput,
  /** Quem encerrou: é essa pessoa que assina o registro de sistema. */
  actor: UserId,
): Effect.Effect<
  DealWithRelations,
  DealNotFound | DealAlreadyClosed,
  DealRepository | LeadRepository | CommentRepository
> =>
  Effect.gen(function* () {
    const deal = yield* requireDeal(id);

    if (refuseDealClose(deal.stage) !== undefined) {
      /*
       * A frase vem do pacote compartilhado, junto da regra, como a das
       * recusas de movimento: a explicação que o navegador mostra e a que a API
       * devolve no corpo do 409 são a mesma.
       */
      return yield* Effect.fail(
        new DealAlreadyClosed({ message: DEAL_CLOSE_REFUSALS.DealAlreadyClosed }),
      );
    }

    // A hora vem do `Clock` do Effect, como nas outras escritas: é serviço do
    // runtime, e é o que um teste troca por `TestClock` para parar o tempo.
    const now = new Date(yield* Clock.currentTimeMillis);

    const deals = yield* DealRepository;
    const closed = yield* deals.close(id, { result: input.result, at: now });

    // O registro com o **mesmo** `now` do encerramento: o item no topo da linha
    // do tempo e a data de fechamento descrevem o mesmo instante.
    const comments = yield* CommentRepository;
    yield* comments.create({
      dealId: id,
      kind: 'SYSTEM',
      body: dealCloseRecord(input.result),
      authorId: actor,
      createdAt: now,
    });

    /*
     * Sem `undefined` possível aqui, ao contrário da movimentação: o selo do
     * contato sempre acompanha o desfecho do negócio, com a regra "último
     * evento vence".
     */
    const leads = yield* LeadRepository;
    yield* leads.recordLeadInteraction(deal.leadId, {
      status: leadStatusAfterDealClosed(input.result),
      at: now,
    });

    return closed;
  });

export const registerDealRoutes = (app: FastifyInstance, runtime: AppRuntime): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  /*
   * Registrado antes de `/deals/:id`: no Fastify a rota estática vence a
   * paramétrica independentemente da ordem, mas ler as duas na ordem em que são
   * resolvidas evita a dúvida.
   */
  app.get('/deals/board', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(DealBoardQuery, request.query).pipe(
      Effect.flatMap(openBoard),
    );

    return run(reply, program, (reply, board) =>
      reply.send(Schema.encodeSync(DealBoard)(board)),
    );
  });

  app.get('/deals', { preHandler: authenticate }, (request, reply) => {
    const program = decodeQuery(DealListQuery, request.query).pipe(
      Effect.flatMap(listDeals),
    );

    return run(reply, program, (reply, page) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(DealPage)(page)),
    );
  });

  app.get('/deals/:id', { preHandler: authenticate }, (request, reply) => {
    const program = decodeParams(DealIdParams, request.params).pipe(
      Effect.flatMap((params) => openDeal(params.id)),
    );

    return run(reply, program, (reply, deal) =>
      // O mesmo Schema que o painel lateral e o modal usam para decodificar.
      reply.send(Schema.encodeSync(DealDetail)(deal)),
    );
  });

  app.post('/deals', { preHandler: authenticate }, (request, reply) => {
    const program = decodeBody(CreateDealInput, request.body).pipe(
      Effect.flatMap(createDeal),
    );

    return run(reply, program, (reply, deal) =>
      /*
       * 201 com o card que nasceu, no mesmo Schema do board. A tela não o usa
       * para desenhar a coluna à mão: recortar no navegador é justamente o que
       * este CRM não faz, então ela invalida o cache e deixa o servidor devolver
       * o funil já com o negócio na coluna certa.
       */
      reply.status(201).send(Schema.encodeSync(DealListItem)(deal)),
    );
  });

  /*
   * `PATCH`, e não `PUT`: o corpo é a coluna de destino, não o negócio inteiro.
   * Mover é uma ação sobre um registro que já existe, e o sub-recurso no
   * caminho (`/stage`) é o que deixa a rota de edição livre para receber o
   * formulário completo na fatia que a implementa.
   */
  /*
   * `POST`, e não `PATCH`: encerrar não é editar um campo do negócio, é uma
   * ação que acontece uma vez e muda três colunas juntas. O sub-recurso no
   * caminho (`/close`) diz isso — e o verbo diz que ela não é idempotente, ao
   * contrário do movimento: pedi-la duas vezes é justamente o 409.
   */
  app.post('/deals/:id/close', { preHandler: authenticate }, (request, reply) => {
    // Quem encerra assina o registro de sistema, como quem move.
    const actor = requireCurrentUser(request).id;

    const program = Effect.all([
      decodeParams(DealIdParams, request.params),
      decodeBody(CloseDealInput, request.body),
    ]).pipe(Effect.flatMap(([params, input]) => closeDeal(params.id, input, actor)));

    return run(reply, program, (reply, deal) =>
      /*
       * 200, e não 201: nada nasceu — um negócio que já existia terminou. O
       * card volta no mesmo Schema do board, agora com o desfecho que pinta a
       * coluna Fechado; a tela invalida o cache e deixa o servidor devolver o
       * funil já com o card na coluna certa.
       */
      reply.send(Schema.encodeSync(DealListItem)(deal)),
    );
  });

  app.patch('/deals/:id/stage', { preHandler: authenticate }, (request, reply) => {
    // Quem move assina o registro de sistema. O `preHandler` acima é o que
    // garante que a sessão existe; `requireCurrentUser` transforma essa garantia
    // em um tipo não-nulável.
    const actor = requireCurrentUser(request).id;

    const program = Effect.all([
      decodeParams(DealIdParams, request.params),
      decodeBody(MoveDealStageInput, request.body),
    ]).pipe(Effect.flatMap(([params, input]) => moveDealStage(params.id, input, actor)));

    return run(reply, program, (reply, deal) =>
      /*
       * O card no mesmo Schema do board. A tela não o usa para redesenhar a
       * coluna à mão — ela já mostrou o movimento no instante do gesto e
       * invalida o cache depois; o corpo é o que confirma o que o servidor de
       * fato registrou.
       */
      reply.send(Schema.encodeSync(DealListItem)(deal)),
    );
  });
};
