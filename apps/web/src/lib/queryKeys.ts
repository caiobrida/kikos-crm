/*
 * As duas raízes de cache do CRM.
 *
 * Elas moram juntas, e num módulo que não importa ninguém, porque **quase toda
 * escrita alcança as duas**: criar um negócio muda o selo do contato, comentar
 * avança a última interação dos dois, mover um card mexe no funil e na carteira,
 * e editar um contato reescreve o nome que aparece em cada card dele.
 *
 * Antes disso as chaves moravam cada uma no seu módulo de consultas, e o de
 * negócios já importava a do contato. A edição de contato fechou o ciclo — ela
 * precisa invalidar o funil —, e um par de módulos que se importam mutuamente é
 * o tipo de coisa que funciona até o dia em que a ordem de avaliação muda.
 *
 * Cada módulo continua dono das chaves **de dentro** da sua raiz: o board, as
 * colunas e o detalhamento em `deals.ts`, a linha do tempo em `comments.ts`, o
 * detalhe do contato em `leads.ts`. O que está aqui é só o prefixo que uma
 * invalidação usa para alcançar tudo de uma vez, sem uma lista de chaves que
 * alguém possa esquecer de atualizar.
 */

/** O prefixo de toda consulta de Lead. */
export const leadsQueryKey = ['leads'] as const;

/** O prefixo de toda consulta de Deal — inclusive da linha do tempo. */
export const dealsQueryKey = ['deals'] as const;
