/**
 * Neutraliza os curingas do `LIKE` dentro do que o usuário digitou.
 *
 * O `contains` do Prisma vira `ILIKE '%termo%'`, e o termo entra no padrão sem
 * tratamento: uma busca por `_` sozinho casaria com **todas** as linhas, porque
 * `_` significa "um caractere qualquer". A barra invertida é o escape padrão do
 * `LIKE` no Postgres, e por isso precisa ser a primeira a ser escapada.
 *
 * Não é questão de segurança — o termo viaja como parâmetro, não concatenado —,
 * é de significado: a busca casa com o que está escrito, como as Layers em
 * memória já fazem com `includes`.
 *
 * Mora fora dos repositórios porque toda busca do CRM precisa dela, e um
 * repositório novo que a esquecesse discordaria em silêncio do seu par em
 * memória — justamente onde não há teste automatizado para ver.
 */
export const escapeLikeWildcards = (term: string): string =>
  term.replace(/[\\%_]/g, (wildcard) => `\\${wildcard}`);
