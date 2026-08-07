import type { DealListItem } from '@kikos/domain';
import { formatBRL } from '../lib/money';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { CloseDealActions } from './CloseDealActions';

/*
 * A escolha que soltar um card na coluna Fechado abre.
 *
 * **Arrastar para Fechado não move nada** (ADR-0003): o gesto não é uma
 * movimentação a que faltou confirmação, é o começo de uma decisão que só existe
 * em duas formas. Este diálogo é onde ela acontece — e é a razão de a coluna
 * Fechado ter deixado de recusar o drop nesta fatia sem que a regra do funil
 * mudasse uma linha.
 *
 * Ele repete o negócio no cabeçalho de propósito. Um diálogo que perguntasse
 * "Ganho ou Perdido?" logo depois de um arrasto, sem dizer sobre o quê, obrigaria
 * quem soltou o card errado a fechar e conferir; encerrar é a ação menos
 * reversível do CRM, e reabrir negócio não existe.
 *
 * Não há botão "Encerrar" além dos dois: a escolha do desfecho *é* a
 * confirmação, e um terceiro passo só faria a pessoa clicar duas vezes na mesma
 * decisão.
 */

export interface CloseDealModalProps {
  /** O card que foi solto na coluna Fechado — é dele que sai o cabeçalho. */
  readonly deal: DealListItem;
  readonly onClose: () => void;
  /** O negócio foi encerrado: o diálogo sai e o board já mostra o card fechado. */
  readonly onClosed: () => void;
  /** O servidor recusou: o motivo sobe para o aviso do board. */
  readonly onRefused: (message: string) => void;
}

export const CloseDealModal = ({
  deal,
  onClose,
  onClosed,
  onRefused,
}: CloseDealModalProps) => (
  <Modal
    open
    onClose={onClose}
    title="Encerrar negócio"
    description={`${deal.title} · ${formatBRL(deal.valueInCents)}`}
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>

        <CloseDealActions dealId={deal.id} onClosed={onClosed} onRefused={onRefused} />
      </>
    }
  >
    <p className="text-sm text-ink-muted">
      O negócio vai para a coluna Fechado com a data de hoje, e{' '}
      <span className="font-medium text-ink">{deal.lead.name}</span> passa a Ganho ou
      Perdido na lista de contatos.
    </p>

    {/* O aviso é o que separa esta ação das outras do board: as demais se
        desfazem arrastando de volta, e esta não. Dizê-lo antes é mais barato
        que descobrir depois. */}
    <p className="mt-3 text-sm text-ink-faint">
      Negócio encerrado não volta ao funil: ele não se move, não se edita e não se encerra
      de novo.
    </p>
  </Modal>
);
