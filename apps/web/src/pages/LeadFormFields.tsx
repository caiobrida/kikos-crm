import {
  LEAD_SOURCES,
  type CreateLeadInput,
  type CreateLeadInputEncoded,
} from '@kikos/domain';
import { useFormContext } from 'react-hook-form';
import { useId } from 'react';
import { errorProp } from '../lib/formErrors';
import { LEAD_SOURCE_LABELS } from '../lib/labels';
import { SELLERS_UNAVAILABLE, useSellers } from '../lib/sellers';
import { Field, Input, Select, Textarea } from '../ui/Field';

/*
 * Os campos de um contato — os oito, na ordem em que a tela os mostra.
 *
 * **Cadastrar e editar são o mesmo formulário**, e este componente é o lugar
 * onde isso deixa de ser uma intenção. `UpdateLeadInput` é `CreateLeadInput`
 * (ver o pacote de domínio): todo campo que alguém escolheu ao cadastrar
 * continua sendo dele para corrigir, e a mesma regra recusa os dois. Duas cópias
 * do bloco divergiriam no primeiro ajuste — um `maxLength` novo, uma dica
 * reescrita, uma origem acrescentada ao vocabulário.
 *
 * Ele lê o formulário do **contexto** do react-hook-form, e não de uma prop:
 * é o mesmo mecanismo que os campos de negócio usam, onde a prop não daria conta
 * (lá os dois formulários diferem por um campo). Um jeito só para os dois, em vez
 * de dois jeitos para explicar depois.
 *
 * Os `id` saem de um `useId()` porque mais de um formulário pode estar montado ao
 * mesmo tempo — o modal de cadastro por cima da lista com um contato aberto —, e
 * dois `id` iguais no documento quebram o `htmlFor` dos dois.
 */

export const LeadFormFields = () => {
  const form = useFormContext<CreateLeadInputEncoded, unknown, CreateLeadInput>();
  const sellers = useSellers();
  const field = useId();

  const errors = form.formState.errors;

  /*
   * Sem a lista de vendedores não há escolha possível, e um `<select>` vazio sem
   * explicação parece defeito da tela. A queixa vai no próprio campo: é dele que
   * o vendedor está esperando alguma coisa.
   */
  const sellersError = sellers.isError ? SELLERS_UNAVAILABLE : undefined;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        htmlFor={`${field}-name`}
        label="Nome"
        required
        {...errorProp(errors.name?.message)}
      >
        <Input
          id={`${field}-name`}
          placeholder="Juliana Prado"
          autoComplete="off"
          autoFocus
          {...form.register('name')}
        />
      </Field>

      <Field
        htmlFor={`${field}-company`}
        label="Empresa"
        required
        {...errorProp(errors.company?.message)}
      >
        <Input
          id={`${field}-company`}
          placeholder="Smart Fit Morumbi"
          autoComplete="off"
          {...form.register('company')}
        />
      </Field>

      <Field
        htmlFor={`${field}-email`}
        label="E-mail"
        required
        {...errorProp(errors.email?.message)}
      >
        <Input
          id={`${field}-email`}
          type="email"
          placeholder="juliana@smartfit.com.br"
          autoComplete="off"
          {...form.register('email')}
        />
      </Field>

      <Field
        htmlFor={`${field}-phone`}
        label="Telefone"
        required
        {...errorProp(errors.phone?.message)}
      >
        <Input
          id={`${field}-phone`}
          type="tel"
          placeholder="(11) 98812-4471"
          autoComplete="off"
          {...form.register('phone')}
        />
      </Field>

      <Field
        htmlFor={`${field}-source`}
        label="Origem"
        required
        hint="Por qual canal o contato chegou ao time."
        {...errorProp(errors.source?.message)}
      >
        <Select id={`${field}-source`} {...form.register('source')}>
          <option value="">Selecione…</option>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {LEAD_SOURCE_LABELS[source]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        htmlFor={`${field}-owner`}
        label="Vendedor responsável"
        required
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
        htmlFor={`${field}-job-title`}
        label="Cargo"
        {...errorProp(errors.jobTitle?.message)}
      >
        <Input
          id={`${field}-job-title`}
          placeholder="Gerente de Operações"
          autoComplete="off"
          {...form.register('jobTitle')}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field
          htmlFor={`${field}-notes`}
          label="Observações"
          hint="O que já foi conversado com este contato."
          {...errorProp(errors.notes?.message)}
        >
          <Textarea
            id={`${field}-notes`}
            placeholder="Quer trocar a linha de esteiras até o fim do trimestre…"
            {...form.register('notes')}
          />
        </Field>
      </div>
    </div>
  );
};
