import {
  BOARD_COLUMN_PAGE_SIZE,
  STAGE_MOVE_REFUSALS,
  stageDrop,
  type DealBoardColumn,
  type DealListItem,
  type DealStage,
} from '@kikos/domain';
import { useState, type DragEvent } from 'react';
import { cn } from '../lib/cn';
import { useColumnPages, type BoardView } from '../lib/deals';
import { DEAL_STAGE_LABELS } from '../lib/labels';
import { Button } from '../ui/Button';
import { DealCard } from './DealCard';

/**
 * Uma coluna do board: o estágio, quantos negócios ele tem, e os cards.
 *
 * **O número do cabeçalho é o total do servidor**, não a quantidade de cards na
 * tela. É a diferença entre "a coluna tem 7 negócios, você está vendo 5" e uma
 * coluna cheia que anuncia 5 — que seria justamente onde o funil está entupido.
 *
 * Quantas páginas já foram carregadas é estado desta coluna, e de mais ninguém:
 * carregar mais em Proposta enviada não mexe nas outras quatro. Trocar o
 * recorte remonta a coluna (ver a `key` no board), o que devolve o contador de
 * páginas ao início — a página 3 de uma busca não significa nada na seguinte.
 *
 * A coluna também é o alvo do arrasto, e é aqui que a regra do funil age antes
 * de qualquer ida ao servidor: `stageDrop` — a **mesma regra** que a rota
 * consulta, lida do lado do gesto — decide o que soltar o card no ar faria
 * aqui. Uma coluna que recusa não chama `preventDefault`, e o navegador desenha
 * o cursor de "não pode" e nem chega a disparar o drop. Ela também diz por quê
 * — ou, na coluna Fechado, o que o drop vai abrir —, num aviso sobreposto que
 * não desloca o board enquanto o card está no ar.
 */
export interface BoardColumnProps {
  readonly column: DealBoardColumn;
  /** O recorte do board, que as páginas seguintes precisam repetir. */
  readonly view: BoardView;
  /** O card que está sendo arrastado neste instante, se houver algum. */
  readonly dragging: DealListItem | undefined;
  /**
   * O vendedor escolheu este estágio para este negócio — arrastando até a
   * coluna, ou pelo seletor do card.
   *
   * Não se chama `onMove` desde que Fechado deixou de recusar o drop: escolher
   * a coluna Fechado não move nada, abre a escolha entre Ganho e Perdido
   * (ADR-0003). Quem traduz a escolha em ação é o board, que é quem sabe qual
   * das duas coisas fazer.
   */
  readonly onStageChosen: (deal: DealListItem, to: DealStage) => void;
  /** Abre o resumo do negócio no painel lateral. Só atravessa a coluna. */
  readonly onOpen: (deal: DealListItem) => void;
  readonly onDragStart: (deal: DealListItem) => void;
  readonly onDragEnd: () => void;
}

export const BoardColumn = ({
  column,
  view,
  dragging,
  onStageChosen,
  onOpen,
  onDragStart,
  onDragEnd,
}: BoardColumnProps) => {
  const [loadedPages, setLoadedPages] = useState(0);
  const more = useColumnPages(column.stage, view, loadedPages);

  const deals = [...column.deals, ...more.deals];
  const remaining = column.total - deals.length;

  /*
   * Esta coluna é destino possível do card que está no ar? Soltar na coluna de
   * onde o card saiu não é movimento nenhum, e por isso também não é destino.
   */
  const isDropTarget = dragging !== undefined && dragging.stage !== column.stage;

  /**
   * O que soltar aqui faria — mover, abrir a escolha de desfecho, ou nada.
   *
   * `stageDrop` e não `refuseStageMove`: a coluna pergunta o que o **gesto**
   * faz, e desde a fatia que encerra negócios a resposta tem três formas. A
   * regra do funil não mudou — a rota de estágio continua recusando `CLOSED`
   * com 422 —; o que mudou é que esta coluna passou a aceitar o drop para abrir
   * a escolha entre Ganho e Perdido (ADR-0003).
   */
  const drop = isDropTarget ? stageDrop(dragging.stage, column.stage) : undefined;

  const accepts = drop !== undefined && drop.kind !== 'refused';

  /** O que a coluna tem a dizer sobre o card no ar: por que recusa, ou o que fará. */
  const hint =
    drop === undefined
      ? undefined
      : drop.kind === 'refused'
        ? STAGE_MOVE_REFUSALS[drop.reason]
        : drop.kind === 'close'
          ? 'Solte aqui para encerrar o negócio como ganho ou perdido.'
          : undefined;

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    /*
     * `preventDefault` é o que declara "aqui pode soltar" no arrasto nativo —
     * sem ele o drop nunca acontece. É por isso que a coluna que recusa
     * simplesmente não o chama: a recusa do frontend não é um `if` dentro do
     * drop, é a ausência do drop, e nenhuma requisição chega a ser montada.
     */
    if (!accepts) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (dragging !== undefined) onStageChosen(dragging, column.stage);
  };

  return (
    <section
      aria-label={DEAL_STAGE_LABELS[column.stage]}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'relative flex w-72 shrink-0 flex-col rounded-card bg-surface-900 ring-1 transition-colors',
        accepts ? 'ring-2 ring-brand-500 bg-surface-800/60' : 'ring-surface-800',
        // A coluna que recusa some do caminho em vez de convidar ao gesto.
        isDropTarget && !accepts ? 'opacity-50' : '',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-surface-800 px-3 py-3">
        <h2 className="text-sm font-semibold text-ink">
          {DEAL_STAGE_LABELS[column.stage]}
        </h2>

        <span className="rounded-full bg-surface-700 px-2 py-0.5 text-xs font-medium text-ink-muted">
          {column.total}
        </span>
      </header>

      {/*
        O que esta coluna tem a dizer sobre o card no ar, **dentro dela e por
        cima dela**. Os dois detalhes têm razão de ser: aqui a frase está onde o
        cursor já está, e sobreposta ela não empurra coluna nenhuma — um aviso
        que crescesse no fluxo da página deslocaria o board **no meio do
        arrasto**, e o card cairia numa coluna que não é a que o vendedor mirou.

        Ela diz duas coisas conforme o gesto: por que a coluna recusa — e aí é a
        mesma frase que a API devolveria, porque as duas saem da regra
        compartilhada — ou o que soltar aqui vai abrir, no caso da coluna
        Fechado, onde o drop não move e sim pergunta.

        `aria-hidden` porque ela dura o gesto e não sobrevive ao drop; quem não
        arrasta nunca a encontra, e o que **acontece** é anunciado pelo aviso do
        board ou pelo diálogo que abre.
      */}
      {hint === undefined ? null : (
        <p
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-3 top-14 z-10 rounded-lg px-3 py-2 text-xs',
            'bg-surface-950/95 ring-1',
            accepts
              ? 'text-brand-300 ring-brand-500/40'
              : 'text-lost-300 ring-lost-500/40',
          )}
        >
          {hint}
        </p>
      )}

      <div className="flex flex-col gap-2 p-3">
        {deals.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">Nenhum negócio aqui.</p>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onStageChosen={onStageChosen}
              onOpen={onOpen}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={dragging?.id === deal.id}
            />
          ))
        )}

        {/*
          Depois de um erro o botão vira "tentar de novo", e não "carregar
          mais": pedir a página seguinte deixaria um buraco no meio da coluna,
          justamente o que o desempate por identificador existe para evitar do
          outro lado.
        */}
        {more.isError ? (
          <>
            <p role="alert" className="text-xs text-lost-400">
              Não foi possível carregar mais negócios.
            </p>

            <Button variant="secondary" size="sm" onClick={more.retry}>
              Tentar de novo
            </Button>
          </>
        ) : remaining > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            isLoading={more.isLoading}
            onClick={() => setLoadedPages((loaded) => loaded + 1)}
          >
            {/* O número é o que este clique traz, não o que falta: o cabeçalho
                já responde "quantos existem". */}
            Carregar mais {Math.min(remaining, BOARD_COLUMN_PAGE_SIZE)}
          </Button>
        ) : null}
      </div>
    </section>
  );
};
