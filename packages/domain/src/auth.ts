import { Schema } from 'effect';
import { Email } from './user';

/**
 * O corpo de `POST /auth/login`.
 *
 * Este Schema é o exemplo mais direto do porquê de existir um pacote
 * compartilhado: a API valida a requisição com ele, e o formulário do navegador
 * valida os mesmos campos com o mesmo objeto. As duas pontas não têm como
 * divergir sem quebrar a verificação de tipos.
 */
export const LoginRequest = Schema.Struct({
  email: Email,
  password: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Informe sua senha.' }),
  ),
});

export type LoginRequest = typeof LoginRequest.Type;
export type LoginRequestEncoded = typeof LoginRequest.Encoded;
