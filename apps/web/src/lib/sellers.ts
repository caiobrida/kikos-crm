import { UserList } from '@kikos/domain';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from './api';

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
