import {
  CreateLeadInput,
  LeadListItem,
  LeadListQuery,
  LeadPage,
  OwnerNotFound,
} from '@kikos/domain';
import { Clock, Effect, Option, Schema } from 'effect';
import type { FastifyInstance } from 'fastify';
import { makeAuthenticate } from '../http/authenticate';
import { makeRunner } from '../http/run';
import { decodeBody, decodeQuery } from '../http/validation';
import { LeadRepository, type LeadWithOwner } from '../repositories/LeadRepository';
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
     * A hora vem do `Clock` do Effect, e não de `new Date()`: é um serviço do
     * runtime, o que torna `lastInteractionAt` determinístico sob `TestClock`
     * sem que este código precise saber que está sendo testado.
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
      // 201 e o contato criado no corpo: é o que deixa a tela desenhar a linha
      // nova sem uma segunda ida ao servidor.
      reply.status(201).send(Schema.encodeSync(LeadListItem)(lead)),
    );
  });
};
