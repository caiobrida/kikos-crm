import { SessionUser } from '@kikos/domain';
import { useQuery } from '@tanstack/react-query';
import { Schema } from 'effect';
import { apiJson } from './api';

const Team = Schema.Array(SessionUser);

/**
 * O time comercial — quem pode ser responsável por um Lead ou por um Deal.
 *
 * Vem inteiro, e não só os `SELLER`: o filtro de responsável precisa listar
 * quem de fato aparece na coluna, e um gestor que assumiu uma conta grande é um
 * responsável como outro qualquer (ADR-0001).
 *
 * Não há CRUD de User no produto: o time só muda por seed. Meia hora de
 * `staleTime` evita reconsultá-lo a cada volta para a tela.
 */
export const useTeam = () =>
  useQuery({
    queryKey: ['team'] as const,
    queryFn: ({ signal }) => apiJson(Team, '/users', { signal }),
    staleTime: 30 * 60 * 1000,
  });
