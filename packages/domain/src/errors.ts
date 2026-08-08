import { Data, ParseResult } from 'effect';

/*
 * Os erros de domínio, como dados.
 *
 * `Data.TaggedError('X')<{...}>` cria uma classe que é ao mesmo tempo um
 * `Error` comum e um valor discriminado por `_tag`. Em TypeScript comum seria
 * `class InvalidCredentials extends Error { readonly _tag = 'InvalidCredentials' }`,
 * mas com duas diferenças que importam:
 *
 * 1. o `_tag` entra no *tipo* — o compilador sabe que um programa pode falhar
 *    com `InvalidCredentials | Unauthorized` e nada além disso;
 * 2. instâncias com os mesmos campos são iguais por valor (`Equal.equals`),
 *    o que torna a asserção de um teste direta.
 *
 * A tradução para HTTP acontece num único ponto da API, por `switch` exaustivo
 * sobre a tag. Um erro novo acrescentado à união `DomainError` sem mapeamento
 * quebra a verificação de tipos no CI, em vez de virar 500 em produção.
 */

/** Um problema em um campo específico da entrada. */
export interface ValidationIssue {
  /** O caminho do campo, como `email` ou `owner.id`. Vazio se for do corpo todo. */
  readonly path: string;
  readonly message: string;
}

/** A entrada não satisfaz o Schema. → 400 */
export class ValidationFailed extends Data.TaggedError('ValidationFailed')<{
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
}> {}

/**
 * Achata a recusa de um Schema na lista de queixas por campo.
 *
 * O erro de parse do Effect é uma *árvore* — struct, campo, refinamento —, e
 * `ParseResult.ArrayFormatter` a percorre até as folhas. É esta a forma que a
 * API devolve em `issues`, e é a mesma que o resolver do react-hook-form produz
 * do outro lado: por isso a tela sabe pintar o campo culpado sem saber se a
 * recusa veio do navegador ou do servidor.
 */
export const toValidationIssues = (
  error: ParseResult.ParseError,
): readonly ValidationIssue[] =>
  ParseResult.ArrayFormatter.formatErrorSync(error).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

/** E-mail ou senha errados no login. → 401 */
export class InvalidCredentials extends Data.TaggedError('InvalidCredentials')<{
  readonly message: string;
}> {}

/**
 * Não há sessão válida: cookie ausente, token inválido ou expirado, ou token
 * assinado com uma `tokenVersion` que o logout já invalidou. → 401
 */
export class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly message: string;
}> {}

/**
 * O vendedor responsável escolhido não existe. → 404
 *
 * É a queixa que separa o que o Schema alcança do que ele não alcança: que o
 * `ownerId` tem forma de identificador, o formulário confere sozinho; que ele
 * aponta para alguém do time, só o servidor sabe. A tela pode ter carregado a
 * lista de vendedores minutos antes.
 */
export class OwnerNotFound extends Data.TaggedError('OwnerNotFound')<{
  readonly message: string;
}> {}

/**
 * O Lead vinculado não existe — ou foi removido. → 404
 *
 * Como o `OwnerNotFound`, é queixa que só o servidor sabe fazer: o campo de
 * Lead do cadastro foi preenchido escolhendo um contato de uma busca, e a busca
 * pode ter sido feita minutos antes.
 */
export class LeadNotFound extends Data.TaggedError('LeadNotFound')<{
  readonly message: string;
}> {}

/**
 * O negócio não existe — ou foi removido. → 404
 *
 * Nasce das rotas que agem sobre um negócio pelo identificador da URL. Um card
 * que a tela mostra pode ter sido removido por outra pessoa entre o carregar do
 * board e o gesto de quem arrasta.
 */
export class DealNotFound extends Data.TaggedError('DealNotFound')<{
  readonly message: string;
}> {}

/**
 * O movimento pedido não existe no Pipeline. → 422
 *
 * **422, e não 400**: o valor é um estágio legítimo do vocabulário, e o corpo
 * da requisição está bem formado — o que o CRM recusa é o movimento. A queixa
 * nasce de duas situações, e é a mesma regra pura que produz as duas: um
 * negócio que tentou nascer em `CLOSED`, e um card arrastado para a coluna
 * Fechado (ADR-0003).
 */
export class InvalidStageTransition extends Data.TaggedError('InvalidStageTransition')<{
  readonly message: string;
}> {}

/**
 * O negócio já foi encerrado, e negócio encerrado não aceita escrita. → 409
 *
 * **409, e não 422**: o movimento pedido pode até existir no funil; o que
 * impede é o estado em que o negócio está — um conflito com o que já foi
 * registrado. Vale para mover, e valerá para editar e para fechar de novo:
 * reabrir negócio não existe (ADR-0003).
 */
export class DealAlreadyClosed extends Data.TaggedError('DealAlreadyClosed')<{
  readonly message: string;
}> {}

/**
 * O contato tem negócio em aberto, e removê-lo tiraria dinheiro do funil. → 409
 *
 * **409, e não 422**, pelo mesmo critério do `DealAlreadyClosed`: a operação
 * existe e o pedido está bem formado — o que impede é o estado em que o registro
 * está, e ele muda assim que os negócios forem encerrados ou removidos.
 *
 * A frase carrega **quantos** negócios travam a operação, escrita por
 * `leadHasOpenDealsMessage` no domínio: o número é requisito do spec, e pô-lo na
 * mensagem em vez de num campo à parte é o que mantém um formato só para todo
 * erro da API.
 */
export class LeadHasOpenDeals extends Data.TaggedError('LeadHasOpenDeals')<{
  readonly message: string;
}> {}

/**
 * A união de tudo que um programa de domínio pode falhar. Cresce a cada fatia,
 * e é ela que torna o mapa de erro para HTTP verificável pelo compilador.
 */
export type DomainError =
  | ValidationFailed
  | InvalidCredentials
  | Unauthorized
  | OwnerNotFound
  | LeadNotFound
  | DealNotFound
  | InvalidStageTransition
  | DealAlreadyClosed
  | LeadHasOpenDeals;
