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

/**
 * O User como ele aparece **dentro** de outro registro: o responsável de um
 * Lead ou de um Deal.
 *
 * Só o que a célula da tabela desenha — o nome vira as iniciais do avatar, e o
 * identificador liga o filtro de vendedor à linha. Carregar e-mail e cargo em
 * cada uma das dez linhas de uma página seria repetir dado que ninguém lê ali.
 */
export const UserSummary = Schema.Struct({
  id: UserId,
  name: Schema.String,
});

export type UserSummary = typeof UserSummary.Type;

/**
 * O recorte pedido a `GET /users` — e a `GET /users/workload`, que é a mesma
 * lista com as contagens da tela de Vendedores.
 *
 * `?role=SELLER` é o que alimenta o filtro de vendedor da lista de Leads, os
 * `<select>` dos formulários e a tela de Vendedores. Sem o parâmetro as duas
 * rotas devolvem o time inteiro.
 */
export const UserListQuery = Schema.Struct({
  role: Schema.optional(UserRole),
});

export type UserListQuery = typeof UserListQuery.Type;

/** O corpo de `GET /users`: o time em ordem alfabética. */
export const UserList = Schema.Array(SessionUser);
export type UserList = typeof UserList.Type;

/**
 * Uma pessoa do time com a carga que ela carrega — o que a tela de Vendedores
 * desenha em cada linha.
 *
 * As duas contagens são **por Owner**, e a distinção é a do CONTEXT.md: a lista
 * é de Users (recortada por `role`, porque a tela se chama Vendedores), e o que
 * se conta é o que está atribuído a cada um. Um gestor que receba contato
 * aparece com a carga dele se a consulta não filtrar papel — `role` é rótulo,
 * não regra de acesso (ADR-0001).
 *
 * **Vem o time inteiro do recorte**, e não só quem tem alguma coisa. É a mesma
 * decisão do `OwnerTally` do dashboard, pelo primeiro dos motivos de lá: quem
 * está sem contato nenhum é justamente o que uma tela de carga precisa mostrar
 * — uma linha zerada é uma resposta, uma linha ausente é um silêncio.
 *
 * Contato e negócio removidos não entram em nenhuma das duas: a remoção é lógica
 * e o filtro mora na camada de repositório, como em toda leitura do CRM. É o que
 * faz estes números baterem com o que a lista de Leads e o board mostram quando
 * alguém filtra por essa mesma pessoa.
 */
export const UserWorkload = Schema.Struct({
  /** A mesma projeção de `GET /users`: sem hash de senha e sem `tokenVersion`. */
  user: SessionUser,
  /** Quantos Leads são dele — o tamanho da carteira. */
  leadCount: Schema.Int,
  /**
   * Quantos Deals **em aberto** são dele.
   *
   * Em aberto quer dizer resultado `OPEN`, e não estágio: um negócio encerrado é
   * história registrada e não é trabalho na mesa de ninguém (ADR-0003). É a
   * mesma leitura de "em aberto" que trava a remoção de um contato.
   */
  openDealCount: Schema.Int,
});

export type UserWorkload = typeof UserWorkload.Type;

/** O corpo de `GET /users/workload`: o time em ordem alfabética, como `/users`. */
export const UserWorkloadList = Schema.Array(UserWorkload);
export type UserWorkloadList = typeof UserWorkloadList.Type;
