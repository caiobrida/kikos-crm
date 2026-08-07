import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import {
  UpdateDealInput,
  type DealDetail,
  type UpdateDealInputEncoded,
} from '@kikos/domain';
import { Schema } from 'effect';
import { FormProvider, useForm } from 'react-hook-form';
import { useUpdateDeal } from '../lib/deals';
import { applyApiIssues, fieldsOf, generalError } from '../lib/formErrors';
import { Alert } from '../ui/Alert';
import { DealFormFields } from './DealFormFields';

/*
 * A correção de um negócio, preenchida com o que já está lá.
 *
 * Ela ocupa o corpo do modal de detalhamento no lugar dos dados — não é uma tela
 * nova, e não é um segundo modal (ver o spec). O botão que a envia vive no rodapé
 * daquele modal, ligado por `form={DEAL_EDIT_FORM_ID}`; é o mesmo arranjo dos
 * formulários de cadastro.
 *
 * `Schema.encodeSync` é o que faz o preenchimento: o negócio que veio do
 * servidor volta à forma que o `<form>` produz — data como `"AAAA-MM-DD"`, `""`
 * no opcional ausente — pelo mesmo Schema que valida o envio. Montar os valores
 * iniciais à mão seria a segunda tradução entre as duas formas, e a primeira a
 * discordar da outra.
 *
 * O que ela **não** oferece é o estágio: mover um negócio é `PATCH
 * /deals/:id/stage`, com a regra do funil, o registro na linha do tempo e o selo
 * do contato — e o board é onde esse gesto acontece.
 */

/** O `id` do `<form>`: é ele que liga o botão "Salvar", no rodapé do modal. */
export const DEAL_EDIT_FORM_ID = 'edit-deal-form';

/**
 * Os campos que a recusa da API pode apontar, tirados do próprio Schema.
 *
 * É a lista do cadastro menos o estágio, e ela sai do Schema em vez de ser
 * escrita à mão justamente por isso: `stage` não é campo desta tela, e um nome a
 * mais na lista faria uma queixa sobre ele ficar pendurada num campo que não
 * existe — e o formulário nunca mais se daria por válido.
 */
const FIELDS = fieldsOf(UpdateDealInput.fields);

export interface DealEditFormProps {
  readonly deal: DealDetail;
  readonly onSaved: () => void;
}

export const DealEditForm = ({ deal, onSaved }: DealEditFormProps) => {
  const update = useUpdateDeal(deal.id);

  const form = useForm<UpdateDealInputEncoded, unknown, UpdateDealInput>({
    resolver: effectTsResolver(UpdateDealInput),
    defaultValues: Schema.encodeSync(UpdateDealInput)({
      ...deal,
      leadId: deal.lead.id,
      ownerId: deal.owner.id,
      // As colunas nuláveis do banco viram os campos opcionais do Schema: o
      // `NULL` da data não informada é o `undefined` que vira `""` no `<input>`.
      expectedCloseDate: deal.expectedCloseDate ?? undefined,
      description: deal.description ?? undefined,
    }),
  });

  const submit = form.handleSubmit((input) => {
    update.mutate(input, {
      onSuccess: onSaved,
      // A recusa da API vem no mesmo formato do resolver — `{ path, message }`
      // —, então ela se acomoda embaixo do campo culpado sem tradução.
      onError: (error) => applyApiIssues(error, FIELDS, form.setError),
    });
  });

  /*
   * O aviso no topo: as recusas que não pertencem a campo nenhum — o Lead ou o
   * responsável que sumiu (404), o negócio encerrado por outra pessoa enquanto o
   * formulário estava aberto (409) e o servidor que não respondeu.
   */
  const formError = generalError(update.error, FIELDS);

  return (
    <form
      id={DEAL_EDIT_FORM_ID}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-5"
    >
      {formError === undefined ? null : <Alert>{formError}</Alert>}

      <FormProvider {...form}>
        {/* O campo de Lead abre já preenchido com o cliente do negócio: o
            dossiê veio no detalhamento, e buscá-lo de novo seria uma ida ao
            servidor para receber o que a tela tem na mão. */}
        <DealFormFields initialLead={deal.lead} />
      </FormProvider>
    </form>
  );
};
