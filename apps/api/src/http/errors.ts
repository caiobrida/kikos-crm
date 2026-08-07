import type { DomainError, ValidationIssue } from '@kikos/domain';

/**
 * O corpo de erro que a API devolve. Um formato só para todos os erros, para
 * que o app web tenha um caminho único de leitura.
 */
export interface ErrorBody {
  /** A tag do erro de domínio, como `InvalidCredentials`. */
  readonly error: DomainError['_tag'];
  /** Texto em português, pronto para a tela. */
  readonly message: string;
  /** Presente apenas em `ValidationFailed`, para marcar o campo culpado. */
  readonly issues?: readonly ValidationIssue[];
}

export interface HttpError {
  readonly status: number;
  readonly body: ErrorBody;
}

/**
 * **O único ponto de tradução de erro de domínio para HTTP.**
 *
 * O `switch` é exaustivo sobre a tag, e o `default` atribui o erro a `never`.
 * Isso é o que faz um `Data.TaggedError` novo acrescentado à união `DomainError`
 * **quebrar `tsc --noEmit` no CI** enquanto não for mapeado aqui — em vez de
 * escapar como 500 em produção. É o valor concreto de tratar erro como dado.
 */
export const toHttpError = (error: DomainError): HttpError => {
  switch (error._tag) {
    case 'ValidationFailed':
      return {
        status: 400,
        body: { error: error._tag, message: error.message, issues: error.issues },
      };

    case 'InvalidCredentials':
    case 'Unauthorized':
      return { status: 401, body: { error: error._tag, message: error.message } };

    case 'OwnerNotFound':
    case 'LeadNotFound':
    case 'DealNotFound':
      return { status: 404, body: { error: error._tag, message: error.message } };

    /*
     * 409: o pedido é legítimo, e o que impede é o estado em que o registro
     * está — um conflito com o que já foi registrado. Negócio encerrado não
     * aceita escrita, e reabrir não existe (ADR-0003).
     */
    case 'DealAlreadyClosed':
      return { status: 409, body: { error: error._tag, message: error.message } };

    /*
     * 422, e não 400: a entrada está bem formada e o valor pertence ao
     * vocabulário — o que o CRM recusa é o movimento pedido no funil.
     */
    case 'InvalidStageTransition':
      return { status: 422, body: { error: error._tag, message: error.message } };

    default: {
      const unmapped: never = error;
      throw new Error(
        `Erro de domínio sem mapeamento HTTP: ${JSON.stringify(unmapped)}. ` +
          'Acrescente um `case` em toHttpError.',
      );
    }
  }
};
