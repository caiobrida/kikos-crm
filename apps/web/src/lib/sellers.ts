import { UserList, UserWorkloadList } from '@kikos/domain';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from './api';

/**
 * A queixa do campo de responsável quando a lista não veio.
 *
 * Vive junto da consulta que falhou, e não em cada formulário: um `<select>`
 * vazio sem explicação parece defeito da tela, e os dois cadastros do CRM
 * precisam dizer a mesma coisa sobre a mesma falha.
 */
export const SELLERS_UNAVAILABLE =
  'Não foi possível carregar os vendedores. Recarregue a página.';

/**
 * Os vendedores — quem recebe Lead e Deal, e quem o filtro de responsável
 * lista.
 *
 * Não existe tabela de vendedor (ADR-0001): "vendedor" é um User com `role`
 * igual a `SELLER`, e é por isso que a consulta é `/users?role=SELLER`.
 *
 * Não há CRUD de User no produto — o time só muda por seed. Meia hora de
 * `staleTime` evita reconsultá-lo a cada volta para a tela.
 */
export const useSellers = () =>
  useQuery({
    queryKey: ['users', 'SELLER'] as const,
    queryFn: ({ signal }) => apiJson(UserList, '/users?role=SELLER', { signal }),
    staleTime: 30 * 60 * 1000,
  });

/**
 * Os mesmos vendedores, com quantos contatos e quantos negócios em aberto estão
 * sob responsabilidade de cada um — o que a tela de Vendedores desenha.
 *
 * **Sem o `staleTime` do hook acima, e é a diferença que importa entre os dois.**
 * O time só muda por seed, então a lista pode ficar meia hora em cache; a carga
 * muda a cada contato cadastrado e a cada negócio encerrado, e um número velho
 * numa tela que existe para comparar pessoas é pior do que uma consulta a mais.
 * Com o default do React Query — dado nasce vencido —, cada volta à tela relê do
 * servidor.
 *
 * A chave fica sob `['users']`, e não sob as raízes de Lead e de Deal, porque a
 * lista é de Users. Nenhuma escrita do CRM a invalida, e não precisa: **esta
 * tela é somente leitura** (não há CRUD de User — ver ADR-0001), então não há
 * escrita acontecendo enquanto alguém olha para ela. Quem chega aqui vindo de
 * outra tela já relê por causa do parágrafo acima.
 */
export const useSellerWorkload = () =>
  useQuery({
    queryKey: ['users', 'workload', 'SELLER'] as const,
    queryFn: ({ signal }) =>
      apiJson(UserWorkloadList, '/users/workload?role=SELLER', { signal }),
  });
