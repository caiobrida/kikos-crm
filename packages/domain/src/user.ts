import { Schema } from 'effect';
import { UserRole } from './enums';
import { UserId } from './ids';

/*
 * O e-mail, normalizado no próprio Schema.
 *
 * `Schema.compose(Schema.Trim, Schema.Lowercase)` encadeia duas transformações:
 * o lado codificado é a string crua que chegou do formulário ou do JSON, e o
 * lado decodificado é ela sem espaços nas pontas e em caixa baixa. Normalizar
 * aqui, e não na consulta ao banco, é o que garante que " Rodrigo@Kikos.com.br "
 * digitado no login case com a linha gravada pelo seed.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Email = Schema.compose(Schema.Trim, Schema.Lowercase).pipe(
  Schema.pattern(EMAIL_PATTERN, {
    message: () => 'Informe um e-mail válido.',
    identifier: 'Email',
  }),
);
export type Email = typeof Email.Type;

/**
 * O User como o resto do sistema o enxerga: sem hash de senha e sem
 * `tokenVersion`. É o que `GET /auth/me` devolve e o que a barra lateral mostra
 * no rodapé.
 *
 * O hash nunca aparece num Schema compartilhado de propósito: o pacote de
 * domínio é importado pelo navegador, e um campo que não existe no tipo não tem
 * como vazar por descuido numa rota nova.
 */
export const SessionUser = Schema.Struct({
  id: UserId,
  name: Schema.String,
  email: Email,
  role: UserRole,
});

export type SessionUser = typeof SessionUser.Type;
export type SessionUserEncoded = typeof SessionUser.Encoded;
