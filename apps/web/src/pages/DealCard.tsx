import { OPEN_DEAL_STAGES, type DealListItem, type DealStage } from '@kikos/domain';
import type { DragEvent } from 'react';
import { cn } from '../lib/cn';
import { DEAL_STAGE_LABELS } from '../lib/labels';
import { formatBRL } from '../lib/money';
import { Avatar } from '../ui/Avatar';

/**
 * Um negócio, como o card do board o mostra.
 *
 * Quatro dados e nada mais: o nome do negócio, o valor, o cliente e quem
 * responde por ele. É o que permite reconhecer a oportunidade sem abrir nada —
 * e é exatamente o que o Schema `DealListItem` carrega, para que a coluna não
 * precise buscar mais nada por card.
 *
 * O card se move por dois caminhos, e os dois chamam a mesma coisa:
 *
 * - **arrastando**, que é o gesto natural do kanban;
 * - **pelo seletor de estágio**, que é o caminho de quem usa teclado ou leitor
 *   de tela. Arrastar-e-soltar nativo não tem história de teclado nenhuma, e
 *   sem esta segunda porta a tela de Negócios ficaria inoperável para parte do
 *   time. Ele também é o que continuaria funcionando se o arrasto se mostrasse
 *   custoso.
 *
 * **O card também abre o painel lateral**, e isso se repete pelos mesmos dois
 * canais: o card inteiro é alvo de clique, porque é o alvo grande que o mouse
 * espera, e o título é um `<button>` de verdade, que é o que o teclado alcança.
 * O card não vira um `role="button"` gigante justamente porque tem um `<select>`
 * dentro — controle interativo aninhado em controle interativo confunde leitor
 * de tela e quebra a navegação por Tab. Pelo mesmo motivo o clique no seletor
 * para de subir: escolher um estágio é mover, não abrir.
 */
export interface DealCardProps {
  readonly deal: DealListItem;
  /** Leva o negócio para outra coluna — a mesma ação do arrasto e do seletor. */
  readonly onMove: (deal: DealListItem, to: DealStage) => void;
  /** Abre o resumo do negócio no painel lateral, sem sair do board. */
  readonly onOpen: (deal: DealListItem) => void;
  readonly onDragStart: (deal: DealListItem) => void;
  readonly onDragEnd: () => void;
  /** O card que está sendo arrastado neste instante, se for este. */
  readonly isDragging: boolean;
}

export const DealCard = ({
  deal,
  onMove,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
}: DealCardProps) => {
  const lead = `${deal.lead.name} · ${deal.lead.company}`;

  /** Negócio encerrado não se move — nem arrastando, nem pelo seletor. */
  const isClosed = deal.stage === 'CLOSED';

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    /*
     * O identificador vai no `dataTransfer` porque sem carga nenhuma o Firefox
     * não inicia o arrasto. Quem a tela de fato usa é o card guardado em
     * estado: durante o `dragover` o navegador esconde o conteúdo do
     * `dataTransfer` por segurança, e a coluna precisa saber de onde o card vem
     * para consultar a regra de transição antes do drop.
     */
    event.dataTransfer.setData('text/plain', deal.id);
    event.dataTransfer.effectAllowed = 'move';
    onDragStart(deal);
  };

  return (
    <article
      draggable={!isClosed}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(deal)}
      className={cn(
        'rounded-card bg-surface-800 p-3 ring-1 ring-surface-700 transition-colors',
        'hover:ring-surface-500',
        // O cursor é a única pista de que o card se arrasta antes de alguém
        // tentar; na coluna Fechado ele não aparece, porque lá não se arrasta.
        isClosed ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        // O original esmaece enquanto a cópia acompanha o ponteiro, para ficar
        // claro qual card está em movimento.
        isDragging ? 'opacity-40' : '',
      )}
    >
      <h3 className="text-sm leading-snug font-medium text-ink">
        {/*
          O título é o alvo de teclado do card. Ele não repete o clique do
          `<article>`: o evento sobe até lá e é atendido uma vez só.
        */}
        <button
          type="button"
          className="rounded text-left hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          {deal.title}
        </button>
      </h3>

      {/* O valor é o dado que faz o card ser lido de relance, e por isso vem na
          cor de ação. */}
      <p className="mt-1.5 text-sm font-semibold text-brand-300">
        {formatBRL(deal.valueInCents)}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {/* O nome inteiro fica no `title`: numa coluna estreita o corte é
            regra, não exceção. */}
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted" title={lead}>
          {lead}
        </span>

        <Avatar name={deal.owner.name} size="sm" />
      </div>

      {isClosed ? null : (
        /*
          O clique no seletor para aqui: ele é um alvo dentro do card, e escolher
          um estágio é mover, não abrir. Sem isto, cada movimentação pelo teclado
          abriria o painel junto.
        */
        <div className="mt-3" onClick={(event) => event.stopPropagation()}>
          <label htmlFor={`deal-stage-${deal.id}`} className="sr-only">
            Mover {deal.title} para outro estágio
          </label>

          {/*
            Um `<select>` cru, e não o `Select` dos formulários: aqui ele é um
            controle de ação, subordinado ao card, e não um campo a preencher.
            Só os quatro estágios abertos aparecem — "Fechado" não é destino de
            movimentação, e oferecê-lo seria oferecer um erro (ADR-0003).
          */}
          <select
            id={`deal-stage-${deal.id}`}
            value={deal.stage}
            onChange={(event) => {
              // Achar o estágio na lista, em vez de afirmar o tipo do valor
              // escolhido: o `<select>` devolve `string`, e a lista é a mesma
              // que desenhou as opções.
              const chosen = OPEN_DEAL_STAGES.find(
                (stage) => stage === event.target.value,
              );
              if (chosen !== undefined) onMove(deal, chosen);
            }}
            className={
              'w-full rounded-md bg-surface-700 px-2 py-1 text-xs text-ink-muted ' +
              'ring-1 ring-surface-600 ring-inset transition-colors hover:text-ink ' +
              'focus:ring-2 focus:ring-brand-500 focus:outline-none'
            }
          >
            {OPEN_DEAL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {DEAL_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
      )}
    </article>
  );
};
