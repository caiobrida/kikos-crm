import { cn } from '../lib/cn';
import { formatLastInteraction } from '../lib/dates';
import { useDeal } from '../lib/deals';
import { formatBRL } from '../lib/money';
import { Avatar } from '../ui/Avatar';
import { DealResultBadge, DealStageBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Definition } from '../ui/Definition';

/*
 * O painel lateral do board: o resumo de um negócio, sem tirar o vendedor do
 * funil.
 *
 * **Ele é enxuto e só de leitura**, e as duas coisas são a mesma decisão. O
 * painel mostra título, valor, selo de estágio, o Lead, o responsável e a última
 * interação — e um botão. Nada mais: a linha do tempo, o dossiê e as ações
 * ficam no detalhamento. Como o painel não **age**, não há comportamento
 * duplicado entre ele e o modal, e não há um segundo cache para invalidar quando
 * alguém escreve. O que os dois compartilham de desenho — o par rótulo/valor —
 * é o mesmo componente (`Definition`), e não duas cópias.
 *
 * Ele **não é um `<dialog>`**, e isso também é deliberado: o board continua
 * utilizável com o painel aberto — dá para arrastar um card, buscar, trocar o
 * filtro. Um modal tornaria o resto da página inerte, que é exatamente o oposto
 * de "consultar o essencial sem sair do board". Para que isso seja verdade e não
 * só intenção, quem monta o painel afasta o board da faixa que ele ocupa (ver
 * `PANEL_WIDTH`); senão a última coluna do funil ficaria permanentemente
 * embaixo dele.
 *
 * O painel não tem endereço próprio: quem tem é o modal. Um painel na URL
 * encheria o histórico do navegador de estados intermediários, e o botão voltar
 * passaria a desfazer cliques em card em vez de fechar o detalhamento.
 */

/**
 * A largura do painel, e a folga que o board precisa deixar por baixo dele.
 *
 * As duas classes moram juntas de propósito: são o mesmo número escrito de dois
 * jeitos (`max-w-sm` são 24rem, e o board já tem 2rem de respiro de cada lado),
 * e separá-las é como a última coluna do funil acabaria escondida no dia em que
 * alguém alargasse o painel.
 */
export const PANEL_WIDTH = 'w-full max-w-sm';

/** O afastamento que o board aplica enquanto o painel está aberto. */
export const PANEL_CLEARANCE = 'sm:pr-[26rem]';

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
      className={cn(
        'fixed inset-y-0 right-0 z-20 flex flex-col border-l border-surface-700',
        'bg-surface-900 shadow-2xl',
        PANEL_WIDTH,
      )}
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
            <Definition label="Valor estimado">
              <span className="text-xl font-semibold text-brand-300">
                {formatBRL(deal.data.valueInCents)}
              </span>
            </Definition>

            <Definition label="Estágio">
              <div className="flex flex-wrap items-center gap-2">
                <DealStageBadge stage={deal.data.stage} />
                {/*
                  O desfecho ao lado do estágio, como no detalhamento e pelo
                  mesmo motivo: só quando existe. Sem ele, um negócio ganho e um
                  perdido apareceriam idênticos no painel — os dois dizendo
                  apenas "Fechado" —, e o resumo contradiria o card colorido de
                  onde a pessoa acabou de clicar.
                */}
                {deal.data.result === 'OPEN' ? null : (
                  <DealResultBadge result={deal.data.result} />
                )}
              </div>
            </Definition>

            <Definition label="Lead">
              {deal.data.lead.name}
              <span className="block text-xs text-ink-muted">
                {deal.data.lead.company}
              </span>
            </Definition>

            <Definition label="Vendedor responsável">
              <span className="flex items-center gap-2">
                <Avatar name={deal.data.owner.name} size="sm" />
                {deal.data.owner.name}
              </span>
            </Definition>

            <Definition label="Última interação">
              {formatLastInteraction(deal.data.lastInteractionAt)}
            </Definition>
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
