import type { DealDetail } from '@kikos/domain';
import { ApiError } from '../lib/api';
import { formatDay, formatLastInteraction } from '../lib/dates';
import { useDeal } from '../lib/deals';
import { formatBRL } from '../lib/money';
import { Avatar } from '../ui/Avatar';
import { DealResultBadge, DealStageBadge } from '../ui/Badge';
import { Definition, NotInformed } from '../ui/Definition';
import { Modal } from '../ui/Modal';
import { DealTimelineSection } from './DealTimelineSection';

/*
 * O detalhamento de um negócio: os dados, o dossiê do cliente e a linha do
 * tempo, num modal quase de tela cheia.
 *
 * **Ele tem endereço próprio**, e é isso que o separa de um improviso: a rota
 * `/negocios/:dealId` renderiza o board com este modal por cima. Recarregar a
 * página mantém o modal aberto, o botão voltar do navegador o fecha e devolve ao
 * funil, e o link pode ser mandado a um colega — três comportamentos que quem
 * usa a web já espera, e que um modal guardado só em estado de componente não
 * tem como oferecer.
 *
 * A consulta é **a mesma do painel lateral** (`useDeal`), com a mesma chave de
 * cache: abrir o detalhamento a partir do painel não custa ida ao servidor, e há
 * um cache só a invalidar quando alguém comenta.
 *
 * Esta fatia é só leitura mais o comentário. Marcar Ganho ou Perdido, editar e
 * remover chegam nas fatias seguintes — e chegam **dentro deste modal**, que é o
 * motivo de o rodapé nascer vazio em vez de não existir.
 */

const DealFacts = ({ deal }: { readonly deal: DealDetail }) => (
  <section>
    <h3 className="text-sm font-semibold text-ink">Dados do negócio</h3>

    <dl className="mt-3 grid gap-4 sm:grid-cols-2">
      <Definition label="Valor estimado">
        <span className="text-base font-semibold text-brand-300">
          {formatBRL(deal.valueInCents)}
        </span>
      </Definition>

      <Definition label="Estágio">
        <div className="flex flex-wrap items-center gap-2">
          <DealStageBadge stage={deal.stage} />
          {/*
            O resultado só aparece quando existe: um selo "Em aberto" ao lado do
            estágio em todo negócio do funil seria ruído — em aberto é o normal.
            Estágio e resultado são dimensões ortogonais (ADR-0003), e é por isso
            que os dois cabem lado a lado quando o negócio termina.
          */}
          {deal.result === 'OPEN' ? null : <DealResultBadge result={deal.result} />}
        </div>
      </Definition>

      <Definition label="Vendedor responsável">
        <span className="flex items-center gap-2">
          <Avatar name={deal.owner.name} size="sm" />
          {deal.owner.name}
        </span>
      </Definition>

      <Definition label="Última interação">
        {formatLastInteraction(deal.lastInteractionAt)}
      </Definition>

      <Definition label="Previsão de fechamento">
        {deal.expectedCloseDate === null ? (
          <NotInformed />
        ) : (
          formatDay(deal.expectedCloseDate)
        )}
      </Definition>

      {deal.closedAt === null ? null : (
        <Definition label="Encerrado em">{formatDay(deal.closedAt)}</Definition>
      )}

      <div className="sm:col-span-2">
        <Definition label="Escopo negociado">
          {deal.description === null ? (
            <NotInformed />
          ) : (
            <span className="whitespace-pre-wrap">{deal.description}</span>
          )}
        </Definition>
      </div>
    </dl>
  </section>
);

/**
 * O dossiê do cliente.
 *
 * Telefone e e-mail são links, e não texto: a pergunta que esta seção responde é
 * "como eu falo com essa pessoa agora?", e `tel:` e `mailto:` são a resposta com
 * um clique a menos — no celular, com nenhum.
 */
const LeadDossierCard = ({ deal }: { readonly deal: DealDetail }) => (
  <section className="rounded-card bg-surface-800/60 p-4 ring-1 ring-surface-700">
    <h3 className="text-sm font-semibold text-ink">Dossiê do cliente</h3>

    <dl className="mt-3 flex flex-col gap-4">
      <Definition label="Contato">
        <span className="font-medium">{deal.lead.name}</span>
        <span className="block text-xs text-ink-muted">{deal.lead.company}</span>
      </Definition>

      <Definition label="Cargo">
        {deal.lead.jobTitle === null ? <NotInformed /> : deal.lead.jobTitle}
      </Definition>

      <Definition label="Telefone">
        <a
          href={`tel:${deal.lead.phone.replace(/[^\d+]/g, '')}`}
          className="text-brand-300 hover:underline"
        >
          {deal.lead.phone}
        </a>
      </Definition>

      <Definition label="E-mail">
        <a
          href={`mailto:${deal.lead.email}`}
          className="break-all text-brand-300 hover:underline"
        >
          {deal.lead.email}
        </a>
      </Definition>

      <Definition label="Responsável pelo contato">
        <span className="flex items-center gap-2">
          <Avatar name={deal.lead.owner.name} size="sm" />
          {deal.lead.owner.name}
        </span>
      </Definition>
    </dl>
  </section>
);

/** O que dizer quando o negócio não abriu. */
const failure = (error: unknown): string =>
  error instanceof ApiError && error.status === 404
    ? 'Este negócio não existe mais. Ele pode ter sido removido por outra pessoa.'
    : 'Não foi possível carregar este negócio. Feche e tente de novo.';

export interface DealDetailModalProps {
  readonly dealId: string;
  readonly onClose: () => void;
}

export const DealDetailModal = ({ dealId, onClose }: DealDetailModalProps) => {
  const deal = useDeal(dealId);

  return (
    <Modal
      open
      onClose={onClose}
      size="full"
      title={deal.data?.title ?? 'Negócio'}
      {...(deal.data === undefined
        ? {}
        : { description: `${deal.data.lead.name} · ${deal.data.lead.company}` })}
    >
      {deal.isError ? (
        <p
          role="alert"
          className="rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
        >
          {failure(deal.error)}
        </p>
      ) : deal.data === undefined ? (
        <p className="text-sm text-ink-faint">Carregando o negócio…</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="flex flex-col gap-8 lg:col-span-2">
            <DealFacts deal={deal.data} />
            {/*
              A linha do tempo carrega sozinha, com a sua própria consulta: o
              histórico é a parte mais pesada da tela, e prendê-lo ao mesmo
              carregamento dos dados atrasaria o dossiê — que é justamente o que
              alguém abre o modal com pressa para ler.
            */}
            <DealTimelineSection dealId={dealId} />
          </div>

          <LeadDossierCard deal={deal.data} />
        </div>
      )}
    </Modal>
  );
};
