import { DashboardSummary } from '@kikos/domain';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from './api';
import { dealsQueryKey } from './queryKeys';

/**
 * O panorama do funil — o que os dois gráficos do dashboard desenham.
 *
 * **A chave mora dentro da raiz de Deal**, e isso é a decisão deste módulo. O
 * dashboard é uma leitura de negócios, agregada; pendurá-lo numa raiz própria
 * obrigaria cada escrita do funil — criar, mover, encerrar, editar, remover — a
 * lembrar de derrubar mais uma chave, e o dia em que alguém esquecesse, os
 * gráficos ficariam mostrando um funil de antes. Sob `['deals']`, as
 * invalidações que já existem o alcançam sem que nenhuma delas mude.
 *
 * Sem `placeholderData`: não há recorte que mude debaixo de quem olha — não há
 * busca, filtro nem página aqui —, então a única recarga é a que vem depois de
 * uma escrita, e nessa o número **precisa** mudar.
 */
export const useDashboardSummary = () =>
  useQuery({
    queryKey: [...dealsQueryKey, 'summary'] as const,
    queryFn: ({ signal }) => apiJson(DashboardSummary, '/dashboard/summary', { signal }),
  });
