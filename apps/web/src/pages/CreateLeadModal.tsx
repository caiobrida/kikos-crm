import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { CreateLeadInput, type CreateLeadInputEncoded } from '@kikos/domain';
import { FormProvider, useForm } from 'react-hook-form';
import { applyApiIssues, fieldsOf, generalError } from '../lib/formErrors';
import { useCreateLead } from '../lib/leads';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { LeadFormFields } from './LeadFormFields';

/*
 * O formulário "Criar Novo Lead".
 *
 * **O Schema do pacote compartilhado é o único juiz.** `effectTsResolver` liga
 * `CreateLeadInput` ao react-hook-form: campo obrigatório em branco e e-mail
 * malformado são recusados aqui, antes de qualquer ida ao servidor, pela mesma
 * regra que a rota aplicaria depois. Quando a API recusa mesmo assim — porque o
 * responsável escolhido acabou de sumir do time —, a queixa dela cai no mesmo
 * lugar, embaixo do campo.
 *
 * Os campos em si moram em `LeadFormFields`, compartilhados com a edição: o
 * cadastro e a correção de um contato são o mesmo formulário, validado pelo
 * mesmo Schema. O que sobra para cá é o que **só o cadastro** tem — o estado
 * inicial em branco e a mutação que cria.
 *
 * O componente é montado só enquanto o modal está aberto: cancelar e abrir de
 * novo devolve um formulário limpo sem que ninguém precise lembrar de limpá-lo.
 */

/** O `id` do `<form>`: é ele que liga o botão "Salvar", que vive no rodapé. */
const FORM_ID = 'create-lead-form';

/**
 * O formulário em branco, na forma **codificada** do Schema — que é a forma que
 * o navegador produz: tudo string, e `""` onde nada foi escolhido.
 */
const EMPTY_FORM: CreateLeadInputEncoded = {
  name: '',
  company: '',
  email: '',
  phone: '',
  jobTitle: '',
  source: '',
  ownerId: '',
  notes: '',
};

/** Os campos que a recusa da API pode apontar, tirados do próprio Schema. */
const FIELDS = fieldsOf(CreateLeadInput.fields);

export interface CreateLeadModalProps {
  readonly onClose: () => void;
}

export const CreateLeadModal = ({ onClose }: CreateLeadModalProps) => {
  const create = useCreateLead();

  /*
   * Os três parâmetros de tipo do `useForm` são as duas pontas do Schema: os
   * valores que os campos guardam (o lado codificado), o contexto (que não
   * usamos), e o valor que o `handleSubmit` entrega já decodificado — aparado,
   * normalizado, com `undefined` no opcional em branco.
   */
  const form = useForm<CreateLeadInputEncoded, unknown, CreateLeadInput>({
    resolver: effectTsResolver(CreateLeadInput),
    defaultValues: EMPTY_FORM,
  });

  const submit = form.handleSubmit((input) => {
    create.mutate(input, {
      onSuccess: onClose,
      // A recusa da API vem no mesmo formato do resolver — `{ path, message }`
      // —, então ela se acomoda embaixo do campo culpado sem tradução.
      onError: (error) => applyApiIssues(error, FIELDS, form.setError),
    });
  });

  /*
   * O aviso no topo do formulário: a recusa que não pertence a campo nenhum — o
   * responsável que não existe mais (404) e o servidor que não respondeu.
   */
  const formError = generalError(create.error, FIELDS);

  return (
    <Modal
      open
      onClose={onClose}
      title="Criar Novo Lead"
      description="Um contato novo na carteira. Ele nasce com status Novo."
      footer={
        <>
          {/* Cancelar fecha e descarta: nada foi salvo até o servidor responder. */}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} isLoading={create.isPending}>
            Salvar contato
          </Button>
        </>
      }
    >
      {/* `noValidate`: quem valida é o Schema, e o balão nativo do navegador
          falaria em outro idioma e em outro lugar da tela. */}
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError === undefined ? null : <Alert>{formError}</Alert>}

        <FormProvider {...form}>
          <LeadFormFields />
        </FormProvider>
      </form>
    </Modal>
  );
};
