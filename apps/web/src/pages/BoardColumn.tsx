import {
  BOARD_COLUMN_PAGE_SIZE,
  STAGE_MOVE_REFUSALS,
  refuseStageMove,
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
 * de qualquer ida ao servidor: `refuseStageMove` — a **mesma função** que a
 * rota consulta — decide se este estágio aceita o card que está no ar. Uma
 * coluna que recusa não chama `preventDefault`, e o navegador desenha o cursor
 * de "não pode" e nem chega a disparar o drop. Ela também diz por quê, num
 * aviso sobreposto que não desloca o board enquanto o card está no ar.
 */
export interface BoardColumnProps {
  readonly column: DealBoardColumn;
  /** O recorte do board, que as páginas seguintes precisam repetir. */
  readonly view: BoardView;
  /** O card que está sendo arrastado neste instante, se houver algum. */
  readonly dragging: DealListItem | undefined;
  readonly onMove: (deal: DealListItem, to: DealStage) => void;
  readonly onDragStart: (deal: DealListItem) => void;
  readonly onDragEnd: () => void;
}

export const BoardColumn = ({
  column,
  view,
  dragging,
  onMove,
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

  /** Por que esta coluna recusa o card no ar, ou `undefined` se ela o aceita. */
  const refusal = isDropTarget
    ? refuseStageMove(dragging.stage, column.stage)
    : undefined;

  const accepts = isDropTarget && refusal === undefined;

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
    if (dragging !== undefined) onMove(dragging, column.stage);
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
        O motivo da recusa, **dentro da coluna que recusa e por cima dela**. Os
        dois detalhes têm razão de ser: aqui a frase está onde o cursor já está,
        e sobreposta ela não empurra coluna nenhuma — um aviso que crescesse no
        fluxo da página deslocaria o board **no meio do arrasto**, e o card
        cairia numa coluna que não é a que o vendedor mirou.

        A frase é a mesma que a API devolveria, porque as duas saem da regra
        compartilhada. `aria-hidden` porque ela dura o gesto e não sobrevive ao
        drop; quem não arrasta nunca a encontra, e a recusa que **acontece** é
        anunciada pelo aviso do board.
      */}
      {refusal === undefined ? null : (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-14 z-10 rounded-lg bg-surface-950/95 px-3 py-2 text-xs text-lost-300 ring-1 ring-lost-500/40"
        >
          {STAGE_MOVE_REFUSALS[refusal]}
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
              onMove={onMove}
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
