import { CLOSED_DEAL_RESULTS, type ClosedDealResult } from '@kikos/domain';
import { ApiError } from '../lib/api';
import { useCloseDeal } from '../lib/deals';
import { DEAL_RESULT_LABELS } from '../lib/labels';
import { Button } from '../ui/Button';

/*
 * Os dois botões que encerram um negócio.
 *
 * Eles aparecem em dois lugares — o rodapé do detalhamento e o diálogo que o
 * arrasto para a coluna Fechado abre —, e são o mesmo componente porque são a
 * mesma decisão: escolher entre Ganho e Perdido. Duplicá-los abriria a porta
 * para os dois caminhos divergirem em rótulo, em cor ou em o que fazem com a
 * recusa do servidor.
 *
 * **A escolha é sempre explícita, e sempre entre dois.** Não há um botão
 * "Encerrar" que pergunte depois, nem um `<select>` de desfecho: encerrar sem
 * dizer como não é uma operação que exista (ADR-0003), e é por isso que os
 * rótulos saem de `CLOSED_DEAL_RESULTS` — a lista que também define o que a API
 * aceita no corpo.
 *
 * **A recusa não mora aqui.** Quem encerrou pode ficar sem lugar para lê-la:
 * quando o servidor responde 409 — outra pessoa encerrou o negócio primeiro —,
 * a invalidação traz o negócio já fechado e estes botões deixam de existir. Por
 * isso a frase sobe para quem monta: no board ela vai para o aviso que já
 * explica o card que voltou, e no detalhamento ela fica no rodapé, ao lado do
 * desfecho que passou a valer.
 */

/** O que a recusa do servidor tem a dizer para quem clicou. */
const closeFailure = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : 'Não foi possível falar com o servidor. O negócio não foi encerrado.';

/** O tom de cada desfecho, o mesmo do selo e do card: ganho verde, perdido vermelho. */
const RESULT_VARIANTS = { WON: 'won', LOST: 'lost' } as const satisfies Record<
  ClosedDealResult,
  string
>;

export interface CloseDealActionsProps {
  readonly dealId: string;
  /** Chamado quando o servidor confirmou o encerramento. */
  readonly onClosed: () => void;
  /** Chamado quando o servidor recusou, com a frase pronta para a tela. */
  readonly onRefused: (message: string) => void;
}

export const CloseDealActions = ({
  dealId,
  onClosed,
  onRefused,
}: CloseDealActionsProps) => {
  const close = useCloseDeal(dealId);

  return (
    <div className="flex flex-wrap gap-2">
      {CLOSED_DEAL_RESULTS.map((result) => (
        <Button
          key={result}
          variant={RESULT_VARIANTS[result]}
          /* O giro fica no botão que foi clicado, e o outro só desabilita: a
             pessoa precisa ver qual desfecho está sendo registrado. */
          isLoading={close.isPending && close.variables?.result === result}
          disabled={close.isPending}
          onClick={() =>
            close.mutate(
              { result },
              {
                onSuccess: () => onClosed(),
                onError: (error) => onRefused(closeFailure(error)),
              },
            )
          }
        >
          Marcar como {DEAL_RESULT_LABELS[result]}
        </Button>
      ))}
    </div>
  );
};
