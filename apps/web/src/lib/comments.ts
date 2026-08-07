import { Comment, CreateCommentInput, DealTimeline } from '@kikos/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Schema } from 'effect';
import { apiJson } from './api';
import { dealsQueryKey } from './deals';
import { leadsQueryKey } from './leads';

/*
 * A linha do tempo de um negócio.
 *
 * O módulo é pequeno de propósito: ler o histórico e acrescentar um registro
 * são as duas únicas operações que existem, e é assim que a camada de
 * comentários fica fácil de consumir mais adiante — a integração de IA se pluga
 * aqui, e não dentro do board.
 *
 * A chave mora **debaixo do prefixo de Deal**, e não numa raiz própria. Não é
 * arrumação: mover um card acrescenta um registro de sistema ao histórico, e é
 * essa herança que faz a movimentação invalidar a linha do tempo sem precisar
 * saber que ela existe.
 */
const timelineQueryKey = [...dealsQueryKey, 'comments'] as const;

/**
 * O histórico de um negócio, do mais recente para o mais antigo.
 *
 * A ordem vem do servidor, e a tela não a refaz: um `sort` no navegador seria o
 * segundo lugar em que "mais recente primeiro" estaria escrito, e o primeiro a
 * discordar do outro no dia em que dois registros caírem no mesmo instante.
 */
export const useDealTimeline = (id: string) =>
  useQuery({
    queryKey: [...timelineQueryKey, id] as const,
    queryFn: ({ signal }) => apiJson(DealTimeline, `/deals/${id}/comments`, { signal }),
  });

/**
 * Escreve um comentário no negócio.
 *
 * As duas invalidações cobrem tudo que comentar mexe, e nenhuma delas é
 * opcional:
 *
 * - **o prefixo de Deal** derruba de uma vez a linha do tempo (o registro novo),
 *   o detalhamento (a última interação) e o board (o card sobe para o topo da
 *   coluna, porque a coluna vem do mais recente para o mais antigo);
 * - **a lista de Leads**, porque a última interação do contato vinculado também
 *   avançou — esquecê-la deixaria a carteira mostrando um contato parado que
 *   acabou de ser trabalhado.
 *
 * Como a invalidação é aguardada, a mutação só termina depois que a linha do
 * tempo voltou do servidor: é o que faz o comentário "aparecer no topo assim que
 * enviado" e não um instante depois.
 *
 * **Sem escrita otimista aqui**, ao contrário do arrasto. A diferença é o gesto:
 * arrastar um card acontece na ponta do dedo e um card que só chega depois da
 * resposta parece um arrasto que não pegou; escrever um comentário termina em
 * clicar "Comentar", onde esperar o servidor é o comportamento que se espera —
 * e um registro histórico que aparece e some seria pior que meio segundo de
 * espera.
 */
export const useCreateComment = (id: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      apiJson(Comment, `/deals/${id}/comments`, {
        method: 'POST',
        // O mesmo Schema que a rota usa para ler o corpo, no caminho de volta.
        body: Schema.encodeSync(CreateCommentInput)(input),
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dealsQueryKey }),
        queryClient.invalidateQueries({ queryKey: leadsQueryKey }),
      ]),
  });
};
