import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import {
  CreateCommentInput,
  type Comment,
  type CreateCommentInputEncoded,
} from '@kikos/domain';
import { useForm } from 'react-hook-form';
import { useCreateComment, useDealTimeline } from '../lib/comments';
import { formatMoment } from '../lib/dates';
import { applyApiIssues, errorProp, generalError } from '../lib/formErrors';
import { COMMENT_KIND_LABELS } from '../lib/labels';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Field, Textarea } from '../ui/Field';
import { SystemRecordIcon } from '../ui/icons';

/*
 * A linha do tempo de um negócio: a caixa de comentário e o histórico.
 *
 * **A distinção entre as duas espécies é o ponto desta tela**, e ela é feita em
 * três canais ao mesmo tempo, de propósito: o comentário tem avatar, fundo e
 * caixa; o registro de sistema tem ícone, é rente ao fundo e vem em texto menor.
 * Cor sozinha não serviria — quem não distingue cores continuaria vendo dois
 * itens iguais —, e é por isso que cada item também carrega a espécie por
 * escrito, para quem lê com leitor de tela.
 *
 * O histórico não é reordenado aqui: ele chega do mais recente para o mais
 * antigo, e um `sort` no navegador seria o segundo lugar em que essa regra
 * estaria escrita.
 */

const FORM_ID = 'deal-comment-form';

const EMPTY_FORM: CreateCommentInputEncoded = { body: '' };
const FIELDS = ['body'] as const;

/** O cabeçalho comum às duas espécies: quem, e quando. */
const Signature = ({ comment }: { readonly comment: Comment }) => (
  <>
    <span className="font-medium text-ink">{comment.author.name}</span>
    <span aria-hidden="true">·</span>
    <time dateTime={comment.createdAt.toISOString()}>
      {formatMoment(comment.createdAt)}
    </time>
  </>
);

/** O que uma pessoa escreveu: avatar, caixa e o texto como ele foi digitado. */
const UserComment = ({ comment }: { readonly comment: Comment }) => (
  <article className="flex gap-3">
    <Avatar name={comment.author.name} size="md" />

    <div className="min-w-0 flex-1 rounded-card bg-surface-800 px-3 py-2.5 ring-1 ring-surface-700">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
        <Signature comment={comment} />
      </p>

      {/* `whitespace-pre-wrap`: quem escreveu em parágrafos escreveu em
          parágrafos, e o histórico não é lugar de reescrever ninguém. */}
      <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{comment.body}</p>
    </div>
  </article>
);

/** O que o sistema registrou: ícone, rente ao fundo, e menor. */
const SystemRecord = ({ comment }: { readonly comment: Comment }) => (
  <article className="flex gap-3 py-0.5 pl-1.5">
    <SystemRecordIcon className="mt-0.5 size-4 shrink-0 text-ink-faint" />

    <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-ink-muted">
      <span>{comment.body}</span>
      <span aria-hidden="true">·</span>
      <Signature comment={comment} />
    </p>
  </article>
);

/*
 * O nome carrega o sufixo `Section` para não colidir com `DealTimeline`, que no
 * pacote de domínio é o Schema da linha do tempo. Duas coisas com o mesmo nome
 * num `import` seriam duas coisas diferentes conforme o arquivo.
 */
export interface DealTimelineSectionProps {
  readonly dealId: string;
}

export const DealTimelineSection = ({ dealId }: DealTimelineSectionProps) => {
  const timeline = useDealTimeline(dealId);
  const create = useCreateComment(dealId);

  const form = useForm<CreateCommentInputEncoded, unknown, CreateCommentInput>({
    resolver: effectTsResolver(CreateCommentInput),
    defaultValues: EMPTY_FORM,
  });

  const submit = form.handleSubmit((input) => {
    create.mutate(input, {
      // A caixa só é limpa depois que o servidor aceitou: uma recusa com o texto
      // apagado obrigaria a pessoa a escrever tudo de novo.
      onSuccess: () => form.reset(EMPTY_FORM),
      onError: (error) => applyApiIssues(error, FIELDS, form.setError),
    });
  });

  const formError = generalError(create.error, FIELDS);

  return (
    <section>
      <h3 className="text-sm font-semibold text-ink">Linha do tempo</h3>

      <form id={FORM_ID} onSubmit={submit} noValidate className="mt-3">
        {formError === undefined ? null : (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
          >
            {formError}
          </p>
        )}

        <Field
          htmlFor="deal-comment"
          label="Escrever um comentário"
          {...errorProp(form.formState.errors.body?.message)}
        >
          <Textarea
            id="deal-comment"
            placeholder="O que ficou combinado com o cliente?"
            className="min-h-20"
            {...form.register('body')}
          />
        </Field>

        <div className="mt-2 flex justify-end">
          <Button type="submit" form={FORM_ID} size="sm" isLoading={create.isPending}>
            Comentar
          </Button>
        </div>
      </form>

      {timeline.isError ? (
        <p role="alert" className="mt-4 text-sm text-lost-400">
          Não foi possível carregar a linha do tempo.
        </p>
      ) : null}

      {timeline.data === undefined ? (
        <p className="mt-4 text-sm text-ink-faint">Carregando o histórico…</p>
      ) : timeline.data.length === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">
          Ainda não há nada registrado neste negócio.
        </p>
      ) : (
        // `<ol>` e não `<ul>`: a ordem é o conteúdo — é ela que conta como a
        // negociação evoluiu.
        <ol className="mt-5 flex flex-col gap-3">
          {timeline.data.map((comment) => (
            <li key={comment.id}>
              {/* A espécie por escrito, para quem não vê a cor nem o ícone. */}
              <span className="sr-only">{COMMENT_KIND_LABELS[comment.kind]}: </span>

              {comment.kind === 'SYSTEM' ? (
                <SystemRecord comment={comment} />
              ) : (
                <UserComment comment={comment} />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
