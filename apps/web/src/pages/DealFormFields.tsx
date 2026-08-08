import type { UpdateDealInput, UpdateDealInputEncoded } from '@kikos/domain';
import { useId, useState, type ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { errorProp } from '../lib/formErrors';
import { SELLERS_UNAVAILABLE, useSellers } from '../lib/sellers';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { LeadPicker, type PickedLead } from '../ui/LeadPicker';
import { MoneyInput } from '../ui/MoneyInput';

/*
 * Os campos de um negócio — os que cadastrar e editar têm em comum.
 *
 * **É a carga de `UpdateDealInput`**, que é a do cadastro menos o estágio: mover
 * um card é outra ação, com rota, regra e consequências próprias (o registro na
 * linha do tempo, a última interação e o selo do contato). O cadastro oferece o
 * estágio inicial, e é por isso que ele entra por `stageField` em vez de morar
 * aqui — o campo existe num formulário só.
 *
 * O formulário vem do **contexto** do react-hook-form, e não de uma prop, e é
 * aqui que essa escolha se paga: os dois formulários têm tipos diferentes — o do
 * cadastro tem `stage` —, e um componente tipado no menor dos dois não receberia
 * o maior por prop sem um cast. O contexto é o que a biblioteca oferece para
 * exatamente esta composição, e este componente só toca campos que existem nos
 * dois.
 *
 * Os `id` saem de um `useId()` porque mais de um formulário pode estar montado ao
 * mesmo tempo, e dois `id` iguais no documento quebram o `htmlFor` dos dois.
 */

export interface DealFormFieldsProps {
  /**
   * O contato já vinculado, quando o formulário abre para editar.
   *
   * O campo de Lead guarda o contato **inteiro**, e não só o identificador que
   * vai no corpo: é o que ele mostra depois de escolhido, sem buscar o nome de
   * novo, e é dele que sai o responsável pré-preenchido.
   */
  readonly initialLead?: PickedLead;
  /** O `<select>` de estágio inicial — só o cadastro o tem. */
  readonly stageField?: ReactNode;
}

export const DealFormFields = ({ initialLead, stageField }: DealFormFieldsProps) => {
  const form = useFormContext<UpdateDealInputEncoded, unknown, UpdateDealInput>();
  const sellers = useSellers();
  const field = useId();

  const [lead, setLead] = useState<PickedLead | undefined>(initialLead);

  const errors = form.formState.errors;
  const sellersError = sellers.isError ? SELLERS_UNAVAILABLE : undefined;

  /*
   * O responsável acompanha o contato **enquanto o formulário não nasceu com
   * um**. No cadastro o campo começa vazio, e escolher o Lead o preenche; na
   * edição ele já vem do negócio, e sobrescrevê-lo porque alguém corrigiu o
   * contato vinculado desfaria uma atribuição deliberada — quem prospecta nem
   * sempre é quem fecha.
   *
   * A condição sai do próprio formulário, e não de uma prop: é literalmente
   * "este campo nasceu em branco?".
   */
  const inheritsOwner = form.formState.defaultValues?.ownerId === '';

  const chooseLead = (chosen: PickedLead | undefined) => {
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
     * E, mesmo herdando, só enquanto ninguém trocou o responsável à mão:
     * `isDirty` do campo é exatamente essa memória.
     */
    if (
      chosen !== undefined &&
      inheritsOwner &&
      form.getFieldState('ownerId').isDirty === false
    ) {
      form.setValue('ownerId', chosen.owner.id, revalidate);
    }
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field
          htmlFor={`${field}-title`}
          label="Nome do negócio"
          required
          {...errorProp(errors.title?.message)}
        >
          <Input
            id={`${field}-title`}
            placeholder="Esteiras profissionais — unidade Morumbi"
            autoComplete="off"
            autoFocus
            {...form.register('title')}
          />
        </Field>
      </div>

      <Field
        htmlFor={`${field}-value`}
        label="Valor estimado"
        required
        hint="Em reais, como 12.500,00."
        {...errorProp(errors.valueInCents?.message)}
      >
        {/* O campo guarda centavos e mostra reais, então ele é controlado pelo
            `Controller` em vez de registrado direto. */}
        <Controller
          control={form.control}
          name="valueInCents"
          render={({ field: money }) => (
            <MoneyInput
              id={`${field}-value`}
              value={money.value}
              onChange={money.onChange}
              onBlur={money.onBlur}
            />
          )}
        />
      </Field>

      {stageField}

      <div className="sm:col-span-2">
        <Field
          htmlFor={`${field}-lead`}
          label="Lead"
          required
          hint="Busque um contato já cadastrado pelo nome."
          {...errorProp(errors.leadId?.message)}
        >
          {/* Sem validar na saída do campo: como todos os outros, ele só é
              cobrado no envio — e a partir daí a escolha limpa a queixa. */}
          <LeadPicker
            id={`${field}-lead`}
            value={lead}
            onChange={chooseLead}
            {...(errors.leadId === undefined ? {} : { invalid: true })}
          />
        </Field>
      </div>

      <Field
        htmlFor={`${field}-owner`}
        label="Vendedor responsável"
        required
        hint="Vem do dono do Lead escolhido, e pode ser trocado."
        {...errorProp(errors.ownerId?.message ?? sellersError)}
      >
        {/* A lista vem de `/users?role=SELLER`: não existe tabela de vendedor,
            e sim User com papel de vendedor (ADR-0001). */}
        <Select
          id={`${field}-owner`}
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
        htmlFor={`${field}-expected-close`}
        label="Data prevista de fechamento"
        {...errorProp(errors.expectedCloseDate?.message)}
      >
        <Input
          id={`${field}-expected-close`}
          type="date"
          {...form.register('expectedCloseDate')}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field
          htmlFor={`${field}-description`}
          label="Descrição do escopo"
          hint="O que está sendo negociado."
          {...errorProp(errors.description?.message)}
        >
          <Textarea
            id={`${field}-description`}
            placeholder="Doze esteiras, com instalação e um ano de manutenção…"
            {...form.register('description')}
          />
        </Field>
      </div>
    </div>
  );
};
