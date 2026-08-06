import { BOARD_COLUMN_PAGE_SIZE, type DealBoardColumn } from '@kikos/domain';
import { useState } from 'react';
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
 */
export interface BoardColumnProps {
  readonly column: DealBoardColumn;
  /** O recorte do board, que as páginas seguintes precisam repetir. */
  readonly view: BoardView;
}

export const BoardColumn = ({ column, view }: BoardColumnProps) => {
  const [loadedPages, setLoadedPages] = useState(0);
  const more = useColumnPages(column.stage, view, loadedPages);

  const deals = [...column.deals, ...more.deals];
  const remaining = column.total - deals.length;

  return (
    <section
      aria-label={DEAL_STAGE_LABELS[column.stage]}
      className="flex w-72 shrink-0 flex-col rounded-card bg-surface-900 ring-1 ring-surface-800"
    >
      <header className="flex items-center justify-between gap-2 border-b border-surface-800 px-3 py-3">
        <h2 className="text-sm font-semibold text-ink">
          {DEAL_STAGE_LABELS[column.stage]}
        </h2>

        <span className="rounded-full bg-surface-700 px-2 py-0.5 text-xs font-medium text-ink-muted">
          {column.total}
        </span>
      </header>

      <div className="flex flex-col gap-2 p-3">
        {deals.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-faint">Nenhum negócio aqui.</p>
        ) : (
          deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
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
