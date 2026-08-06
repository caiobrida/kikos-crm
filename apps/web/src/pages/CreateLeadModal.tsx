import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import {
  CreateLeadInput,
  LEAD_SOURCES,
  type CreateLeadInputEncoded,
} from '@kikos/domain';
import { useForm } from 'react-hook-form';
import { ApiError } from '../lib/api';
import { errorProp, generalError } from '../lib/formErrors';
import { LEAD_SOURCE_LABELS } from '../lib/labels';
import { useCreateLead } from '../lib/leads';
import { useSellers } from '../lib/sellers';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';

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

const FIELDS = Object.keys(EMPTY_FORM) as readonly (keyof CreateLeadInputEncoded)[];

const isField = (path: string): path is keyof CreateLeadInputEncoded =>
  FIELDS.some((field) => field === path);

export interface CreateLeadModalProps {
  readonly onClose: () => void;
}

export const CreateLeadModal = ({ onClose }: CreateLeadModalProps) => {
  const sellers = useSellers();
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

  const errors = form.formState.errors;

  const submit = form.handleSubmit((input) => {
    create.mutate(input, {
      onSuccess: onClose,
      onError: (error) => {
        // A recusa da API vem no mesmo formato do resolver — `{ path, message }`
        // —, então ela se acomoda embaixo do campo culpado sem tradução.
        if (!(error instanceof ApiError)) return;

        for (const issue of error.issues) {
          if (isField(issue.path)) {
            form.setError(issue.path, { message: issue.message });
          }
        }
      },
    });
  });

  /*
   * O aviso no topo do formulário: a recusa que não pertence a campo nenhum —
   * o responsável que não existe mais (404) e o servidor que não respondeu.
   */
  const formError = generalError(create.error, FIELDS);

  /*
   * Sem a lista de vendedores não há escolha possível, e um `<select>` vazio
   * sem explicação parece defeito da tela. A queixa vai no próprio campo: é
   * dele que o vendedor está esperando alguma coisa.
   */
  const sellersError = sellers.isError
    ? 'Não foi possível carregar os vendedores. Recarregue a página.'
    : undefined;

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
        {formError === undefined ? null : (
          <p
            role="alert"
            className="rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
          >
            {formError}
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            htmlFor="lead-name"
            label="Nome"
            required
            {...errorProp(errors.name?.message)}
          >
            <Input
              id="lead-name"
              placeholder="Juliana Prado"
              autoComplete="off"
              autoFocus
              {...form.register('name')}
            />
          </Field>

          <Field
            htmlFor="lead-company"
            label="Empresa"
            required
            {...errorProp(errors.company?.message)}
          >
            <Input
              id="lead-company"
              placeholder="Smart Fit Morumbi"
              autoComplete="off"
              {...form.register('company')}
            />
          </Field>

          <Field
            htmlFor="lead-email"
            label="E-mail"
            required
            {...errorProp(errors.email?.message)}
          >
            <Input
              id="lead-email"
              type="email"
              placeholder="juliana@smartfit.com.br"
              autoComplete="off"
              {...form.register('email')}
            />
          </Field>

          <Field
            htmlFor="lead-phone"
            label="Telefone"
            required
            {...errorProp(errors.phone?.message)}
          >
            <Input
              id="lead-phone"
              type="tel"
              placeholder="(11) 98812-4471"
              autoComplete="off"
              {...form.register('phone')}
            />
          </Field>

          <Field
            htmlFor="lead-source"
            label="Origem"
            required
            hint="Por qual canal o contato chegou ao time."
            {...errorProp(errors.source?.message)}
          >
            <Select id="lead-source" {...form.register('source')}>
              <option value="">Selecione…</option>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LEAD_SOURCE_LABELS[source]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            htmlFor="lead-owner"
            label="Vendedor responsável"
            required
            {...errorProp(errors.ownerId?.message ?? sellersError)}
          >
            {/* A lista vem de `/users?role=SELLER`: não existe tabela de
                vendedor, e sim User com papel de vendedor (ADR-0001). */}
            <Select
              id="lead-owner"
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
            htmlFor="lead-job-title"
            label="Cargo"
            {...errorProp(errors.jobTitle?.message)}
          >
            <Input
              id="lead-job-title"
              placeholder="Gerente de Operações"
              autoComplete="off"
              {...form.register('jobTitle')}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              htmlFor="lead-notes"
              label="Observações"
              hint="O que já foi conversado com este contato."
              {...errorProp(errors.notes?.message)}
            >
              <Textarea
                id="lead-notes"
                placeholder="Quer trocar a linha de esteiras até o fim do trimestre…"
                {...form.register('notes')}
              />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
};
