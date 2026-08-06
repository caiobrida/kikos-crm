import { Schema } from 'effect';

/*
 * Os campos de texto livre dos formulários.
 *
 * Dois hábitos que valem para todo formulário do CRM moram aqui, em vez de
 * serem repetidos campo a campo:
 *
 * 1. **o valor é aparado antes de ser julgado.** "   " não é preenchimento, e
 *    " Juliana " e "Juliana" são o mesmo contato.
 * 2. **um campo opcional em branco significa ausência.** Um `<input>` vazio
 *    manda `""`, e o que precisa chegar ao banco é `NULL` — senão a tela
 *    passaria a ter dois jeitos de dizer "não informado".
 *
 * `Schema.Trim` é uma transformação: o lado codificado é a string crua que veio
 * do formulário ou do JSON, o lado decodificado é ela sem espaços nas pontas.
 * Os filtros encadeados depois dele julgam o valor **já aparado**, e é essa
 * ordem que faz "   " ser recusado como campo vazio.
 */

/**
 * Um campo obrigatório: aparado, não vazio, e com teto de tamanho.
 *
 * A mensagem de campo vazio é escrita por quem declara o campo, porque é ela
 * que aparece embaixo dele na tela: "Informe o nome do contato." diz mais do
 * que qualquer texto genérico que este módulo pudesse inventar.
 */
export const RequiredText = (missing: string, maxLength: number) =>
  Schema.Trim.pipe(
    Schema.minLength(1, { message: () => missing }),
    Schema.maxLength(maxLength, {
      message: () => `São no máximo ${maxLength} caracteres.`,
    }),
  );

/**
 * Um campo opcional: aparado, com o mesmo teto de tamanho, e `undefined` quando
 * ficou em branco.
 *
 * `Schema.transform(de, para, { decode, encode })` é o combinador que descreve
 * uma conversão nos dois sentidos. Em TypeScript comum seriam duas funções
 * soltas — `paraDominio(texto)` e `paraFormulario(valor)` — que ninguém obriga
 * a serem inversas uma da outra. Aqui elas nascem coladas ao tipo: o `decode`
 * lê `""` como ausência, e o `encode` faz o caminho de volta, que é como o
 * valor volta para um `<input>` na tela de edição.
 */
export const OptionalText = (maxLength: number) =>
  Schema.transform(
    Schema.Trim.pipe(
      Schema.maxLength(maxLength, {
        message: () => `São no máximo ${maxLength} caracteres.`,
      }),
    ),
    Schema.UndefinedOr(Schema.String),
    {
      strict: true,
      decode: (trimmed) => (trimmed === '' ? undefined : trimmed),
      encode: (text) => text ?? '',
    },
  );
