import { Effect, Layer, Ref } from 'effect';
import {
  DealRepository,
  DealRepositoryInMemory,
  type DealRecord,
} from './DealRepository';
import {
  LeadRepository,
  LeadRepositoryInMemory,
  type LeadRecord,
} from './LeadRepository';
import {
  UserRepository,
  UserRepositoryInMemory,
  type UserRecord,
} from './UserRepository';

/**
 * Os três repositórios em memória, sobre **um estado só**.
 *
 * É o duble que os testes de API usam no lugar do Prisma — a única substituição
 * do projeto. Abaixo dele roda tudo: rotas, Schema, autenticação e mapa de
 * erro; acima, só sobra o banco.
 *
 * O que este módulo acrescenta às Layers individuais é o que o banco dá de
 * graça: **um mundo compartilhado**. Os `Ref` de Lead e de Deal são criados
 * aqui e entregues a quem os lê e a quem os escreve, então um contato
 * cadastrado agora já existe para o negócio que o vincula em seguida — como
 * aconteceria com duas tabelas do mesmo Postgres. Fossem dois estados
 * separados, o duble mentiria justamente no caminho que esta fatia inteira
 * percorre.
 *
 * `Layer.unwrapEffect` constrói a Layer **a partir de** um Effect — em
 * TypeScript comum seria uma função que faz um preparo antes de devolver o
 * objeto pronto. O preparo aqui é criar os `Ref`, e ele acontece uma vez, quando
 * o runtime é montado, e não a cada serviço pedido.
 */
export const InMemoryRepositories = (data: {
  readonly users: readonly UserRecord[];
  readonly leads: readonly LeadRecord[];
  readonly deals: readonly DealRecord[];
}): Layer.Layer<UserRepository | LeadRepository | DealRepository> =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const leads = yield* Ref.make(data.leads);
      const deals = yield* Ref.make(data.deals);

      /*
       * `Layer.mergeAll` compõe os três do mesmo jeito que a produção compõe os
       * de Prisma. Os Users vão por valor: o CRM não cadastra conta, então não
       * há escrita para compartilhar.
       */
      return Layer.mergeAll(
        UserRepositoryInMemory(data.users),
        LeadRepositoryInMemory(leads, data.users),
        DealRepositoryInMemory(deals, leads, data.users),
      );
    }),
  );
