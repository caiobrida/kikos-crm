import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import {
  CreateDealInput,
  OPEN_DEAL_STAGES,
  type CreateDealInputEncoded,
} from '@kikos/domain';
import { FormProvider, useForm } from 'react-hook-form';
import { useCreateDeal } from '../lib/deals';
import { applyApiIssues, errorProp, fieldsOf, generalError } from '../lib/formErrors';
import { DEAL_STAGE_LABELS } from '../lib/labels';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field, Select } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { DealFormFields } from './DealFormFields';

/*
 * O formulário "Cadastrar Novo Negócio".
 *
 * Como no cadastro de Lead, **o Schema do pacote compartilhado é o único
 * juiz**: `effectTsResolver` liga `CreateDealInput` ao react-hook-form, e campo
 * obrigatório em branco é recusado aqui, antes de qualquer ida ao servidor,
 * pela mesma regra que a rota aplicaria depois.
 *
 * Os campos moram em `DealFormFields`, compartilhados com a edição. O que sobra
 * para cá é o que **só o cadastro** tem: o formulário em branco, a mutação que
 * cria, e o único campo que a edição não oferece — o estágio inicial, porque
 * mover um negócio que já existe é outra ação, com rota e regra próprias.
 *
 * A lista de estágios vem de `OPEN_DEAL_STAGES`, no pacote compartilhado: é a
 * mesma que a rota usa para recusar quem enviar "Fechado" por fora da tela.
 */

/** O `id` do `<form>`: é ele que liga o botão "Salvar", que vive no rodapé. */
const FORM_ID = 'create-deal-form';

/**
 * O formulário em branco, na forma **codificada** do Schema — a forma que o
 * navegador produz.
 *
 * `NaN` no valor é como o campo de dinheiro diz "está em branco": ele guarda
 * centavos inteiros, e não existe inteiro que signifique "nada escrito". Zero
 * significaria um negócio de graça.
 */
const EMPTY_FORM: CreateDealInputEncoded = {
  title: '',
  valueInCents: Number.NaN,
  leadId: '',
  ownerId: '',
  // O funil começa no começo. É o estágio de todo negócio novo, e trocá-lo é um
  // clique — pedir a escolha antes de deixar salvar seria cerimônia sem ganho.
  stage: 'NEW',
  expectedCloseDate: '',
  description: '',
};

/** Os campos que a recusa da API pode apontar, tirados do próprio Schema. */
const FIELDS = fieldsOf(CreateDealInput.fields);

export interface CreateDealModalProps {
  readonly onClose: () => void;
}

export const CreateDealModal = ({ onClose }: CreateDealModalProps) => {
  const create = useCreateDeal();

  const form = useForm<CreateDealInputEncoded, unknown, CreateDealInput>({
    resolver: effectTsResolver(CreateDealInput),
    defaultValues: EMPTY_FORM,
  });

  const submit = form.handleSubmit((input) => {
    create.mutate(input, {
      onSuccess: onClose,
      onError: (error) => applyApiIssues(error, FIELDS, form.setError),
    });
  });

  /*
   * O aviso no topo: as recusas que não pertencem a campo nenhum — o Lead ou o
   * responsável que sumiu (404), o estágio recusado pelo funil (422) e o
   * servidor que não respondeu.
   */
  const formError = generalError(create.error, FIELDS);

  return (
    <Modal
      open
      onClose={onClose}
      title="Cadastrar Novo Negócio"
      description="Uma oportunidade sobre um contato da carteira."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} isLoading={create.isPending}>
            Salvar negócio
          </Button>
        </>
      }
    >
      {/* `noValidate`: quem valida é o Schema, e o balão nativo do navegador
          falaria em outro idioma e em outro lugar da tela. */}
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError === undefined ? null : <Alert>{formError}</Alert>}

        <FormProvider {...form}>
          <DealFormFields
            stageField={
              <Field
                htmlFor="deal-stage"
                label="Estágio inicial"
                required
                {...errorProp(form.formState.errors.stage?.message)}
              >
                {/* Só os quatro abertos: "Fechado" não é destino de escolha —
                    ele se alcança marcando o negócio como ganho ou perdido. */}
                <Select id="deal-stage" {...form.register('stage')}>
                  {OPEN_DEAL_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {DEAL_STAGE_LABELS[stage]}
                    </option>
                  ))}
                </Select>
              </Field>
            }
          />
        </FormProvider>
      </form>
    </Modal>
  );
};
