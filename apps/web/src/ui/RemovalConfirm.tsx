import { Button } from './Button';

/*
 * A confirmação de remoção, **em linha no rodapé do modal**.
 *
 * Não é um segundo modal, e essa é a decisão: no produto não há modal sobre modal
 * (ver o spec). Um diálogo por cima do diálogo empilharia dois `<dialog>` na top
 * layer, prenderia o foco no de cima e esconderia justamente o registro sobre o
 * qual se está decidindo — que é o que a pessoa precisa reler antes de confirmar.
 * Aqui o conteúdo continua na tela e o rodapé troca de conteúdo.
 *
 * Ela é a mesma peça nos dois modais — o do contato e o do negócio — porque é a
 * mesma decisão, com as mesmas duas saídas. O que muda entre eles é o texto, e é
 * só isso que vem por prop.
 *
 * **A recusa mora aqui junto da pergunta**, e não num aviso lá em cima: a
 * recusa mais comum desta tela é a que explica quantos negócios travam a remoção
 * de um contato, e ela responde exatamente ao botão que acabou de ser clicado.
 */

export interface RemovalConfirmProps {
  /** O que se está prestes a remover, dito em uma frase. */
  readonly question: string;
  /** O rótulo do botão que confirma — nomeia o que sai, não "OK". */
  readonly confirmLabel: string;
  readonly isPending: boolean;
  /** O motivo de o servidor ter recusado, quando recusou. */
  readonly error?: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export const RemovalConfirm = ({
  question,
  confirmLabel,
  isPending,
  error,
  onCancel,
  onConfirm,
}: RemovalConfirmProps) => (
  <>
    <div className="mr-auto text-sm">
      <p className="text-ink">{question}</p>

      {error === undefined ? null : (
        // `role="alert"` porque a frase responde a um clique que acabou de
        // acontecer: quem usa leitor de tela precisa ouvir por que nada saiu.
        <p role="alert" className="mt-1 text-lost-300">
          {error}
        </p>
      )}
    </div>

    <Button variant="secondary" onClick={onCancel}>
      Cancelar
    </Button>

    {/* `danger`, e não `lost`: o tom carrega o significado, e este é o único
        botão do CRM que de fato destrói alguma coisa (ver `Button.tsx`). */}
    <Button variant="danger" isLoading={isPending} onClick={onConfirm}>
      {confirmLabel}
    </Button>
  </>
);
