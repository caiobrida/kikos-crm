import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import {
  UpdateLeadInput,
  type LeadDetail,
  type UpdateLeadInputEncoded,
} from '@kikos/domain';
import { Schema } from 'effect';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { ApiError } from '../lib/api';
import { formatLastInteraction } from '../lib/dates';
import { applyApiIssues, fieldsOf, generalError } from '../lib/formErrors';
import { LEAD_SOURCE_LABELS } from '../lib/labels';
import { useDeleteLead, useLead, useUpdateLead } from '../lib/leads';
import { Alert } from '../ui/Alert';
import { Avatar } from '../ui/Avatar';
import { LeadStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Definition, NotInformed } from '../ui/Definition';
import { Modal } from '../ui/Modal';
import { RemovalConfirm } from '../ui/RemovalConfirm';
import { LeadFormFields } from './LeadFormFields';

/*
 * O contato aberto a partir de uma linha da tabela: os dados, a correção deles e
 * a remoção — tudo dentro do mesmo modal.
 *
 * **Nenhuma das três é uma tela nova**, e é essa a decisão do spec: editar troca
 * o conteúdo do modal pelo formulário, e remover confirma em linha no rodapé.
 * Não há modal sobre modal, e o registro sobre o qual se está decidindo continua
 * na tela enquanto se decide.
 *
 * Ele **não tem endereço próprio**, ao contrário do detalhamento de um negócio.
 * A diferença não é descuido: o modal do negócio é onde se trabalha a
 * oportunidade — recarregar mantém aberto, o link vai para um colega —, enquanto
 * abrir um contato é consulta e correção pontual. Uma rota por contato encheria o
 * histórico do navegador de estados intermediários, e o botão voltar passaria a
 * desfazer cliques em linha de tabela.
 *
 * O formulário de edição é o **mesmo** do cadastro (ver `LeadFormFields`),
 * validado pelo mesmo Schema: `UpdateLeadInput` é `CreateLeadInput`, campo por
 * campo.
 */

/**
 * Em que estado o modal está.
 *
 * Os três são exclusivos de propósito: não existe "removendo enquanto edita", e
 * um `boolean` para cada um deixaria essa combinação representável. O rodapé
 * inteiro é decidido por este valor.
 */
type Mode = 'view' | 'edit' | 'removing';

/** O `id` do `<form>`: é ele que liga o botão "Salvar", que vive no rodapé. */
const FORM_ID = 'edit-lead-form';

/**
 * Os campos que a recusa da API pode apontar, tirados do próprio Schema.
 *
 * É a mesma lista do cadastro, e não por coincidência: `UpdateLeadInput` **é**
 * `CreateLeadInput`. Cada tela a deriva do Schema em vez de importá-la da outra,
 * porque o Schema é a fonte — e uma lista escrita à mão seria a segunda.
 */
const FIELDS = fieldsOf(UpdateLeadInput.fields);

/** O que dizer quando o contato não abriu. */
const failure = (error: unknown): string =>
  error instanceof ApiError && error.status === 404
    ? 'Este contato não existe mais. Ele pode ter sido removido por outra pessoa.'
    : 'Não foi possível carregar este contato. Feche e tente de novo.';

/** O que a recusa da remoção tem a dizer para quem confirmou. */
const removalFailure = (error: unknown): string | undefined => {
  if (error === null || error === undefined) return undefined;

  /*
   * A frase do servidor é a que importa aqui: é ela que diz **quantos** negócios
   * em aberto travam a remoção, que é justamente o que quem tentou precisa saber
   * para decidir o que fazer com eles antes.
   */
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível falar com o servidor. O contato não foi removido.';
};

const LeadFacts = ({ lead }: { readonly lead: LeadDetail }) => (
  <dl className="grid gap-5 sm:grid-cols-2">
    <Definition label="Empresa">{lead.company}</Definition>

    <Definition label="Status">
      {/* O selo é só de leitura, aqui como na tabela: quem o escreve são as
          ações de Deal, com a regra "último evento vence". */}
      <LeadStatusBadge status={lead.status} />
    </Definition>

    <Definition label="E-mail">
      <a
        href={`mailto:${lead.email}`}
        className="break-all text-brand-300 hover:underline"
      >
        {lead.email}
      </a>
    </Definition>

    <Definition label="Telefone">
      {/* Telefone e e-mail são links, e não texto: a pergunta que a tela
          responde é "como eu falo com essa pessoa agora?". */}
      <a
        href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
        className="text-brand-300 hover:underline"
      >
        {lead.phone}
      </a>
    </Definition>

    <Definition label="Cargo">
      {lead.jobTitle === null ? <NotInformed /> : lead.jobTitle}
    </Definition>

    <Definition label="Origem">{LEAD_SOURCE_LABELS[lead.source]}</Definition>

    <Definition label="Vendedor responsável">
      <span className="flex items-center gap-2">
        <Avatar name={lead.owner.name} size="sm" />
        {lead.owner.name}
      </span>
    </Definition>

    <Definition label="Última interação">
      {formatLastInteraction(lead.lastInteractionAt)}
    </Definition>

    <div className="sm:col-span-2">
      <Definition label="Observações">
        {lead.notes === null ? (
          <NotInformed />
        ) : (
          <span className="whitespace-pre-wrap">{lead.notes}</span>
        )}
      </Definition>
    </div>
  </dl>
);

/**
 * O formulário de correção, preenchido com o contato que já existe.
 *
 * `Schema.encodeSync` é o que faz o preenchimento: o contato do servidor volta à
 * forma que o `<form>` produz — tudo string, `""` no opcional ausente — pelo
 * mesmo Schema que valida o envio. Montar os valores iniciais à mão seria a
 * segunda tradução entre as duas formas, e a primeira a discordar da outra.
 */
const LeadEditForm = ({
  lead,
  onSaved,
}: {
  readonly lead: LeadDetail;
  readonly onSaved: () => void;
}) => {
  const update = useUpdateLead(lead.id);

  const form = useForm<UpdateLeadInputEncoded, unknown, UpdateLeadInput>({
    resolver: effectTsResolver(UpdateLeadInput),
    defaultValues: Schema.encodeSync(UpdateLeadInput)({
      ...lead,
      // As colunas nuláveis do banco viram os campos opcionais do Schema: o
      // `NULL` do cargo não informado é o `undefined` que vira `""` no `<input>`.
      jobTitle: lead.jobTitle ?? undefined,
      notes: lead.notes ?? undefined,
      ownerId: lead.owner.id,
    }),
  });

  const submit = form.handleSubmit((input) => {
    update.mutate(input, {
      onSuccess: onSaved,
      onError: (error) => applyApiIssues(error, FIELDS, form.setError),
    });
  });

  const formError = generalError(update.error, FIELDS);

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError === undefined ? null : <Alert>{formError}</Alert>}

      <FormProvider {...form}>
        <LeadFormFields />
      </FormProvider>
    </form>
  );
};

export interface LeadDetailModalProps {
  readonly leadId: string;
  readonly onClose: () => void;
}

export const LeadDetailModal = ({ leadId, onClose }: LeadDetailModalProps) => {
  const lead = useLead(leadId);
  const remove = useDeleteLead(leadId);
  const [mode, setMode] = useState<Mode>('view');

  /*
   * O rodapé é o que muda com o estado, e por isso ele é montado aqui e não
   * dentro de cada pedaço: as três ações — editar, salvar e remover — vivem no
   * mesmo lugar da tela, e é isso que faz o modal não precisar de um segundo.
   */
  const footer = (data: LeadDetail) => {
    if (mode === 'edit') {
      return (
        <>
          {/* Cancelar volta para os dados e descarta: nada foi salvo até o
              servidor responder. */}
          <Button variant="secondary" onClick={() => setMode('view')}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID}>
            Salvar contato
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
          question={`Remover ${data.name} da carteira? A ação não se desfaz.`}
          confirmLabel="Remover contato"
          isPending={remove.isPending}
          {...(refusal === undefined ? {} : { error: refusal })}
          onCancel={() => {
            // A recusa anterior sai junto: quem cancelou e tentou de novo não
            // deve reler o motivo de uma tentativa que já passou.
            remove.reset();
            setMode('view');
          }}
          onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}
        />
      );
    }

    return (
      <>
        <Button variant="ghost" className="mr-auto" onClick={() => setMode('removing')}>
          Remover
        </Button>
        <Button onClick={() => setMode('edit')}>Editar</Button>
      </>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={lead.data?.name ?? 'Contato'}
      {...(lead.data === undefined ? {} : { description: lead.data.company })}
      {...(lead.data === undefined ? {} : { footer: footer(lead.data) })}
    >
      {lead.isError ? (
        <Alert>{failure(lead.error)}</Alert>
      ) : lead.data === undefined ? (
        <p className="text-sm text-ink-faint">Carregando o contato…</p>
      ) : mode === 'edit' ? (
        /*
         * A `key` é o identificador do contato: trocar de contato com o modal
         * aberto precisa remontar o formulário, senão ele continuaria com os
         * valores iniciais do anterior.
         */
        <LeadEditForm
          key={lead.data.id}
          lead={lead.data}
          onSaved={() => setMode('view')}
        />
      ) : (
        <LeadFacts lead={lead.data} />
      )}
    </Modal>
  );
};
