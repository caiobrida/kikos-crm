import type { DealListItem } from '@kikos/domain';
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
 * O card ainda não é clicável: o painel lateral e o detalhamento chegam na
 * fatia que os desenha.
 */
export const DealCard = ({ deal }: { readonly deal: DealListItem }) => {
  const lead = `${deal.lead.name} · ${deal.lead.company}`;

  return (
    <article className="rounded-card bg-surface-800 p-3 ring-1 ring-surface-700">
      <h3 className="text-sm leading-snug font-medium text-ink">{deal.title}</h3>

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
    </article>
  );
};
