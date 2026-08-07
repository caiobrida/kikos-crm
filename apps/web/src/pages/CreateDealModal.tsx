import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import {
  CreateDealInput,
  OPEN_DEAL_STAGES,
  type CreateDealInputEncoded,
  type LeadListItem,
} from '@kikos/domain';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useCreateDeal } from '../lib/deals';
import { applyApiIssues, errorProp, generalError } from '../lib/formErrors';
import { DEAL_STAGE_LABELS } from '../lib/labels';
import { SELLERS_UNAVAILABLE, useSellers } from '../lib/sellers';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { LeadPicker } from '../ui/LeadPicker';
import { Modal } from '../ui/Modal';
import { MoneyInput } from '../ui/MoneyInput';

/*
 * O formulário "Cadastrar Novo Negócio".
 *
 * Como no cadastro de Lead, **o Schema do pacote compartilhado é o único
 * juiz**: `effectTsResolver` liga `CreateDealInput` ao react-hook-form, e campo
 * obrigatório em branco é recusado aqui, antes de qualquer ida ao servidor,
 * pela mesma regra que a rota aplicaria depois.
 *
 * Duas coisas são próprias deste formulário:
 *
 * - **o Lead é escolhido buscando pelo nome**, e a escolha pré-preenche o
 *   vendedor responsável com o dono do contato. É pré-preenchimento, não
 *   imposição: quem prospecta nem sempre é quem fecha, então o campo continua
 *   trocável.
 * - **o estágio inicial só oferece os quatro abertos.** A regra que diz quais
 *   são vive no pacote compartilhado (`OPEN_DEAL_STAGES`), a mesma lista que a
 *   rota usa para recusar quem enviar "Fechado" por fora da tela.
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

const FIELDS = Object.keys(EMPTY_FORM) as readonly (keyof CreateDealInputEncoded)[];

export interface CreateDealModalProps {
  readonly onClose: () => void;
}

export const CreateDealModal = ({ onClose }: CreateDealModalProps) => {
  const sellers = useSellers();
  const create = useCreateDeal();

  /*
   * O contato escolhido, inteiro — e não só o identificador que vai no corpo.
   * É dele que sai o responsável pré-preenchido, e é ele que o campo mostra
   * depois de escolhido, sem precisar buscar o nome de novo.
   */
  const [lead, setLead] = useState<LeadListItem>();

  const form = useForm<CreateDealInputEncoded, unknown, CreateDealInput>({
    resolver: effectTsResolver(CreateDealInput),
    defaultValues: EMPTY_FORM,
  });

  const errors = form.formState.errors;

  const chooseLead = (chosen: LeadListItem | undefined) => {
    setLead(chosen);

    /*
     * `shouldValidate` só depois da primeira tentativa de envio: antes dela,
     * validar a cada escolha apontaria erro em campo que ninguém ainda teve
     * chance de preencher; depois dela, é o que apaga a queixa no instante em
     * que ela deixa de ser verdade.
     */
    const revalidate = { shouldValidate: form.formState.isSubmitted };
    form.setValue('leadId', chosen?.id ?? '', revalidate);

    /*
     * O responsável acompanha o contato **enquanto ninguém o trocou à mão**:
     * sobrescrever uma escolha deliberada só porque o Lead mudou seria desfazer
     * trabalho de quem preencheu. `isDirty` do campo é exatamente essa memória.
     */
    if (chosen !== undefined && form.getFieldState('ownerId').isDirty === false) {
      form.setValue('ownerId', chosen.owner.id, revalidate);
    }
  };

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

  const sellersError = sellers.isError ? SELLERS_UNAVAILABLE : undefined;

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
        {formError === undefined ? null : (
          <p
            role="alert"
            className="rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
          >
            {formError}
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              htmlFor="deal-title"
              label="Nome do negócio"
              required
              {...errorProp(errors.title?.message)}
            >
              <Input
                id="deal-title"
                placeholder="Esteiras profissionais — unidade Morumbi"
                autoComplete="off"
                autoFocus
                {...form.register('title')}
              />
            </Field>
          </div>

          <Field
            htmlFor="deal-value"
            label="Valor estimado"
            required
            hint="Em reais, como 12.500,00."
            {...errorProp(errors.valueInCents?.message)}
          >
            {/* O campo guarda centavos e mostra reais, então ele é controlado
                pelo `Controller` em vez de registrado direto. */}
            <Controller
              control={form.control}
              name="valueInCents"
              render={({ field }) => (
                <MoneyInput
                  id="deal-value"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>

          <Field
            htmlFor="deal-stage"
            label="Estágio inicial"
            required
            {...errorProp(errors.stage?.message)}
          >
            {/* Só os quatro abertos: "Fechado" não é destino de escolha — ele
                se alcança marcando o negócio como ganho ou perdido. */}
            <Select id="deal-stage" {...form.register('stage')}>
              {OPEN_DEAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {DEAL_STAGE_LABELS[stage]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field
              htmlFor="deal-lead"
              label="Lead"
              required
              hint="Busque um contato já cadastrado pelo nome."
              {...errorProp(errors.leadId?.message)}
            >
              {/* Sem validar na saída do campo: como todos os outros, ele só é
                  cobrado no envio — e a partir daí a escolha limpa a queixa. */}
              <LeadPicker
                id="deal-lead"
                value={lead}
                onChange={chooseLead}
                {...(errors.leadId === undefined ? {} : { invalid: true })}
              />
            </Field>
          </div>

          <Field
            htmlFor="deal-owner"
            label="Vendedor responsável"
            required
            hint="Vem do dono do Lead escolhido, e pode ser trocado."
            {...errorProp(errors.ownerId?.message ?? sellersError)}
          >
            {/* A lista vem de `/users?role=SELLER`: não existe tabela de
                vendedor, e sim User com papel de vendedor (ADR-0001). */}
            <Select
              id="deal-owner"
              disabled={sellers.isPending}
              {...form.register('ownerId')}
            >
              <option value="">{sellers.isPending ? 'Carregando…' : 'Selecione…'}</option>
              {(sellers.data ?? []).map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            htmlFor="deal-expected-close"
            label="Data prevista de fechamento"
            {...errorProp(errors.expectedCloseDate?.message)}
          >
            <Input
              id="deal-expected-close"
              type="date"
              {...form.register('expectedCloseDate')}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              htmlFor="deal-description"
              label="Descrição do escopo"
              hint="O que está sendo negociado."
              {...errorProp(errors.description?.message)}
            >
              <Textarea
                id="deal-description"
                placeholder="Doze esteiras, com instalação e um ano de manutenção…"
                {...form.register('description')}
              />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
};
