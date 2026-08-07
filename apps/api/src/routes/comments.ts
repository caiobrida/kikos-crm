import {
  Comment,
  CreateCommentInput,
  DealId,
  DealNotFound,
  DealTimeline,
  type UserId,
} from '@kikos/domain';
import { Clock, Effect, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate, requireCurrentUser } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeBody, decodeParams } from '../http/validation';
import {
  CommentRepository,
  type CommentWithAuthor,
} from '../repositories/CommentRepository';
import { DealRepository } from '../repositories/DealRepository';
import { LeadRepository } from '../repositories/LeadRepository';
import type { AppRuntime } from '../runtime';
import { requireDeal } from './deals';

/*
 * A linha do tempo de um negócio.
 *
 * Ela mora num módulo próprio, e não junto das rotas de Deal, por uma razão que
 * é de projeto e não de arrumação: **esta é a camada em que a integração de IA
 * se pluga numa fase futura**. Ler o histórico de um negócio e acrescentar um
 * registro são as duas operações que um agente precisaria, e tê-las isoladas
 * num arquivo — com um repositório próprio embaixo — é o que permite ligar isso
 * depois sem abrir o caso de uso de movimentação nem o de cadastro.
 *
 * O caminho continua sendo `/deals/:id/comments`: o registro pertence ao
 * negócio, e a URL diz isso.
 */

/** O `:id` do caminho, conferido pelo mesmo mecanismo que confere um corpo. */
const DealIdParams = Schema.Struct({ id: DealId });

/*
 * As duas rotas começam confirmando que o negócio existe (`requireDeal`, na
 * rota de Deal), e é essa pergunta que separa "este negócio não tem histórico"
 * de "este negócio não existe": sem ela, um identificador inventado devolveria
 * uma lista vazia com 200, e um comentário enviado para ele gravaria um registro
 * órfão que nenhuma tela jamais mostraria. O filtro de remoção lógica vem junto,
 * porque mora no repositório.
 */

/** A linha do tempo, do mais recente para o mais antigo. */
const readTimeline = (
  id: DealId,
): Effect.Effect<
  readonly CommentWithAuthor[],
  DealNotFound,
  DealRepository | CommentRepository
> =>
  Effect.gen(function* () {
    yield* requireDeal(id);

    const comments = yield* CommentRepository;
    return yield* comments.listByDeal(id);
  });

/**
 * Escreve um comentário no negócio.
 *
 * Três coisas acontecem juntas, e as três com **o mesmo instante**:
 *
 * 1. o registro entra na linha do tempo, assinado por quem está logado;
 * 2. a última interação do negócio avança, que é o que faz o card subir para o
 *    topo da coluna;
 * 3. a última interação do contato avança, que é o que faz a carteira mostrar
 *    atividade real em vez de um contato aparentemente parado.
 *
 * O que **não** acontece é tão deliberado quanto o que acontece: o status do
 * Lead não se mexe. A tabela do spec promove o contato quando um negócio nasce
 * e quando ele anda no funil; comentar é interação, não evento de status, e
 * sobrescrever o selo aqui apagaria o que outra ação registrou.
 *
 * **Negócio encerrado aceita comentário.** `DealAlreadyClosed` recusa o que
 * muda um negócio fechado — mover, editar, fechar de novo (ADR-0003) —, e
 * acrescentar ao histórico não muda nada do que foi registrado. Proibir seria
 * impedir alguém de anotar por que a venda foi perdida, que é justamente o que
 * se quer ler depois.
 */
const commentOnDeal = (
  id: DealId,
  input: CreateCommentInput,
  /** Quem escreveu. Vem da sessão: ninguém comenta em nome de outra pessoa. */
  author: UserId,
): Effect.Effect<
  CommentWithAuthor,
  DealNotFound,
  DealRepository | CommentRepository | LeadRepository
> =>
  Effect.gen(function* () {
    const deal = yield* requireDeal(id);

    // A hora vem do `Clock` do Effect, como no cadastro e na movimentação: é
    // serviço do runtime, e é o que um teste troca por `TestClock`.
    const now = new Date(yield* Clock.currentTimeMillis);

    const comments = yield* CommentRepository;
    const comment = yield* comments.create({
      dealId: id,
      kind: 'USER',
      body: input.body,
      authorId: author,
      createdAt: now,
    });

    const deals = yield* DealRepository;
    yield* deals.recordDealInteraction(id, now);

    /*
     * Sem `status` na interação: o selo do contato fica onde está. O campo é
     * omitido em vez de ir como `undefined` porque `exactOptionalPropertyTypes`
     * distingue as duas coisas.
     */
    const leads = yield* LeadRepository;
    yield* leads.recordLeadInteraction(deal.leadId, { at: now });

    return comment;
  });

export const registerCommentRoutes = (
  app: FastifyInstance,
  runtime: AppRuntime,
): void => {
  const run = makeRunner(runtime);
  const authenticate = makeAuthenticate(runtime);

  app.get('/deals/:id/comments', { preHandler: authenticate }, (request, reply) => {
    const program = decodeParams(DealIdParams, request.params).pipe(
      Effect.flatMap((params) => readTimeline(params.id)),
    );

    return run(reply, program, (reply, timeline) =>
      // O mesmo Schema que o app web usa para decodificar a resposta.
      reply.send(Schema.encodeSync(DealTimeline)(timeline)),
    );
  });

  app.post('/deals/:id/comments', { preHandler: authenticate }, (request, reply) => {
    const author = requireCurrentUser(request).id;

    const program = Effect.all([
      decodeParams(DealIdParams, request.params),
      decodeBody(CreateCommentInput, request.body),
    ]).pipe(Effect.flatMap(([params, input]) => commentOnDeal(params.id, input, author)));

    return run(reply, program, (reply, comment) =>
      /*
       * 201 com o registro que nasceu, no mesmo Schema da leitura. A tela não o
       * usa para desenhar o item à mão: ela invalida o cache da linha do tempo
       * — que a movimentação também invalida — e deixa o servidor devolver a
       * sequência inteira já na ordem certa.
       */
      reply.status(201).send(Schema.encodeSync(Comment)(comment)),
    );
  });
};
