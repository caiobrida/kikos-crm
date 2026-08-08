import type { ValidationIssue } from '@kikos/domain';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/*
 * Como uma recusa do servidor vira texto na tela.
 *
 * Todo formulário do CRM tem o mesmo problema: a API pode recusar apontando um
 * campo (`ValidationFailed`, com `issues`) ou recusar em bloco — credencial
 * errada, responsável que não existe mais, servidor fora do ar. O primeiro caso
 * pertence ao campo; o segundo, a um aviso no topo do formulário. Resolver isso
 * uma vez aqui evita que cada tela invente a sua regra — e que uma delas
 * esqueça de tratar o caso em que nem resposta houve.
 */

/** O que a rede devolve quando nem chegou a haver resposta para ler. */
const UNREACHABLE = 'Não foi possível falar com o servidor. Tente de novo.';

/**
 * Os nomes dos campos de um formulário, tirados do **Schema** que o valida.
 *
 * `CreateLeadInput.fields` é o objeto de campos do Schema, e as chaves dele são
 * exatamente os campos que o formulário desenha. Derivá-los daí, em vez de
 * escrever a lista à mão ou tirá-la do objeto de valores iniciais, é o que faz
 * um campo novo no domínio entrar na conta sozinho — e é essa lista que decide
 * se uma recusa da API pertence a um campo ou ao aviso do topo.
 */
export const fieldsOf = <Fields extends object>(
  fields: Fields,
): readonly (keyof Fields & string)[] => Object.keys(fields) as (keyof Fields & string)[];

/** As queixas por campo que a API devolveu, ou nenhuma. */
const issuesOf = (error: unknown): readonly ValidationIssue[] =>
  error instanceof ApiError ? error.issues : [];

/** A mensagem do campo, quando a recusa apontou este campo. */
export const fieldError = (error: unknown, path: string): string | undefined =>
  issuesOf(error).find((issue) => issue.path === path)?.message;

/**
 * O aviso geral do formulário.
 *
 * Só existe quando a recusa **não** é de campo — senão a mesma queixa apareceria
 * duas vezes na tela. E nunca é a mensagem crua de um erro que não veio da API:
 * um `fetch` que falha traz `"Failed to fetch"`, em inglês, escrito para
 * desenvolvedor e não para vendedor.
 */
export const generalError = (
  error: unknown,
  fields: readonly string[],
): string | undefined => {
  if (error === null || error === undefined) return undefined;
  if (!(error instanceof ApiError)) return UNREACHABLE;

  return error.issues.some((issue) => fields.includes(issue.path))
    ? undefined
    : error.message;
};

/**
 * O erro de um campo, como prop do `Field`.
 *
 * `exactOptionalPropertyTypes` proíbe passar `error={undefined}`, então o campo
 * sem erro precisa receber prop nenhuma.
 */
export const errorProp = (message: string | undefined) =>
  message === undefined ? {} : { error: message };

/**
 * Acomoda a recusa da API embaixo dos campos que ela apontou.
 *
 * A queixa da API vem no mesmo formato do resolver — `{ path, message }` —,
 * então ela cai no lugar sem tradução. O que esta função faz é a única parte
 * que precisa de cuidado: **só repassa caminho que é campo do formulário**. Um
 * `path` que a tela não desenha viraria um erro pendurado num campo inexistente,
 * e o formulário nunca mais se daria por válido.
 *
 * O que sobrar — a recusa que não pertence a campo nenhum — é assunto do
 * `generalError`, no aviso do topo.
 */
export const applyApiIssues = <Values extends FieldValues>(
  error: unknown,
  fields: readonly Path<Values>[],
  setError: UseFormSetError<Values>,
): void => {
  for (const issue of issuesOf(error)) {
    const field = fields.find((candidate) => candidate === issue.path);
    if (field !== undefined) setError(field, { message: issue.message });
  }
};
