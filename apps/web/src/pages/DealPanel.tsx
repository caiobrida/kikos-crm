import { formatLastInteraction } from '../lib/dates';
import { useDeal } from '../lib/deals';
import { formatBRL } from '../lib/money';
import { Avatar } from '../ui/Avatar';
import { DealStageBadge } from '../ui/Badge';
import { Button } from '../ui/Button';

/*
 * O painel lateral do board: o resumo de um negócio, sem tirar o vendedor do
 * funil.
 *
 * **Ele é enxuto e só de leitura**, e as duas coisas são a mesma decisão. O
 * painel mostra título, valor, selo de estágio, o Lead, o responsável e a última
 * interação — e um botão. Nada mais: a linha do tempo, o dossiê e as ações
 * ficam no detalhamento. Como o painel não age, não há lógica duplicada entre
 * ele e o modal, e não há um segundo cache para invalidar quando alguém escreve.
 *
 * Ele **não é um `<dialog>`**, e isso também é deliberado: o board continua
 * utilizável com o painel aberto — dá para arrastar um card, buscar, trocar o
 * filtro. Um modal tornaria o resto da página inerte, que é exatamente o oposto
 * de "consultar o essencial sem sair do board".
 *
 * O painel não tem endereço próprio: quem tem é o modal. Um painel na URL
 * encheria o histórico do navegador de estados intermediários, e o botão voltar
 * passaria a desfazer cliques em card em vez de fechar o detalhamento.
 */

export interface DealPanelProps {
  readonly dealId: string;
  readonly onClose: () => void;
  /** Abre o detalhamento — que é uma navegação, e por isso vem de fora. */
  readonly onOpenDetail: () => void;
}

export const DealPanel = ({ dealId, onClose, onOpenDetail }: DealPanelProps) => {
  // A **mesma** consulta que o modal faz, com a mesma chave: o detalhamento
  // abre com os dados já em mãos.
  const deal = useDeal(dealId);

  return (
    <aside
      aria-label="Resumo do negócio"
      className={
        'fixed inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l ' +
        'border-surface-700 bg-surface-900 shadow-2xl'
      }
    >
      <header className="flex items-start justify-between gap-4 border-b border-surface-700 px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">
          {deal.data?.title ?? 'Negócio'}
        </h2>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar o resumo"
          className="-mr-2 rounded-lg px-2 py-1 text-xl leading-none text-ink-muted transition-colors hover:bg-surface-800 hover:text-ink"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {deal.isError ? (
          <p role="alert" className="text-sm text-lost-400">
            Não foi possível carregar este negócio.
          </p>
        ) : deal.data === undefined ? (
          <p className="text-sm text-ink-faint">Carregando…</p>
        ) : (
          <dl className="flex flex-col gap-5">
            <div>
              <dt className="text-xs text-ink-faint">Valor estimado</dt>
              <dd className="mt-0.5 text-xl font-semibold text-brand-300">
                {formatBRL(deal.data.valueInCents)}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-faint">Estágio</dt>
              <dd className="mt-1">
                <DealStageBadge stage={deal.data.stage} />
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-faint">Lead</dt>
              <dd className="mt-0.5 text-sm text-ink">
                {deal.data.lead.name}
                <span className="block text-xs text-ink-muted">
                  {deal.data.lead.company}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-faint">Vendedor responsável</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-ink">
                <Avatar name={deal.data.owner.name} size="sm" />
                {deal.data.owner.name}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-faint">Última interação</dt>
              <dd className="mt-0.5 text-sm text-ink">
                {formatLastInteraction(deal.data.lastInteractionAt)}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <footer className="border-t border-surface-700 px-5 py-4">
        <Button
          className="w-full"
          onClick={onOpenDetail}
          // Sem negócio carregado não há o que abrir — e o endereço do
          // detalhamento é o do negócio.
          disabled={deal.data === undefined}
        >
          Ver detalhamento
        </Button>
      </footer>
    </aside>
  );
};
