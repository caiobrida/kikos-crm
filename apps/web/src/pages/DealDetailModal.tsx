import { refuseDealClose, refuseDealEdit, type DealDetail } from '@kikos/domain';
import { useState } from 'react';
import { ApiError } from '../lib/api';
import { formatDay, formatLastInteraction } from '../lib/dates';
import { useDeal, useDeleteDeal } from '../lib/deals';
import { formatBRL } from '../lib/money';
import { Alert } from '../ui/Alert';
import { Avatar } from '../ui/Avatar';
import { DealResultBadge, DealStageBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Definition, NotInformed } from '../ui/Definition';
import { Modal } from '../ui/Modal';
import { RemovalConfirm } from '../ui/RemovalConfirm';
import { CloseDealActions } from './CloseDealActions';
import { DEAL_EDIT_FORM_ID, DealEditForm } from './DealEditForm';
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
 * **O rodapé é onde o negócio se trabalha inteiro** — encerrar, corrigir e
 * remover moram nele, e nenhum dos três abre uma tela nova. Encerrar são dois
 * botões e não um "Encerrar" que pergunte depois, porque encerrar sem dizer como
 * não é uma operação que exista (ADR-0003); editar troca o conteúdo do modal
 * pelo formulário; remover confirma em linha no próprio rodapé. Não há modal
 * sobre modal.
 *
 * Depois do encerramento, encerrar e editar somem e dá lugar ao desfecho
 * registrado — o negócio é terminal, e um botão que só serve para receber 409 é
 * um convite a um erro. **Remover continua**: ADR-0003 recusa as três escritas
 * que *mudam o desfecho* de um negócio encerrado, e retirar o registro inteiro
 * não é uma delas.
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

/** O que a recusa da remoção tem a dizer para quem confirmou. */
const removalFailure = (error: unknown): string | undefined => {
  if (error === null || error === undefined) return undefined;

  return error instanceof ApiError
    ? error.message
    : 'Não foi possível falar com o servidor. O negócio não foi removido.';
};

/**
 * Em que estado o modal está.
 *
 * Os três são exclusivos de propósito: não existe "removendo enquanto edita", e
 * um `boolean` para cada um deixaria essa combinação representável. O rodapé
 * inteiro e o corpo do modal são decididos por este valor.
 */
type Mode = 'view' | 'edit' | 'removing';

/**
 * O rodapé em modo de leitura: remover, corrigir e encerrar — ou o desfecho de
 * quem já foi encerrado.
 *
 * A recusa do encerramento mora **aqui**, e não dentro dos botões, porque ela
 * precisa sobreviver a eles: quando o servidor responde 409 — outra pessoa
 * encerrou o negócio primeiro —, a invalidação traz o negócio já fechado e os
 * botões dão lugar ao desfecho. Quem clicou ficaria sem explicação nenhuma para a
 * tela que mudou sozinha.
 */
const DealActions = ({
  deal,
  onEdit,
  onRemove,
}: {
  readonly deal: DealDetail;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}) => {
  const [refusal, setRefusal] = useState<string>();

  /*
   * As **mesmas** regras que a rota consulta antes de escrever, e não um
   * `deal.result === 'OPEN'` escrito aqui: o par estágio/resultado é ortogonal
   * (ADR-0003) e hoje as leituras coincidem, mas quem decide o que é um negócio
   * terminal é a regra, num lugar só. É o mesmo argumento que põe
   * `refuseStageMove` na coluna do board antes de qualquer ida ao servidor.
   *
   * São duas chamadas e não uma porque são duas perguntas — "dá para encerrar?" e
   * "dá para editar?" —, e o dia em que uma delas mudar, a outra não muda junto
   * por acidente.
   */
  const closeRefused = refuseDealClose(deal.stage);
  const editRefused = refuseDealEdit(deal.stage);

  return (
    <>
      <div className="mr-auto flex flex-wrap items-center gap-3">
        {/*
          Remover continua disponível para um negócio encerrado: ADR-0003 recusa
          as três escritas que mudam o desfecho — mover, editar e encerrar de
          novo —, e retirar o registro inteiro não é uma delas. Um negócio
          cadastrado por engano e encerrado por engano junto precisa poder sair.
        */}
        <Button variant="ghost" onClick={onRemove}>
          Remover
        </Button>

        {refusal === undefined ? null : (
          <p role="alert" className="text-sm text-lost-300">
            {refusal}
          </p>
        )}
      </div>

      {editRefused === undefined ? (
        <Button variant="secondary" onClick={onEdit}>
          Editar
        </Button>
      ) : null}

      {closeRefused === undefined ? (
        <CloseDealActions
          dealId={deal.id}
          onClosed={() => setRefusal(undefined)}
          onRefused={setRefusal}
        />
      ) : (
        /*
         * Nada de botão para um negócio terminal — nem desabilitado: um controle
         * que existe convida a tentar, e aqui não há segunda tentativa. O que o
         * rodapé mostra é o que ficou registrado.
         */
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <DealResultBadge result={deal.result} />
          {deal.closedAt === null ? null : <span>em {formatDay(deal.closedAt)}</span>}
        </p>
      )}
    </>
  );
};

export interface DealDetailModalProps {
  readonly dealId: string;
  readonly onClose: () => void;
}

export const DealDetailModal = ({ dealId, onClose }: DealDetailModalProps) => {
  const deal = useDeal(dealId);
  const remove = useDeleteDeal(dealId);
  const [mode, setMode] = useState<Mode>('view');

  const footer = (data: DealDetail) => {
    if (mode === 'edit') {
      return (
        <>
          {/* Cancelar volta para os dados e descarta: nada foi salvo até o
              servidor responder. */}
          <Button variant="secondary" onClick={() => setMode('view')}>
            Cancelar
          </Button>
          <Button type="submit" form={DEAL_EDIT_FORM_ID}>
            Salvar negócio
          </Button>
        </>
      );
    }

    if (mode === 'removing') {
      // `exactOptionalPropertyTypes` proíbe passar `error={undefined}`, então o
      // caso sem recusa precisa não passar a prop.
      const refusal = removalFailure(remove.error);

      return (
        <RemovalConfirm
          question={`Remover ${data.title} do funil? A ação não se desfaz.`}
          confirmLabel="Remover negócio"
          isPending={remove.isPending}
          {...(refusal === undefined ? {} : { error: refusal })}
          onCancel={() => {
            // A recusa anterior sai junto: quem cancelou e tentou de novo não
            // deve reler o motivo de uma tentativa que já passou.
            remove.reset();
            setMode('view');
          }}
          /*
           * Remover fecha o detalhamento, e o `onClose` do modal é uma navegação
           * de volta ao funil: o negócio não existe mais, e o endereço dele
           * passaria a responder 404 para quem recarregasse.
           */
          onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}
        />
      );
    }

    return (
      <DealActions
        deal={data}
        onEdit={() => setMode('edit')}
        onRemove={() => setMode('removing')}
      />
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="full"
      title={deal.data?.title ?? 'Negócio'}
      {...(deal.data === undefined
        ? {}
        : { description: `${deal.data.lead.name} · ${deal.data.lead.company}` })}
      {...(deal.data === undefined ? {} : { footer: footer(deal.data) })}
    >
      {deal.isError ? (
        <Alert>{failure(deal.error)}</Alert>
      ) : deal.data === undefined ? (
        <p className="text-sm text-ink-faint">Carregando o negócio…</p>
      ) : mode === 'edit' ? (
        /*
         * A `key` é o identificador do negócio: trocar de negócio pela URL com o
         * modal aberto precisa remontar o formulário, senão ele continuaria com
         * os valores iniciais do anterior.
         */
        <DealEditForm
          key={deal.data.id}
          deal={deal.data}
          onSaved={() => setMode('view')}
        />
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
